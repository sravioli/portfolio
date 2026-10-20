using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class MarkdownProcessorTests
{
    private readonly MarkdownProcessor _processor = new();

    [Fact]
    public void Render_StandaloneGithubAttachment_EmbedsControlledVideoAndFallbackLink()
    {
        const string url = "https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b";

        var html = _processor.Render($"<{url}>", PortfolioCatalog.Find("wezterm")!);

        Assert.Contains($"<video src=\"{url}\"", html);
        Assert.Contains("controls", html);
        Assert.Contains("playsinline", html);
        Assert.Contains("preload=\"none\"", html);
        Assert.Contains($"href=\"{url}\">Open video on GitHub</a>", html);
        Assert.DoesNotContain("autoplay", html);
    }

    [Theory]
    [InlineData("[Download](https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b)")]
    [InlineData("See <https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b> for details.")]
    [InlineData("<https://github.com.example.test/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b>")]
    [InlineData("<http://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b>")]
    [InlineData("<https://github.com/user-attachments/assets/not-an-attachment>")]
    [InlineData("![Screenshot](https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b)")]
    public void Render_OtherLinksAndImages_DoesNotEmbedVideo(string markdown)
    {
        var html = _processor.Render(markdown, PortfolioCatalog.RootEntry);

        Assert.DoesNotContain("<video", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Render_UnsafeHtmlAndAttributes_RemovesThem()
    {
        const string markdown = """
            # Safe

            <script>alert(1)</script><iframe src="https://example.test"></iframe>
            <style>.bad{}</style><form name="bad"><video><source src="https://example.test"></video><audio></audio></form>
            <p style="color:red" onclick="alert(1)">Text</p>
            """;

        var html = _processor.Render(markdown, PortfolioCatalog.RootEntry);

        Assert.DoesNotContain("<script", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<iframe", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<style", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<form", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<video", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<audio", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<source", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("style=", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onclick=", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("id=\"readme-safe\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_RelativeResourcesAndRepositoryLinks_RewritesThem()
    {
        const string markdown = """
            [relative](guide.md)

            ![diagram](http://example.test/image.png)

            [project](https://github.com/sravioli/chrono/blob/main/.github/readme.md)
            """;

        var html = _processor.Render(markdown, PortfolioCatalog.Find("chrono")!);

        Assert.Contains("https://github.com/sravioli/chrono/blob/main/.github/guide.md", html);
        Assert.Contains("https://example.test/image.png", html);
        Assert.Contains("loading=\"lazy\"", html);
        Assert.Contains("referrerpolicy=\"no-referrer\"", html);
        Assert.Contains("data-internal-repo=\"chrono\"", html);
        Assert.Contains("title=\"Open chrono here\"", html);
    }

    [Fact]
    public void Render_RelativeImageInGithubDirectory_IncludesMainBranchInRawUrl()
    {
        const string markdown = "![Help mode](./imgs/showcase-mode-help.png)";

        var html = _processor.Render(markdown, PortfolioCatalog.Find("wezterm")!);

        Assert.Contains(
            "src=\"https://raw.githubusercontent.com/sravioli/wezterm/main/.github/imgs/showcase-mode-help.png\"",
            html,
            StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("", "docs/guide.md", "docs/guide.md")]
    [InlineData("nvim", "guide.md", "guide.md")]
    [InlineData("chrono", "../docs/guide%20one.md", "docs/guide%20one.md")]
    [InlineData("chrono", "../../guide.md", "guide.md")]
    [InlineData("chrono", "/docs/./guide.md", "docs/guide.md")]
    [InlineData("nap.wz", "./images/demo.png", "images/demo.png")]
    public void Render_RelativeResources_PreservesRepositoryAndNormalizedPaths(
        string repository, string resource, string expectedPath)
    {
        var html = _processor.Render(
            $"[Document]({resource})\n\n![Image]({resource})",
            PortfolioCatalog.Find(repository)!);
        var expectedRepository = repository.Length == 0 ? "sravioli" : repository;

        Assert.Contains($"href=\"https://github.com/sravioli/{expectedRepository}/blob/main/{expectedPath}\"", html);
        Assert.Contains($"src=\"https://raw.githubusercontent.com/sravioli/{expectedRepository}/main/{expectedPath}\"", html);
    }

    [Fact]
    public void Render_AbsoluteResources_PreservesExternalUrls()
    {
        var html = _processor.Render(
            "[Document](https://example.test/docs/guide.md)\n\n![Image](https://example.test/images/demo.png)",
            PortfolioCatalog.Find("chrono")!);

        Assert.Contains("href=\"https://example.test/docs/guide.md\"", html);
        Assert.Contains("src=\"https://example.test/images/demo.png\"", html);
        Assert.DoesNotContain("data-internal-repo", html);
    }

    [Theory]
    [InlineData("https://github.com/sravioli/chrono")]
    [InlineData("https://github.com/sravioli/chrono/")]
    [InlineData("https://github.com/sravioli/chrono.git")]
    [InlineData("https://github.com/sravioli/chrono/tree/main")]
    [InlineData("https://github.com/sravioli/chrono/blob/main/README.md")]
    [InlineData("https://github.com/sravioli/chrono/blob/main/.github/readme.md")]
    [InlineData("https://GITHUB.COM/SRAVIOLI/chrono.git/TREE/MAIN")]
    public void Render_CatalogRepositoryLinks_PreservesInternalNavigation(string url)
    {
        var html = _processor.Render($"[Project]({url})", PortfolioCatalog.RootEntry);

        Assert.Contains("data-internal-repo=\"chrono\"", html);
        Assert.Contains("title=\"Open chrono here\"", html);
    }

    [Theory]
    [InlineData("https://github.com/sravioli/chrono/issues")]
    [InlineData("https://github.com/sravioli/chrono/tree/develop")]
    [InlineData("https://github.com/sravioli/chrono/blob/main/docs/README.md")]
    [InlineData("https://github.com/sravioli/chrono/blob/main/guide.md")]
    [InlineData("https://github.com/sravioli/unknown")]
    [InlineData("https://github.com/another-owner/chrono")]
    [InlineData("https://github.com.example.test/sravioli/chrono")]
    public void Render_OtherRepositoryLinks_PreservesExternalNavigation(string url)
    {
        var html = _processor.Render($"[Project]({url})", PortfolioCatalog.RootEntry);

        Assert.Contains($"href=\"{url}\"", html);
        Assert.DoesNotContain("data-internal-repo", html);
    }

    [Fact]
    public void Render_DuplicateHeadingSlugs_AreDisambiguated()
    {
        const string markdown = "## Intro\n\n## Intro\n\n[First](#intro)";

        var html = _processor.Render(markdown, PortfolioCatalog.RootEntry);

        Assert.Contains("id=\"readme-intro\"", html);
        Assert.Contains("id=\"readme-intro-1\"", html);
        Assert.Contains("href=\"#readme-intro\"", html);
    }

    [Fact]
    public void Render_MissingHeadingLink_MarksItForTheUserMessage()
    {
        var html = _processor.Render("[Missing](#no-such-heading)", PortfolioCatalog.RootEntry);

        Assert.Contains("data-missing-anchor=\"no-such-heading\"", html);
        Assert.DoesNotContain("href=\"#no-such-heading\"", html);
    }
}
