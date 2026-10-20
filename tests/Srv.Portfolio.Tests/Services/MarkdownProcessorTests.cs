using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class MarkdownProcessorTests
{
    [Test]
    public void RenderStandaloneGithubAttachmentEmbedsControlledVideoAndFallbackLink()
    {
        const string url =
            "https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b";

        var html = MarkdownProcessor.Render($"<{url}>", PortfolioCatalog.Find("wezterm")!);

        Assert.That(html, Does.Contain($"<video src=\"{url}\""));
        Assert.That(html, Does.Contain("controls"));
        Assert.That(html, Does.Contain("playsinline"));
        Assert.That(html, Does.Contain("preload=\"none\""));
        Assert.That(html, Does.Contain($"href=\"{url}\">Open video on GitHub</a>"));
        Assert.That(html, Does.Not.Contain("autoplay"));
    }

    [TestCase(
        "[Download](https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b)"
    )]
    [TestCase(
        "See <https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b> for details."
    )]
    [TestCase(
        "<https://github.com.example.test/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b>"
    )]
    [TestCase("<http://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b>")]
    [TestCase("<https://github.com/user-attachments/assets/not-an-attachment>")]
    [TestCase(
        "![Screenshot](https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b)"
    )]
    public void RenderOtherLinksAndImagesDoesNotEmbedVideo(string markdown)
    {
        var html = MarkdownProcessor.Render(markdown, PortfolioCatalog.RootEntry);

        Assert.That(html, Does.Not.Contain("<video").IgnoreCase);
    }

    [Test]
    public void RenderUnsafeHtmlAndAttributesRemovesThem()
    {
        const string markdown = """
            # Safe

            <script>alert(1)</script><iframe src="https://example.test"></iframe>
            <style>.bad{}</style><form name="bad"><video><source src="https://example.test"></video><audio></audio></form>
            <p style="color:red" onclick="alert(1)">Text</p>
            """;

        var html = MarkdownProcessor.Render(markdown, PortfolioCatalog.RootEntry);

        Assert.That(html, Does.Not.Contain("<script").IgnoreCase);
        Assert.That(html, Does.Not.Contain("<iframe").IgnoreCase);
        Assert.That(html, Does.Not.Contain("<style").IgnoreCase);
        Assert.That(html, Does.Not.Contain("<form").IgnoreCase);
        Assert.That(html, Does.Not.Contain("<video").IgnoreCase);
        Assert.That(html, Does.Not.Contain("<audio").IgnoreCase);
        Assert.That(html, Does.Not.Contain("<source").IgnoreCase);
        Assert.That(html, Does.Not.Contain("style=").IgnoreCase);
        Assert.That(html, Does.Not.Contain("onclick=").IgnoreCase);
        Assert.That(html, Does.Contain("id=\"readme-safe\""));
    }

    [Test]
    public void RenderRelativeResourcesAndRepositoryLinksRewritesThem()
    {
        const string markdown = """
            [relative](guide.md)

            ![diagram](http://example.test/image.png)

            [project](https://github.com/sravioli/chrono/blob/main/.github/readme.md)
            """;

        var html = MarkdownProcessor.Render(markdown, PortfolioCatalog.Find("chrono")!);

        Assert.That(
            html,
            Does.Contain("https://github.com/sravioli/chrono/blob/main/.github/guide.md")
        );
        Assert.That(html, Does.Contain("https://example.test/image.png"));
        Assert.That(html, Does.Contain("loading=\"lazy\""));
        Assert.That(html, Does.Contain("referrerpolicy=\"no-referrer\""));
        Assert.That(html, Does.Contain("data-internal-repo=\"chrono\""));
        Assert.That(html, Does.Contain("title=\"Open chrono here\""));
    }

    [Test]
    public void RenderRelativeImageInGithubDirectoryIncludesMainBranchInRawUrl()
    {
        const string markdown = "![Help mode](./imgs/showcase-mode-help.png)";

        var html = MarkdownProcessor.Render(markdown, PortfolioCatalog.Find("wezterm")!);

        Assert.That(
            html,
            Does.Contain(
                "src=\"https://raw.githubusercontent.com/sravioli/wezterm/main/.github/imgs/showcase-mode-help.png\""
            )
        );
    }

    [TestCase("", "docs/guide.md", "docs/guide.md")]
    [TestCase("nvim", "guide.md", "guide.md")]
    [TestCase("chrono", "../docs/guide%20one.md", "docs/guide%20one.md")]
    [TestCase("chrono", "../../guide.md", "guide.md")]
    [TestCase("chrono", "/docs/./guide.md", "docs/guide.md")]
    [TestCase("nap.wz", "./images/demo.png", "images/demo.png")]
    public void RenderRelativeResourcesPreservesRepositoryAndNormalizedPaths(
        string repository,
        string resource,
        string expectedPath
    )
    {
        ArgumentNullException.ThrowIfNull(repository);
        var html = MarkdownProcessor.Render(
            $"[Document]({resource})\n\n![Image]({resource})",
            PortfolioCatalog.Find(repository)!
        );
        var expectedRepository = repository.Length == 0 ? "sravioli" : repository;

        Assert.That(
            html,
            Does.Contain(
                $"href=\"https://github.com/sravioli/{expectedRepository}/blob/main/{expectedPath}\""
            )
        );
        Assert.That(
            html,
            Does.Contain(
                $"src=\"https://raw.githubusercontent.com/sravioli/{expectedRepository}/main/{expectedPath}\""
            )
        );
    }

    [Test]
    public void RenderAbsoluteResourcesPreservesExternalUrls()
    {
        var html = MarkdownProcessor.Render(
            "[Document](https://example.test/docs/guide.md)\n\n![Image](https://example.test/images/demo.png)",
            PortfolioCatalog.Find("chrono")!
        );

        Assert.That(html, Does.Contain("href=\"https://example.test/docs/guide.md\""));
        Assert.That(html, Does.Contain("src=\"https://example.test/images/demo.png\""));
        Assert.That(html, Does.Not.Contain("data-internal-repo"));
    }

    public static IEnumerable<Uri> CatalogRepositoryLinks { get; } =
    [
        new Uri("https://github.com/sravioli/chrono"),
        new Uri("https://github.com/sravioli/chrono/"),
        new Uri("https://github.com/sravioli/chrono.git"),
        new Uri("https://github.com/sravioli/chrono/tree/main"),
        new Uri("https://github.com/sravioli/chrono/blob/main/README.md"),
        new Uri("https://github.com/sravioli/chrono/blob/main/.github/readme.md"),
        new Uri("https://GITHUB.COM/SRAVIOLI/chrono.git/TREE/MAIN"),
    ];

    [TestCaseSource(nameof(CatalogRepositoryLinks))]
    public void RenderCatalogRepositoryLinksPreservesInternalNavigation(Uri url)
    {
        ArgumentNullException.ThrowIfNull(url);
        var html = MarkdownProcessor.Render(
            $"[Project]({url.OriginalString})",
            PortfolioCatalog.RootEntry
        );

        Assert.That(html, Does.Contain("data-internal-repo=\"chrono\""));
        Assert.That(html, Does.Contain("title=\"Open chrono here\""));
    }

    public static IEnumerable<Uri> OtherRepositoryLinks { get; } =
    [
        new Uri("https://github.com/sravioli/chrono/issues"),
        new Uri("https://github.com/sravioli/chrono/tree/develop"),
        new Uri("https://github.com/sravioli/chrono/blob/main/docs/README.md"),
        new Uri("https://github.com/sravioli/chrono/blob/main/guide.md"),
        new Uri("https://github.com/sravioli/unknown"),
        new Uri("https://github.com/another-owner/chrono"),
        new Uri("https://github.com.example.test/sravioli/chrono"),
    ];

    [TestCaseSource(nameof(OtherRepositoryLinks))]
    public void RenderOtherRepositoryLinksPreservesExternalNavigation(Uri url)
    {
        ArgumentNullException.ThrowIfNull(url);
        var html = MarkdownProcessor.Render(
            $"[Project]({url.OriginalString})",
            PortfolioCatalog.RootEntry
        );

        Assert.That(html, Does.Contain($"href=\"{url.OriginalString}\""));
        Assert.That(html, Does.Not.Contain("data-internal-repo"));
    }

    [Test]
    public void RenderDuplicateHeadingSlugsAreDisambiguated()
    {
        const string markdown = "## Intro\n\n## Intro\n\n[First](#intro)";

        var html = MarkdownProcessor.Render(markdown, PortfolioCatalog.RootEntry);

        Assert.That(html, Does.Contain("id=\"readme-intro\""));
        Assert.That(html, Does.Contain("id=\"readme-intro-1\""));
        Assert.That(html, Does.Contain("href=\"#readme-intro\""));
    }

    [Test]
    public void RenderMissingHeadingLinkMarksItForTheUserMessage()
    {
        var html = MarkdownProcessor.Render(
            "[Missing](#no-such-heading)",
            PortfolioCatalog.RootEntry
        );

        Assert.That(html, Does.Contain("data-missing-anchor=\"no-such-heading\""));
        Assert.That(html, Does.Not.Contain("href=\"#no-such-heading\""));
    }
}
