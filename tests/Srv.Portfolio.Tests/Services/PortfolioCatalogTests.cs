using Srv.Portfolio.Models;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class PortfolioCatalogTests
{
    [Fact]
    public void GetListing_Root_ReturnsReadmeThenProjectsInOrder()
    {
        var names = PortfolioCatalog.GetListing(PortfolioCatalog.RootEntry)
            .Select(item => item.Name);

        Assert.Equal(
            ["README.md", "chrono/", "nvim/", "wezterm/", "wezterm-plugins/"],
            names);
    }

    [Fact]
    public void GetListing_PluginFolder_ReturnsParentReadmeAndAllPlugins()
    {
        var folder = PortfolioCatalog.Find("wezterm-plugins")!;
        var listing = PortfolioCatalog.GetListing(folder);

        Assert.Equal("../", listing[0].Name);
        Assert.Equal("README.md", listing[1].Name);
        Assert.Equal(11, listing.Count - 2);
        Assert.Contains(listing, item => item.Name == "memo.wz" && item.Kind == ExplorerItemKind.ProjectFile);
        Assert.Equal("README.md", PortfolioCatalog.Find("nap.wz")!.ReadmePath);
    }

    [Fact]
    public void GetListing_Nvim_DoesNotInventAReadme()
    {
        var listing = PortfolioCatalog.GetListing(PortfolioCatalog.Find("nvim")!);

        Assert.Single(listing);
        Assert.Equal(ExplorerItemKind.Parent, listing[0].Kind);
    }

    [Fact]
    public void GetAncestry_PluginFile_ReturnsRootToEntry()
    {
        var ancestry = PortfolioCatalog.GetAncestry(PortfolioCatalog.Find("memo.wz")!);

        Assert.Equal(["sravioli", "wezterm-plugins", "memo.wz"], ancestry.Select(entry => entry.Name));
        Assert.True(ancestry[0].IsRoot);
    }

    [Fact]
    public void GetPickMenu_Root_ListsReadmeAndFoldersWithChildIndicators()
    {
        var menu = PortfolioCatalog.GetPickMenu(string.Empty);

        Assert.Equal(["README.md", "chrono", "nvim", "wezterm", "wezterm-plugins"], menu.Select(item => item.Label));
        Assert.Equal(new PickMenuItem("readme:", "README.md", "", "readme", false), menu[0]);
        Assert.True(menu.Single(item => item.Label == "wezterm-plugins").HasChildren);
        Assert.False(menu.Single(item => item.Label == "nvim").HasChildren);
    }

    [Fact]
    public void GetPickMenu_PluginFolder_UsesKeysMatchingBreadcrumbSegments()
    {
        var menu = PortfolioCatalog.GetPickMenu("wezterm-plugins");
        var memo = PortfolioCatalog.Find("memo.wz")!;

        Assert.Contains(menu, item => item.Key == PortfolioCatalog.PickKey(memo) && item.Kind == "file");
        Assert.Equal("readme:wezterm-plugins", menu[0].Key);
        Assert.Empty(PortfolioCatalog.GetPickMenu("missing"));
    }
}
