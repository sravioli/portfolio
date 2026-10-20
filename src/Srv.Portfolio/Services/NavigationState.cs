using Srv.Portfolio.Models;

namespace Srv.Portfolio.Services;

internal sealed class NavigationState
{
    private readonly HashSet<string> _expandedFolders = new(StringComparer.OrdinalIgnoreCase);
    private IReadOnlyList<ExplorerItem>? _entries;
    private string? _message;

    public bool IsWelcome { get; private set; } = true;
    public PortfolioEntry CurrentFolder { get; private set; } = PortfolioCatalog.RootEntry;
    public IReadOnlyList<ExplorerItem> Entries
    {
        get
        {
            if (_entries is not null)
            {
                return _entries;
            }

            var items = new List<ExplorerItem>();
            AddVisibleEntries(PortfolioCatalog.RootEntry, 0, items);
            return _entries = items.AsReadOnly();
        }
    }
    public int SelectedIndex { get; private set; }
    public bool IsReading { get; private set; }
    public bool IsRawView { get; set; }
    public bool IsExplorerOpen { get; set; } = true;
    public bool KeyboardEnabled { get; set; } = true;
    public bool DevNotation { get; set; } = true;
    public string Leader { get; set; } = " ";
    public string LeaderLabel =>
        Leader == " " ? "Space"
        : Leader == "\\" ? "\\"
        : Leader;
    public bool IsHelpOpen { get; set; }
    public bool IsCommandMode { get; set; }
    public string CommandText { get; set; } = string.Empty;

    /// <summary>Message shown in the command line; assigning it shows an informational message.</summary>
    public string? Message
    {
        get => _message;
        set
        {
            _message = value;
            IsErrorMessage = false;
        }
    }

    public bool IsErrorMessage { get; private set; }
    public PortfolioEntry? CurrentDocument { get; private set; }

    /// <summary>Shows an error message in the command line, highlighted like Neovim's ErrorMsg.</summary>
    /// <param name="message">The error to display.</param>
    public void ShowError(string message)
    {
        Message = message;
        IsErrorMessage = true;
    }

    public ExplorerItem SelectedEntry => Entries[Math.Clamp(SelectedIndex, 0, Entries.Count - 1)];

    /// <summary>Enters command mode with the command prefix ready for input, replacing any message.</summary>
    public void BeginCommand()
    {
        IsCommandMode = true;
        CommandText = ":";
        Message = null;
    }

    /// <summary>Leaves command mode and clears the command input.</summary>
    public void EndCommand()
    {
        IsCommandMode = false;
        CommandText = string.Empty;
    }

    /// <summary>Updates keyboard availability and its user-facing feedback.</summary>
    /// <param name="enabled">Whether the portfolio keymaps are enabled.</param>
    public void SetKeyboardEnabled(bool enabled)
    {
        KeyboardEnabled = enabled;
        Message = enabled ? "Keymaps on." : "Keymaps off. Type :set keys to turn them back on.";
    }

    public void SelectIndex(int index)
    {
        SelectedIndex = Math.Clamp(index, 0, Entries.Count - 1);
        Message = null;
    }

    public void MoveSelection(int amount)
    {
        var entries = Entries;
        SelectedIndex = Math.Clamp(SelectedIndex + amount, 0, entries.Count - 1);
    }

    public void SelectEdge(bool last)
    {
        SelectedIndex = last ? Entries.Count - 1 : 0;
    }

    public PortfolioEntry? OpenSelected()
    {
        var item = SelectedEntry;
        switch (item.Kind)
        {
            case ExplorerItemKind.Parent:
                GoToParent();
                return null;
            case ExplorerItemKind.Readme:
            case ExplorerItemKind.ProjectFile:
                CurrentFolder = item.Entry!;
                IsWelcome = false;
                return OpenDocument(item.Entry!);
            case ExplorerItemKind.Folder:
                if (!_expandedFolders.Add(item.Entry!.Repository))
                {
                    _expandedFolders.Remove(item.Entry.Repository);
                }
                _entries = null;
                Message = null;
                return null;
            default:
                return null;
        }
    }

    public PortfolioEntry? GoToParent()
    {
        if (IsReading)
        {
            SelectDocument(CurrentDocument!);
            IsReading = false;
            CurrentDocument = null;
            ResetDocumentView();
            return null;
        }

        CollapseSelected();
        return null;
    }

    public void CloseDocument()
    {
        CurrentDocument = null;
        CurrentFolder = PortfolioCatalog.RootEntry;
        IsReading = false;
        IsWelcome = true;
        IsRawView = false;
        EndCommand();
        Message = null;
    }

    public void CollapseSelected()
    {
        var item = SelectedEntry;
        if (item.Kind == ExplorerItemKind.Folder && item.IsExpanded)
        {
            _expandedFolders.Remove(item.Entry!.Repository);
            _entries = null;
        }
        else if (item.Depth > 0)
        {
            var parent =
                item.Kind == ExplorerItemKind.Readme
                    ? item.Entry
                    : PortfolioCatalog.FindParent(item.Entry!);
            SelectedIndex = Entries
                .ToList()
                .FindIndex(candidate =>
                    candidate.Kind == ExplorerItemKind.Folder && candidate.Entry == parent
                );
        }

        Message = null;
    }

    public PortfolioEntry? NavigateTo(string repository)
    {
        var entry = PortfolioCatalog.Find(repository);
        if (entry is null)
        {
            return null;
        }

        CurrentFolder = entry;
        IsWelcome = false;
        SelectDocument(entry);
        return OpenDocument(entry);
    }

    private PortfolioEntry OpenDocument(PortfolioEntry entry)
    {
        IsReading = true;
        CurrentDocument = entry;
        ResetDocumentView();
        return entry;
    }

    private void ResetDocumentView()
    {
        IsRawView = false;
        Message = null;
    }

    private void SelectDocument(PortfolioEntry entry)
    {
        var ancestor = entry.IsProjectFile ? PortfolioCatalog.FindParent(entry) : entry;
        while (ancestor is not null && !ancestor.IsRoot)
        {
            if (_expandedFolders.Add(ancestor.Repository))
            {
                _entries = null;
            }
            ancestor = PortfolioCatalog.FindParent(ancestor);
        }

        var kind =
            entry.IsProjectFile ? ExplorerItemKind.ProjectFile
            : entry.HasReadme ? ExplorerItemKind.Readme
            : ExplorerItemKind.Folder;
        SelectedIndex = Entries
            .ToList()
            .FindIndex(item => item.Entry == entry && item.Kind == kind);
    }

    private void AddVisibleEntries(PortfolioEntry folder, int depth, List<ExplorerItem> items)
    {
        foreach (var item in PortfolioCatalog.GetContentListing(folder))
        {
            var expanded =
                item.Kind == ExplorerItemKind.Folder
                && _expandedFolders.Contains(item.Entry!.Repository);
            items.Add(item with { Depth = depth, IsExpanded = expanded });
            if (expanded)
            {
                AddVisibleEntries(item.Entry!, depth + 1, items);
            }
        }
    }
}
