using Srv.Portfolio.Models;

namespace Srv.Portfolio.Services;

public static class PortfolioCatalog
{
    private static readonly PortfolioEntry Root = new(
        "sravioli",
        "",
        "Simone Fidanza's projects",
        "README.md",
        [
            Project("chrono", "Zero-dependency benchmarking for Lua."),
            Project("nvim", "My Neovim configuration.", readmePath: null),
            Project("wezterm", "My WezTerm configuration."),
            new PortfolioEntry(
                "wezterm-plugins",
                "wezterm-plugins",
                "WezTerm plugins.",
                null,
                [
                    Plugin("beacon", "Non-blocking update notifications."),
                    Plugin("chord", "Vim-style key mappings and hints."),
                    Plugin("kanagawa", "Kanagawa color schemes for WezTerm."),
                    Plugin("lantern", "Configurable selection menus."),
                    Plugin("log", "Lightweight, pluggable logging."),
                    Plugin("memo", "Memoization, caching, and persistent state."),
                    Plugin("nap", "WezTerm plugin.", "README.md"),
                    Plugin("ribbon", "Styled text segments for WezTerm UI."),
                    Plugin("sigil", "Icons and identity colors."),
                    Plugin("warden", "Schema validation for plugins and configuration."),
                    Plugin("warp", "Utilities for WezTerm.")
                ],
                IsReadmeLocal: true)
        ],
        IsReadmeLocal: true);

    public static PortfolioEntry RootEntry => Root;

    public static PortfolioEntry? Find(string repository)
    {
        if (repository.Length == 0)
        {
            return Root;
        }

        return Descendants(Root).FirstOrDefault(entry =>
            string.Equals(entry.Repository, repository, StringComparison.OrdinalIgnoreCase));
    }

    public static PortfolioEntry? FindParent(PortfolioEntry child) =>
        AllEntries().FirstOrDefault(entry => entry.Children.Contains(child));

    public static IReadOnlyList<ExplorerItem> GetListing(PortfolioEntry folder)
    {
        var items = new List<ExplorerItem>();
        if (!folder.IsRoot)
        {
            items.Add(new ExplorerItem("../", ExplorerItemKind.Parent));
        }

        if (folder.HasReadme)
        {
            items.Add(new ExplorerItem("README.md", ExplorerItemKind.Readme, folder));
        }

        items.AddRange(folder.Children.Select(child => child.IsProjectFile
            ? new ExplorerItem(child.Name, ExplorerItemKind.ProjectFile, child)
            : new ExplorerItem(child.Name + "/", ExplorerItemKind.Folder, child)));
        return items;
    }

    public static IReadOnlyList<string> GetPath(PortfolioEntry entry) =>
        GetAncestry(entry).Select(ancestor => ancestor.Name).ToArray();

    public static IReadOnlyList<PortfolioEntry> GetAncestry(PortfolioEntry entry)
    {
        var entries = new Stack<PortfolioEntry>();
        var current = entry;
        while (!current.IsRoot)
        {
            entries.Push(current);
            current = FindParent(current) ?? Root;
        }

        return new[] { Root }.Concat(entries).ToArray();
    }

    public static string PickKey(PortfolioEntry entry) =>
        (entry.IsProjectFile ? "file:" : "folder:") + entry.Repository;

    public static IReadOnlyList<PickMenuItem> GetPickMenu(string repository)
    {
        var folder = Find(repository);
        if (folder is null)
        {
            return [];
        }

        return GetListing(folder)
            .Where(item => item.Kind != ExplorerItemKind.Parent)
            .Select(item => item.Kind switch
            {
                ExplorerItemKind.Readme => new PickMenuItem(
                    "readme:" + item.Entry!.Repository, item.Name, item.Entry.Repository, "readme", false),
                ExplorerItemKind.ProjectFile => new PickMenuItem(
                    PickKey(item.Entry!), item.Name, item.Entry!.Repository, "file", false),
                _ => new PickMenuItem(
                    PickKey(item.Entry!), item.Entry!.Name, item.Entry.Repository, "folder",
                    item.Entry.HasReadme || item.Entry.Children.Count > 0)
            })
            .ToArray();
    }

    public static IEnumerable<PortfolioEntry> AllEntries() => Descendants(Root).Prepend(Root);

    private static IEnumerable<PortfolioEntry> Descendants(PortfolioEntry parent)
    {
        foreach (var child in parent.Children)
        {
            yield return child;
            foreach (var descendant in Descendants(child))
            {
                yield return descendant;
            }
        }
    }

    private static PortfolioEntry Project(string name, string description, string? readmePath = ".github/readme.md") =>
        new(name, name, description, readmePath, []);

    private static PortfolioEntry Plugin(string name, string description, string readmePath = ".github/readme.md") =>
        new(name + ".wz", name + ".wz", description, readmePath, [], IsProjectFile: true);
}
