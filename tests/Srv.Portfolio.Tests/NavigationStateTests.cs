using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class NavigationStateTests
{
    [Fact]
    public void CloseDocument_FromReadme_RestoresWelcomeAndPreservesExplorer()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        var entries = state.Entries.ToArray();
        var selection = state.SelectedIndex;
        state.IsRawView = true;
        state.IsCommandMode = true;
        state.CommandText = ":help";
        state.Message = "Old message";

        state.CloseDocument();

        Assert.True(state.IsWelcome);
        Assert.False(state.IsReading);
        Assert.Null(state.CurrentDocument);
        Assert.Equal(PortfolioCatalog.RootEntry, state.CurrentFolder);
        Assert.Equal(entries, state.Entries);
        Assert.Equal(selection, state.SelectedIndex);
        Assert.False(state.IsRawView);
        Assert.False(state.IsCommandMode);
        Assert.Empty(state.CommandText);
        Assert.Null(state.Message);

        state.OpenSelected();
        Assert.True(state.IsReading);
        Assert.False(state.IsWelcome);
        Assert.Equal("memo.wz", state.CurrentDocument?.Repository);
    }

    [Fact]
    public void Constructor_InitialState_ShowsWelcomeWithoutOpeningDocument()
    {
        var state = new NavigationState();

        Assert.True(state.IsWelcome);
        Assert.False(state.IsReading);
        Assert.Null(state.CurrentDocument);
        Assert.Equal(PortfolioCatalog.RootEntry, state.CurrentFolder);
    }

    [Fact]
    public void OpenSelected_FromWelcome_OpensReadmeAndDismissesWelcome()
    {
        var state = new NavigationState();

        state.OpenSelected();

        Assert.False(state.IsWelcome);
        Assert.True(state.IsReading);
        Assert.Equal(PortfolioCatalog.RootEntry, state.CurrentDocument);
        state.GoToParent();
        Assert.False(state.IsWelcome);
    }

    [Fact]
    public void OpenSelected_FolderWhileWelcoming_PreservesWelcomeUntilFileOpens()
    {
        var state = new NavigationState();
        state.SelectIndex(1);

        state.OpenSelected();

        Assert.True(state.IsWelcome);
        Assert.False(state.IsReading);
        Assert.Equal(PortfolioCatalog.RootEntry, state.CurrentFolder);
        Assert.Equal("chrono/", state.SelectedEntry.Name);
        Assert.True(state.SelectedEntry.IsExpanded);

        state.SelectIndex(2);
        state.OpenSelected();
        Assert.False(state.IsWelcome);
        Assert.True(state.IsReading);
    }

    [Fact]
    public void GoToParent_FromReadme_ReturnsToFolderWithReadmeSelected()
    {
        var state = new NavigationState();
        state.OpenSelected();

        state.GoToParent();

        Assert.False(state.IsReading);
        Assert.Equal(0, state.SelectedIndex);
        Assert.Equal("README.md", state.SelectedEntry.Name);
    }

    [Fact]
    public void GoToParent_FromExpandedFolder_CollapsesItWithoutReplacingTree()
    {
        var state = new NavigationState();
        state.GoToParent();
        state.SelectIndex(4);
        state.OpenSelected();
        state.GoToParent();

        Assert.Equal(4, state.SelectedIndex);
        Assert.Equal("wezterm-plugins/", state.SelectedEntry.Name);
        Assert.False(state.SelectedEntry.IsExpanded);
        Assert.Equal(5, state.Entries.Count);
    }

    [Fact]
    public void NavigateTo_Nvim_OpensPlaceholderReadme()
    {
        var state = new NavigationState();

        var entry = state.NavigateTo("nvim");

        Assert.Equal("nvim", entry?.Repository);
        Assert.True(state.IsReading);
        Assert.Equal(entry, state.CurrentDocument);
        Assert.False(state.IsWelcome);
    }

    [Fact]
    public void MoveSelection_ClampsAtListingEdges()
    {
        var state = new NavigationState();
        state.GoToParent();

        state.MoveSelection(-1);
        Assert.Equal(0, state.SelectedIndex);

        state.MoveSelection(100);
        Assert.Equal(state.Entries.Count - 1, state.SelectedIndex);
    }

    [Fact]
    public void OpenSelected_PluginFile_OpensItsReadmeAndPreservesParentSelection()
    {
        var state = new NavigationState();
        state.GoToParent();
        state.SelectIndex(4);
        state.OpenSelected();
        state.SelectIndex(state.Entries.ToList().FindIndex(item => item.Name == "memo.wz"));

        state.OpenSelected();

        Assert.Equal("memo.wz", state.CurrentFolder.Name);
        Assert.Equal("memo.wz", state.CurrentDocument?.Repository);
        Assert.True(state.IsReading);
        Assert.Contains(state.Entries, item => item.Name == "chrono/");
        Assert.Contains(state.Entries, item => item.Name == "wezterm-plugins/" && item.IsExpanded);

        state.GoToParent();
        Assert.Equal("memo.wz", state.SelectedEntry.Name);
        state.CollapseSelected();
        Assert.Equal("wezterm-plugins/", state.SelectedEntry.Name);
    }

    [Fact]
    public void OpenSelected_FolderWhileReading_ExpandsInlineAndPreservesDocument()
    {
        var state = new NavigationState();
        state.OpenSelected();
        state.SelectIndex(4);

        var document = state.OpenSelected();

        Assert.Null(document);
        Assert.True(state.IsReading);
        Assert.Equal(PortfolioCatalog.RootEntry, state.CurrentDocument);
        Assert.Equal(PortfolioCatalog.RootEntry, state.CurrentFolder);
        Assert.Equal("wezterm-plugins/", state.SelectedEntry.Name);
        Assert.True(state.SelectedEntry.IsExpanded);
        Assert.Equal(17, state.Entries.Count);
        Assert.Equal(1, state.Entries[5].Depth);
        Assert.Equal("README.md", state.Entries[5].Name);
        Assert.Equal("beacon.wz", state.Entries[6].Name);
        Assert.DoesNotContain(state.Entries, item => item.Name == "../");
    }

    [Fact]
    public void OpenSelected_ExpandedFolder_HidesChildrenAndKeepsOtherFoldersExpanded()
    {
        var state = new NavigationState();
        state.SelectIndex(1);
        state.OpenSelected();
        state.SelectIndex(state.Entries.ToList().FindIndex(item => item.Name == "wezterm-plugins/"));
        state.OpenSelected();
        state.OpenSelected();

        Assert.False(state.SelectedEntry.IsExpanded);
        Assert.DoesNotContain(state.Entries, item => item.Name == "beacon.wz");
        Assert.Contains(state.Entries, item => item.Name == "chrono/" && item.IsExpanded);
        Assert.Equal("README.md", state.Entries[2].Name);
    }

    [Fact]
    public void NavigateTo_HiddenPlugin_ExpandsAncestorsAndSelectsFile()
    {
        var state = new NavigationState();

        state.NavigateTo("memo.wz");

        Assert.True(state.IsReading);
        Assert.Equal("memo.wz", state.SelectedEntry.Name);
        Assert.Equal("memo.wz", state.CurrentDocument?.Repository);
        Assert.Contains(state.Entries, item => item.Name == "wezterm-plugins/" && item.IsExpanded);
        Assert.Contains(state.Entries, item => item.Name == "chrono/");
    }

    [Fact]
    public void CollapseSelected_ChildOfFolder_SelectsThenCollapsesParentWithoutClosingDocument()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");

        state.CollapseSelected();
        Assert.Equal("wezterm-plugins/", state.SelectedEntry.Name);
        Assert.True(state.SelectedEntry.IsExpanded);

        state.CollapseSelected();

        Assert.False(state.SelectedEntry.IsExpanded);
        Assert.True(state.IsReading);
        Assert.Equal("memo.wz", state.CurrentDocument?.Repository);
        Assert.DoesNotContain(state.Entries, item => item.Name == "memo.wz");
        Assert.InRange(state.SelectedIndex, 0, state.Entries.Count - 1);
    }
}
