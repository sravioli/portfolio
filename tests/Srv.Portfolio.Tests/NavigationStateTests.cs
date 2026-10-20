using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class NavigationStateTests
{
    [Theory]
    [InlineData("")]
    [InlineData("chrono")]
    [InlineData("memo.wz")]
    public void OpenSelected_Document_ResetsViewAndPreservesExplorerState(string repository)
    {
        var state = new NavigationState();
        var entry = state.NavigateTo(repository);
        var entries = state.Entries.ToArray();
        var selection = state.SelectedIndex;
        state.IsRawView = true;
        state.Message = "Old message";
        state.IsCommandMode = true;
        state.CommandText = ":help";

        var document = state.OpenSelected();

        Assert.Same(entry, document);
        Assert.Same(entry, state.CurrentDocument);
        Assert.Same(entry, state.CurrentFolder);
        Assert.True(state.IsReading);
        Assert.False(state.IsWelcome);
        Assert.False(state.IsRawView);
        Assert.Null(state.Message);
        Assert.Equal(entries, state.Entries);
        Assert.Equal(selection, state.SelectedIndex);
        Assert.True(state.IsCommandMode);
        Assert.Equal(":help", state.CommandText);
    }

    [Fact]
    public void NavigateTo_UnknownRepository_PreservesExistingState()
    {
        var state = new NavigationState();
        var document = state.NavigateTo("memo.wz");
        var selection = state.SelectedIndex;
        var entries = state.Entries.ToArray();
        state.IsRawView = true;
        state.Message = "Old message";

        var result = state.NavigateTo("missing");

        Assert.Null(result);
        Assert.Same(document, state.CurrentDocument);
        Assert.Same(document, state.CurrentFolder);
        Assert.True(state.IsReading);
        Assert.False(state.IsWelcome);
        Assert.True(state.IsRawView);
        Assert.Equal("Old message", state.Message);
        Assert.Equal(selection, state.SelectedIndex);
        Assert.Equal(entries, state.Entries);
    }

    [Fact]
    public void NavigateTo_AnotherDocument_ResetsViewAndPreservesCommand()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        state.IsRawView = true;
        state.Message = "Old message";
        state.IsCommandMode = true;
        state.CommandText = ":help";

        var document = state.NavigateTo("chrono");

        Assert.Same(document, state.CurrentDocument);
        Assert.Equal("chrono", state.CurrentFolder.Repository);
        Assert.Equal("README.md", state.SelectedEntry.Name);
        Assert.True(state.IsReading);
        Assert.False(state.IsWelcome);
        Assert.False(state.IsRawView);
        Assert.Null(state.Message);
        Assert.True(state.IsCommandMode);
        Assert.Equal(":help", state.CommandText);
        Assert.Contains(state.Entries, item => item.Name == "wezterm-plugins/" && item.IsExpanded);
    }

    [Fact]
    public void BeginCommand_ExistingInput_ReplacesInputWithoutChangingDocumentOrMessage()
    {
        var state = new NavigationState();
        var document = state.NavigateTo("memo.wz");
        state.CommandText = "old input";
        state.Message = "Old message";

        state.BeginCommand();

        Assert.True(state.IsCommandMode);
        Assert.Equal(":", state.CommandText);
        Assert.Same(document, state.CurrentDocument);
        Assert.Equal("Old message", state.Message);
    }

    [Fact]
    public void EndCommand_ActiveCommand_ClearsInputWithoutChangingDocumentOrMessage()
    {
        var state = new NavigationState();
        var document = state.NavigateTo("memo.wz");
        state.BeginCommand();
        state.CommandText = ":help";
        state.Message = "Old message";

        state.EndCommand();

        Assert.False(state.IsCommandMode);
        Assert.Empty(state.CommandText);
        Assert.Same(document, state.CurrentDocument);
        Assert.Equal("Old message", state.Message);
    }

    [Theory]
    [InlineData(true, "Keymaps on.")]
    [InlineData(false, "Keymaps off. Type :set keys to turn them back on.")]
    public void SetKeyboardEnabled_RequestedValue_UpdatesFeedbackWithoutClearingCommand(bool enabled, string message)
    {
        var state = new NavigationState { KeyboardEnabled = !enabled };
        state.BeginCommand();
        state.CommandText = ":help";

        state.SetKeyboardEnabled(enabled);

        Assert.Equal(enabled, state.KeyboardEnabled);
        Assert.Equal(message, state.Message);
        Assert.True(state.IsCommandMode);
        Assert.Equal(":help", state.CommandText);
    }

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
