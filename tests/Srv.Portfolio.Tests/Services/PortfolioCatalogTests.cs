using Srv.Portfolio.Models;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class PortfolioCatalogTests
{
    [Test]
    public void GetListingRootReturnsReadmeThenProjectsInOrder()
    {
        var names = PortfolioCatalog
            .GetListing(PortfolioCatalog.RootEntry)
            .Select(item => item.Name);

        Assert.That(
            names,
            Is.EqualTo(
                new object?[] { "README.md", "chrono/", "nvim/", "wezterm/", "wezterm-plugins/" }
            )
        );
    }

    [Test]
    public void GetListingPluginFolderReturnsParentReadmeAndAllPlugins()
    {
        var folder = PortfolioCatalog.Find("wezterm-plugins")!;
        var listing = PortfolioCatalog.GetListing(folder);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(listing[0].Name, Is.EqualTo("../"));
            Assert.That(listing[1].Name, Is.EqualTo("README.md"));
            Assert.That(listing.Count - 2, Is.EqualTo(11));
            Assert.That(
                listing.Any(item =>
                    item.Name == "memo.wz" && item.Kind == ExplorerItemKind.ProjectFile
                ),
                Is.True
            );
            Assert.That(PortfolioCatalog.Find("nap.wz")!.ReadmePath, Is.EqualTo("README.md"));
        }
    }

    [Test]
    public void GetListingNvimDoesNotInventAReadme()
    {
        var listing = PortfolioCatalog.GetListing(PortfolioCatalog.Find("nvim")!);

        Assert.That(listing, Has.Count.EqualTo(1));
        Assert.That(listing[0].Kind, Is.EqualTo(ExplorerItemKind.Parent));
    }

    [Test]
    public void GetAncestryPluginFileReturnsRootToEntry()
    {
        var ancestry = PortfolioCatalog.GetAncestry(PortfolioCatalog.Find("memo.wz")!);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                ancestry.Select(entry => entry.Name),
                Is.EqualTo(new object?[] { "sravioli", "wezterm-plugins", "memo.wz" })
            );
            Assert.That(ancestry[0].IsRoot, Is.True);
        }
    }

    [Test]
    public void GetPickMenuRootListsReadmeAndFoldersWithChildIndicators()
    {
        var menu = PortfolioCatalog.GetPickMenu(string.Empty);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                menu.Select(item => item.Label),
                Is.EqualTo(
                    new object?[] { "README.md", "chrono", "nvim", "wezterm", "wezterm-plugins" }
                )
            );
            Assert.That(
                menu[0],
                Is.EqualTo(new PickMenuItem("readme:", "README.md", "", "readme", false))
            );
            Assert.That(menu.Single(item => item.Label == "wezterm-plugins").HasChildren, Is.True);
            Assert.That(menu.Single(item => item.Label == "nvim").HasChildren, Is.False);
        }
    }

    [Test]
    public void GetPickMenuPluginFolderUsesKeysMatchingBreadcrumbSegments()
    {
        var menu = PortfolioCatalog.GetPickMenu("wezterm-plugins");
        var memo = PortfolioCatalog.Find("memo.wz")!;

        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                menu.Any(item => item.Key == PortfolioCatalog.PickKey(memo) && item.Kind == "file"),
                Is.True
            );
            Assert.That(menu[0].Key, Is.EqualTo("readme:wezterm-plugins"));
            Assert.That(PortfolioCatalog.GetPickMenu("missing"), Is.Empty);
        }
    }
}
