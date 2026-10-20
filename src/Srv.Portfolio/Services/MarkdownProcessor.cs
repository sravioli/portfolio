using System.Text.RegularExpressions;
using AngleSharp.Dom;
using AngleSharp.Html.Parser;
using Ganss.Xss;
using Markdig;
using Srv.Portfolio.Models;

namespace Srv.Portfolio.Services;

public sealed class MarkdownProcessor
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .Build();

    public string Render(string source, PortfolioEntry entry)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(entry);

        var parser = new HtmlParser();
        var document = parser.ParseDocument(Markdown.ToHtml(source, Pipeline));
        RewriteResourceUrls(document, entry);

        var sanitizer = new HtmlSanitizer();
        sanitizer.AllowedTags.Clear();
        sanitizer.AllowedTags.UnionWith(
        [
            "a", "abbr", "b", "blockquote", "br", "code", "del", "dd", "div", "dl", "dt",
            "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol",
            "p", "pre", "s", "span", "strong", "sub", "sup", "table", "tbody", "td",
            "th", "thead", "tr", "ul"
        ]);
        sanitizer.AllowedAttributes.Clear();
        sanitizer.AllowedAttributes.UnionWith(["alt", "class", "href", "src", "title"]);
        sanitizer.AllowedSchemes.Clear();
        sanitizer.AllowedSchemes.UnionWith(["http", "https", "mailto"]);

        var safeDocument = parser.ParseDocument(sanitizer.Sanitize(document.Body?.InnerHtml ?? string.Empty));
        EmbedAttachmentVideos(safeDocument);
        AddHeadingIdsAndResolveAnchors(safeDocument);
        MarkInternalRepositoryLinks(safeDocument);
        foreach (var image in safeDocument.QuerySelectorAll("img"))
        {
            image.SetAttribute("loading", "lazy");
            image.SetAttribute("referrerpolicy", "no-referrer");
        }

        return safeDocument.Body?.InnerHtml ?? string.Empty;
    }

    private static void EmbedAttachmentVideos(IDocument document)
    {
        foreach (var anchor in document.QuerySelectorAll("p > a[href]"))
        {
            var href = anchor.GetAttribute("href")!;
            var paragraph = anchor.ParentElement!;
            if (paragraph.Children.Length != 1 ||
                !string.Equals(paragraph.TextContent.Trim(), href, StringComparison.Ordinal) ||
                anchor.Children.Length != 0 ||
                !Uri.TryCreate(href, UriKind.Absolute, out var uri) ||
                uri.Scheme != Uri.UriSchemeHttps ||
                !uri.Host.Equals(GitHubUrls.Host, StringComparison.OrdinalIgnoreCase) ||
                !Regex.IsMatch(uri.AbsolutePath,
                    @"^/user-attachments/assets/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"))
            {
                continue;
            }

            var video = document.CreateElement("video");
            video.SetAttribute("src", href);
            video.SetAttribute("controls", string.Empty);
            video.SetAttribute("playsinline", string.Empty);
            video.SetAttribute("preload", "none");
            video.SetAttribute("aria-label", "README video");
            paragraph.InsertBefore(video, anchor);
            paragraph.InsertBefore(document.CreateElement("br"), anchor);
            anchor.TextContent = "Open video on GitHub";
        }
    }

    private static void RewriteResourceUrls(IDocument document, PortfolioEntry entry)
    {
        foreach (var anchor in document.QuerySelectorAll("a[href]"))
        {
            var href = anchor.GetAttribute("href")!;
            if (href.StartsWith('#'))
            {
                continue;
            }

            anchor.SetAttribute("href", ResolveUrl(entry, href, image: false));
        }

        foreach (var image in document.QuerySelectorAll("img[src]"))
        {
            var source = ResolveUrl(entry, image.GetAttribute("src")!, image: true);
            if (!Uri.TryCreate(source, UriKind.Absolute, out var uri) ||
                !(uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
                  uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
            {
                image.RemoveAttribute("src");
                continue;
            }

            if (uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
            {
                source = new UriBuilder(uri) { Scheme = Uri.UriSchemeHttps, Port = -1 }.Uri.AbsoluteUri;
            }

            image.SetAttribute("src", source);
        }
    }

    private static string ResolveUrl(PortfolioEntry entry, string value, bool image)
    {
        if (Uri.TryCreate(value, UriKind.Absolute, out var absolute))
        {
            return absolute.ToString();
        }

        var repository = entry.IsRoot ? GitHubUrls.Owner : entry.Repository;
        var readmeDirectory = entry.ReadmePath is null
            ? string.Empty
            : Path.GetDirectoryName(entry.ReadmePath)?.Replace('\\', '/') ?? string.Empty;
        var relativePath = value.StartsWith('/')
            ? value.TrimStart('/')
            : string.Join('/', new[] { readmeDirectory, value }.Where(segment => segment.Length > 0));
        var path = NormalizeRepositoryPath(relativePath);
        return image ? GitHubUrls.RawFile(repository, path) : GitHubUrls.File(repository, path);
    }

    private static string NormalizeRepositoryPath(string path)
    {
        var segments = new List<string>();
        foreach (var segment in path.Split('/'))
        {
            if (segment is "" or ".")
            {
                continue;
            }

            if (segment == "..")
            {
                if (segments.Count > 0)
                {
                    segments.RemoveAt(segments.Count - 1);
                }

                continue;
            }

            segments.Add(Uri.EscapeDataString(Uri.UnescapeDataString(segment)));
        }

        return string.Join('/', segments);
    }

    private static void AddHeadingIdsAndResolveAnchors(IDocument document)
    {
        var slugs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var heading in document.QuerySelectorAll("h1,h2,h3,h4,h5,h6"))
        {
            var baseSlug = Slugify(heading.TextContent);
            counts.TryGetValue(baseSlug, out var count);
            counts[baseSlug] = count + 1;
            var slug = count == 0 ? baseSlug : $"{baseSlug}-{count}";
            heading.SetAttribute("id", "readme-" + slug);
            slugs.TryAdd(baseSlug, "readme-" + baseSlug);
        }

        foreach (var anchor in document.QuerySelectorAll("a[href^='#']"))
        {
            var target = anchor.GetAttribute("href")![1..];
            var normalized = Slugify(Uri.UnescapeDataString(target));
            if (slugs.TryGetValue(normalized, out var id))
            {
                anchor.SetAttribute("href", "#" + id);
            }
            else
            {
                anchor.SetAttribute("data-missing-anchor", normalized);
                anchor.RemoveAttribute("href");
            }
        }
    }

    private static void MarkInternalRepositoryLinks(IDocument document)
    {
        foreach (var anchor in document.QuerySelectorAll("a[href]"))
        {
            if (TryGetRepository(anchor.GetAttribute("href")!, out var repository) &&
                PortfolioCatalog.Find(repository) is not null)
            {
                anchor.SetAttribute("data-internal-repo", repository);
                anchor.SetAttribute("title", $"Open {repository} here");
            }
        }
    }

    private static bool TryGetRepository(string href, out string repository)
    {
        repository = string.Empty;
        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri) ||
            !uri.Host.Equals(GitHubUrls.Host, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var segments = uri.AbsolutePath.Trim('/').Split('/');
        if (segments.Length < 2 || !segments[0].Equals(GitHubUrls.Owner, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var name = segments[1..];
        var repositoryName = name[0];
        if (repositoryName.EndsWith(".git", StringComparison.OrdinalIgnoreCase))
        {
            repositoryName = repositoryName[..^4];
        }

        if (name.Length == 1)
        {
            repository = repositoryName;
            return true;
        }

        if (name.Length == 3 && name[1].Equals("tree", StringComparison.OrdinalIgnoreCase) &&
            name[2].Equals(GitHubUrls.Branch, StringComparison.OrdinalIgnoreCase))
        {
            repository = repositoryName;
            return true;
        }

        if (name.Length == 4 && name[1].Equals("blob", StringComparison.OrdinalIgnoreCase) &&
            name[2].Equals(GitHubUrls.Branch, StringComparison.OrdinalIgnoreCase) &&
            name[3].Equals("README.md", StringComparison.OrdinalIgnoreCase))
        {
            repository = repositoryName;
            return true;
        }

        if (name.Length == 5 && name[1].Equals("blob", StringComparison.OrdinalIgnoreCase) &&
            name[2].Equals(GitHubUrls.Branch, StringComparison.OrdinalIgnoreCase) &&
            name[3].Equals(".github", StringComparison.OrdinalIgnoreCase) &&
            name[4].Equals("readme.md", StringComparison.OrdinalIgnoreCase))
        {
            repository = repositoryName;
            return true;
        }

        return false;
    }

    private static string Slugify(string text)
    {
        var normalized = Regex.Replace(text.Trim().ToLowerInvariant(), @"[^\p{L}\p{Nd}]+", "-").Trim('-');
        return normalized.Length == 0 ? "section" : normalized;
    }
}
