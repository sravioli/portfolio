namespace Srv.Portfolio.Models;

public sealed record PortfolioEntry(
    string Name,
    string Repository,
    string Description,
    string? ReadmePath,
    IReadOnlyList<PortfolioEntry> Children,
    bool IsProjectFile = false,
    bool IsReadmeLocal = false
)
{
    public bool HasReadme => ReadmePath is not null || IsReadmeLocal;
    public bool IsRoot => Repository.Length == 0;
}

public sealed record ExplorerItem(
    string Name,
    ExplorerItemKind Kind,
    PortfolioEntry? Entry = null,
    int Depth = 0,
    bool IsExpanded = false
);

public enum ExplorerItemKind
{
    Parent,
    Readme,
    Folder,
    ProjectFile,
}
