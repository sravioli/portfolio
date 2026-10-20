using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class KeymapHandlerTests
{
    [Fact]
    public void Handle_LeaderFF_OpensFileFinderWithoutChangingCurrentDocument()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        var previousIndex = state.SelectedIndex;

        var result = new KeymapHandler().Handle(state, "<leader>ff");

        Assert.Equal(KeyAction.OpenFileFinder, result);
        Assert.Equal("memo.wz", state.CurrentDocument?.Repository);
        Assert.Equal(previousIndex, state.SelectedIndex);
        Assert.True(state.IsReading);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Handle_LeaderFFWhenUnavailable_DoesNotOpenFileFinder(bool helpOpen, bool keyboardDisabled)
    {
        var state = new NavigationState { IsHelpOpen = helpOpen, KeyboardEnabled = !keyboardDisabled };

        Assert.Equal(KeyAction.Ignored, new KeymapHandler().Handle(state, "<leader>ff"));
    }

    [Fact]
    public void Handle_EnterOnFolderWhileReading_TogglesInlineAndKeepsExplorerFocus()
    {
        var state = new NavigationState();
        state.OpenSelected();
        state.SelectIndex(4);

        var result = new KeymapHandler().Handle(state, "Enter", explorerFocused: true);

        Assert.Equal(KeyAction.FocusExplorer, result);
        Assert.True(state.SelectedEntry.IsExpanded);
        Assert.Equal(PortfolioCatalog.RootEntry, state.CurrentDocument);
        Assert.True(state.IsReading);
    }

    [Fact]
    public void Handle_HInFocusedExplorer_CollapsesFolderWithoutClosingDocument()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        var handler = new KeymapHandler();

        handler.Handle(state, "h", explorerFocused: true);
        var result = handler.Handle(state, "h", explorerFocused: true);

        Assert.Equal(KeyAction.FocusExplorer, result);
        Assert.Equal("wezterm-plugins/", state.SelectedEntry.Name);
        Assert.False(state.SelectedEntry.IsExpanded);
        Assert.True(state.IsReading);
    }

    [Fact]
    public void Handle_LeaderE_FocusesExplorerWithoutClosingReadme()
    {
        var state = new NavigationState();
        state.OpenSelected();

        var result = new KeymapHandler().Handle(state, "<leader>e");

        Assert.Equal(KeyAction.FocusExplorer, result);
        Assert.True(state.IsReading);
        Assert.Equal(PortfolioCatalog.RootEntry, state.CurrentDocument);
    }

    [Theory]
    [InlineData("j", 1)]
    [InlineData("ArrowDown", 1)]
    [InlineData("G", 4)]
    public void Handle_ExplorerFocusedWhileReading_MovesSelectionInsteadOfScrolling(string key, int expected)
    {
        var state = new NavigationState();
        state.OpenSelected();

        var result = new KeymapHandler().Handle(state, key, explorerFocused: true);

        Assert.Equal(KeyAction.Changed, result);
        Assert.Equal(expected, state.SelectedIndex);
        Assert.True(state.IsReading);
    }

    [Fact]
    public void Handle_PreviewFocusedWhileReading_ScrollsInsteadOfMovingSelection()
    {
        var state = new NavigationState();
        state.OpenSelected();

        var result = new KeymapHandler().Handle(state, "j");

        Assert.Equal(KeyAction.ScrollDown, result);
        Assert.Equal(0, state.SelectedIndex);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Handle_LeaderEWhenUnavailable_DoesNotFocusExplorer(bool helpOpen, bool keyboardDisabled)
    {
        var state = new NavigationState { IsHelpOpen = helpOpen, KeyboardEnabled = !keyboardDisabled };

        var result = new KeymapHandler().Handle(state, "<leader>e");

        Assert.Equal(KeyAction.Ignored, result);
    }

    [Fact]
    public void Handle_JAndKInExplorer_MovesSelection()
    {
        var state = new NavigationState();
        state.GoToParent();
        var handler = new KeymapHandler();

        handler.Handle(state, "j");
        handler.Handle(state, "k");

        Assert.Equal(0, state.SelectedIndex);
    }

    [Fact]
    public void Handle_GGInExplorer_SelectsFirstEntry()
    {
        var state = new NavigationState();
        state.GoToParent();
        state.MoveSelection(3);
        var handler = new KeymapHandler();

        handler.Handle(state, "g");
        var result = handler.Handle(state, "g");

        Assert.Equal(KeyAction.Changed, result);
        Assert.Equal(0, state.SelectedIndex);
    }

    [Fact]
    public void Handle_PInReadme_TogglesRawView()
    {
        var state = new NavigationState();
        state.OpenSelected();
        var handler = new KeymapHandler();

        handler.Handle(state, "p");

        Assert.True(state.IsRawView);
    }

    [Fact]
    public void Handle_WhenKeyboardIsDisabled_DoesNotChangeState()
    {
        var state = new NavigationState { KeyboardEnabled = false };
        var handler = new KeymapHandler();

        var result = handler.Handle(state, "p");

        Assert.Equal(KeyAction.Ignored, result);
        Assert.False(state.IsRawView);
    }

    [Fact]
    public void Handle_ColonWhenKeyboardIsDisabled_StillEntersCommandMode()
    {
        var state = new NavigationState { KeyboardEnabled = false };

        var result = new KeymapHandler().Handle(state, ":");

        Assert.Equal(KeyAction.FocusCommand, result);
        Assert.True(state.IsCommandMode);
        Assert.Equal(":", state.CommandText);
    }

    [Fact]
    public void Handle_GxSequence_FollowsLinkWhileReadingOrOnWelcome()
    {
        var reading = new NavigationState();
        reading.OpenSelected();
        var welcome = new NavigationState();
        var closed = new NavigationState();
        closed.OpenSelected();
        closed.GoToParent();

        Assert.Equal(KeyAction.FollowLink, new KeymapHandler().Handle(reading, "gx"));
        Assert.Equal(KeyAction.FollowLink, new KeymapHandler().Handle(welcome, "gx"));
        Assert.Equal(KeyAction.Ignored, new KeymapHandler().Handle(closed, "gx"));
    }

    [Fact]
    public void Handle_GxOnWelcome_FollowsLink()
    {
        var state = new NavigationState();
        var handler = new KeymapHandler();

        handler.Handle(state, "g");
        var result = handler.Handle(state, "x");

        Assert.True(state.IsWelcome);
        Assert.Equal(KeyAction.FollowLink, result);
    }

    [Fact]
    public void Handle_Colon_EntersCommandModeWithColonPrefilled()
    {
        var state = new NavigationState();
        var handler = new KeymapHandler();

        var result = handler.Handle(state, ":");

        Assert.Equal(KeyAction.FocusCommand, result);
        Assert.True(state.IsCommandMode);
        Assert.Equal(":", state.CommandText);
    }
}
