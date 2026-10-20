using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class KeymapHandlerTests
{
    [Test]
    public void HandleLeaderFFOpensFileFinderWithoutChangingCurrentDocument()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        var previousIndex = state.SelectedIndex;

        var result = new KeymapHandler().Handle(state, "<leader>ff");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.OpenFileFinder));
            Assert.That(state.CurrentDocument?.Repository, Is.EqualTo("memo.wz"));
            Assert.That(state.SelectedIndex, Is.EqualTo(previousIndex));
            Assert.That(state.IsReading, Is.True);
        }
    }

    [TestCase(true, false)]
    [TestCase(false, true)]
    public void HandleLeaderFFWhenUnavailableDoesNotOpenFileFinder(
        bool helpOpen,
        bool keyboardDisabled
    )
    {
        var state = new NavigationState
        {
            IsHelpOpen = helpOpen,
            KeyboardEnabled = !keyboardDisabled,
        };

        Assert.That(new KeymapHandler().Handle(state, "<leader>ff"), Is.EqualTo(KeyAction.Ignored));
    }

    [Test]
    public void HandleEnterOnFolderWhileReadingTogglesInlineAndKeepsExplorerFocus()
    {
        var state = new NavigationState();
        state.OpenSelected();
        state.SelectIndex(4);

        var result = new KeymapHandler().Handle(state, "Enter", explorerFocused: true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.FocusExplorer));
            Assert.That(state.SelectedEntry.IsExpanded, Is.True);
            Assert.That(state.CurrentDocument, Is.EqualTo(PortfolioCatalog.RootEntry));
            Assert.That(state.IsReading, Is.True);
        }
    }

    [Test]
    public void HandleHInFocusedExplorerCollapsesFolderWithoutClosingDocument()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        var handler = new KeymapHandler();

        handler.Handle(state, "h", explorerFocused: true);
        var result = handler.Handle(state, "h", explorerFocused: true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.FocusExplorer));
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("wezterm-plugins/"));
            Assert.That(state.SelectedEntry.IsExpanded, Is.False);
            Assert.That(state.IsReading, Is.True);
        }
    }

    [Test]
    public void HandleLeaderEFocusesExplorerWithoutClosingReadme()
    {
        var state = new NavigationState();
        state.OpenSelected();

        var result = new KeymapHandler().Handle(state, "<leader>e");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.FocusExplorer));
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.CurrentDocument, Is.EqualTo(PortfolioCatalog.RootEntry));
        }
    }

    [TestCase("j", 1)]
    [TestCase("ArrowDown", 1)]
    [TestCase("G", 4)]
    public void HandleExplorerFocusedWhileReadingMovesSelectionInsteadOfScrolling(
        string key,
        int expected
    )
    {
        var state = new NavigationState();
        state.OpenSelected();

        var result = new KeymapHandler().Handle(state, key, explorerFocused: true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.Changed));
            Assert.That(state.SelectedIndex, Is.EqualTo(expected));
            Assert.That(state.IsReading, Is.True);
        }
    }

    [Test]
    public void HandlePreviewFocusedWhileReadingScrollsInsteadOfMovingSelection()
    {
        var state = new NavigationState();
        state.OpenSelected();

        var result = new KeymapHandler().Handle(state, "j");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.ScrollDown));
            Assert.That(state.SelectedIndex, Is.Zero);
        }
    }

    [TestCase(true, false)]
    [TestCase(false, true)]
    public void HandleLeaderEWhenUnavailableDoesNotFocusExplorer(
        bool helpOpen,
        bool keyboardDisabled
    )
    {
        var state = new NavigationState
        {
            IsHelpOpen = helpOpen,
            KeyboardEnabled = !keyboardDisabled,
        };

        var result = new KeymapHandler().Handle(state, "<leader>e");

        Assert.That(result, Is.EqualTo(KeyAction.Ignored));
    }

    [Test]
    public void HandleJAndKInExplorerMovesSelection()
    {
        var state = new NavigationState();
        state.GoToParent();
        var handler = new KeymapHandler();

        handler.Handle(state, "j");
        handler.Handle(state, "k");

        Assert.That(state.SelectedIndex, Is.Zero);
    }

    [Test]
    public void HandleGGInExplorerSelectsFirstEntry()
    {
        var state = new NavigationState();
        state.GoToParent();
        state.MoveSelection(3);
        var handler = new KeymapHandler();

        handler.Handle(state, "g");
        var result = handler.Handle(state, "g");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.Changed));
            Assert.That(state.SelectedIndex, Is.Zero);
        }
    }

    [Test]
    public void HandlePInReadmeTogglesRawView()
    {
        var state = new NavigationState();
        state.OpenSelected();
        var handler = new KeymapHandler();

        handler.Handle(state, "p");

        Assert.That(state.IsRawView, Is.True);
    }

    [Test]
    public void HandleWhenKeyboardIsDisabledDoesNotChangeState()
    {
        var state = new NavigationState { KeyboardEnabled = false };
        var handler = new KeymapHandler();

        var result = handler.Handle(state, "p");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.Ignored));
            Assert.That(state.IsRawView, Is.False);
        }
    }

    [Test]
    public void HandleColonWhenKeyboardIsDisabledStillEntersCommandMode()
    {
        var state = new NavigationState { KeyboardEnabled = false };

        var result = new KeymapHandler().Handle(state, ":");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.FocusCommand));
            Assert.That(state.IsCommandMode, Is.True);
            Assert.That(state.CommandText, Is.EqualTo(":"));
        }
    }

    [Test]
    public void HandleGxSequenceFollowsLinkWhileReadingOrOnWelcome()
    {
        var reading = new NavigationState();
        reading.OpenSelected();
        var welcome = new NavigationState();
        var closed = new NavigationState();
        closed.OpenSelected();
        closed.GoToParent();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                new KeymapHandler().Handle(reading, "gx"),
                Is.EqualTo(KeyAction.FollowLink)
            );
            Assert.That(
                new KeymapHandler().Handle(welcome, "gx"),
                Is.EqualTo(KeyAction.FollowLink)
            );
            Assert.That(new KeymapHandler().Handle(closed, "gx"), Is.EqualTo(KeyAction.Ignored));
        }
    }

    [Test]
    public void HandleGxOnWelcomeFollowsLink()
    {
        var state = new NavigationState();
        var handler = new KeymapHandler();

        handler.Handle(state, "g");
        var result = handler.Handle(state, "x");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsWelcome, Is.True);
            Assert.That(result, Is.EqualTo(KeyAction.FollowLink));
        }
    }

    [Test]
    public void HandleColonEntersCommandModeWithColonPrefilled()
    {
        var state = new NavigationState();
        var handler = new KeymapHandler();

        var result = handler.Handle(state, ":");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.FocusCommand));
            Assert.That(state.IsCommandMode, Is.True);
            Assert.That(state.CommandText, Is.EqualTo(":"));
        }
    }
}
