using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class CommandHandlerTests
{
    [TestCase(":NvimTreeToggle", true, false)]
    [TestCase(":NvimTreeToggle", false, true)]
    [TestCase(":NvimTreeOpen", false, true)]
    [TestCase(":NvimTreeClose", true, false)]
    [TestCase(":nvimtreeclose", true, false)]
    public void HandleNvimTreeCommandsSetExplorer(string command, bool initiallyOpen, bool expected)
    {
        var state = new NavigationState { IsExplorerOpen = initiallyOpen, IsCommandMode = true };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.SetExplorer));
            Assert.That(state.IsExplorerOpen, Is.EqualTo(expected));
            Assert.That(state.IsCommandMode, Is.False);
        }
    }
    [Test]
    public void NavigationStateDefaultLeaderIsSpace()
    {
        var state = new NavigationState();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.Leader, Is.EqualTo(" "));
            Assert.That(state.LeaderLabel, Is.EqualTo("Space"));
        }
    }

    [TestCase(":let mapleader = \" \"", " ")]
    [TestCase(":let mapleader=','", ",")]
    [TestCase(":let g:mapleader = \";\"", ";")]
    [TestCase(":lua vim.g.mapleader = \",\"", ",")]
    [TestCase(":let mapleader = \"<Space>\"", " ")]
    [TestCase(":let mapleader = \"<Bslash>\"", "\\")]
    [TestCase(":let mapleader = \"\\\\\"", "\\")]
    public void HandleLeaderAssignmentUpdatesLeader(string command, string expected)
    {
        var state = new NavigationState { IsCommandMode = true };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.SetLeader));
            Assert.That(state.Leader, Is.EqualTo(expected));
            Assert.That(state.Message, Does.Contain("to focus the explorer"));
            Assert.That(state.IsCommandMode, Is.False);
            Assert.That(state.CommandText, Is.Empty);
        }
    }

    [TestCase(":let mapleader = \"\"")]
    [TestCase(":let mapleader = \"ab\"")]
    [TestCase(":let mapleader = \"\t\"")]
    [TestCase(":let mapleader = \"<CR>\"")]
    [TestCase(":lua vim.g.mapleader = \"ab\"")]
    public void HandleInvalidLeaderPreservesExistingLeaderAndShowsError(string command)
    {
        var state = new NavigationState { Leader = "," };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.Invalid));
            Assert.That(state.Leader, Is.EqualTo(","));
            Assert.That(state.Message, Does.Contain("one printable key"));
        }
    }

    [Test]
    public void HandleMalformedLeaderAssignmentPreservesLeaderAndReportsInvalidCommand()
    {
        var state = new NavigationState();

        var result = CommandHandler.Handle(state, ":let mapleader = \",'");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.Invalid));
            Assert.That(state.Leader, Is.EqualTo(" "));
            Assert.That(state.Message, Does.StartWith("Not an available command"));
        }
    }

    [TestCase(":Ex")]
    [TestCase(":Explore")]
    [TestCase(":q")]
    public void HandleListingCommandsReturnToExplorer(string command)
    {
        var state = new NavigationState { CommandText = command, IsCommandMode = true };
        state.OpenSelected();

        var result = CommandHandler.Handle(state, state.CommandText);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.ReturnToListing));
            Assert.That(state.IsReading, Is.False);
            Assert.That(state.IsCommandMode, Is.False);
            Assert.That(state.CommandText, Is.Empty);
        }
    }

    [TestCase(":help")]
    [TestCase(":h")]
    public void HandleHelpCommandsOpenHelp(string command)
    {
        var state = new NavigationState { CommandText = command, IsCommandMode = true };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.OpenHelp));
            Assert.That(state.IsHelpOpen, Is.True);
        }
    }

    [TestCase(":set nokeys", true, false)]
    [TestCase(":set keys", false, true)]
    [TestCase(":se keys", false, true)]
    [TestCase(":set keys!", true, false)]
    [TestCase(":set keys!", false, true)]
    [TestCase(":set invkeys", true, false)]
    public void HandleKeysOptionUpdatesKeyboardEnabled(string command, bool initial, bool expected)
    {
        var state = new NavigationState { KeyboardEnabled = initial, IsCommandMode = true };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.SetKeyboard));
            Assert.That(state.KeyboardEnabled, Is.EqualTo(expected));
            Assert.That(
                state.Message,
                Is.EqualTo(
                    expected ? "Keymaps on." : "Keymaps off. Type :set keys to turn them back on."
                )
            );
            Assert.That(state.IsCommandMode, Is.False);
        }
    }

    [TestCase(":set nodev", true, false)]
    [TestCase(":set dev", false, true)]
    [TestCase(":set dev!", true, false)]
    [TestCase(":set invdev", false, true)]
    public void HandleDevOptionUpdatesNotation(string command, bool initial, bool expected)
    {
        var state = new NavigationState { DevNotation = initial };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.SetDevNotation));
            Assert.That(state.DevNotation, Is.EqualTo(expected));
            Assert.That(
                state.Message,
                Does.StartWith(expected ? "Vim notation" : "Plain notation: Space then f f")
            );
        }
    }

    [Test]
    public void NavigationStateDevNotationIsOnByDefault() =>
        Assert.That(new NavigationState().DevNotation, Is.True);

    [TestCase(":e")]
    [TestCase(":edit")]
    public void HandleEditWithOpenDocumentReloads(string command)
    {
        var state = new NavigationState();
        state.OpenSelected();

        var result = CommandHandler.Handle(state, command);

        Assert.That(result, Is.EqualTo(CommandAction.Reload));
    }

    [Test]
    public void HandleEditWithoutDocumentReportsNoFileName()
    {
        var state = new NavigationState();

        var result = CommandHandler.Handle(state, ":e");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.Invalid));
            Assert.That(state.Message, Is.EqualTo("E32: No file name"));
        }
    }

    [Test]
    public void HandleUnknownCommandShowsHelpfulMessage()
    {
        var state = new NavigationState { CommandText = ":foo", IsCommandMode = true };

        var result = CommandHandler.Handle(state, state.CommandText);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.Invalid));
            Assert.That(
                state.Message,
                Is.EqualTo("Not an available command: foo. Try :Ex or :help.")
            );
            Assert.That(state.IsCommandMode, Is.False);
        }
    }
}
