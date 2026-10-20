using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class CommandHandlerTests
{
    [Fact]
    public void NavigationState_DefaultLeader_IsSpace()
    {
        var state = new NavigationState();

        Assert.Equal(" ", state.Leader);
        Assert.Equal("Space", state.LeaderLabel);
    }

    [Theory]
    [InlineData(":let mapleader = \" \"", " ")]
    [InlineData(":let mapleader=','", ",")]
    [InlineData(":let g:mapleader = \";\"", ";")]
    [InlineData(":lua vim.g.mapleader = \",\"", ",")]
    [InlineData(":let mapleader = \"<Space>\"", " ")]
    [InlineData(":let mapleader = \"<Bslash>\"", "\\")]
    [InlineData(":let mapleader = \"\\\\\"", "\\")]
    public void Handle_LeaderAssignment_UpdatesLeader(string command, string expected)
    {
        var state = new NavigationState { IsCommandMode = true };

        var result = new CommandHandler().Handle(state, command);

        Assert.Equal(CommandAction.SetLeader, result);
        Assert.Equal(expected, state.Leader);
        Assert.Contains("to focus the explorer", state.Message);
        Assert.False(state.IsCommandMode);
        Assert.Empty(state.CommandText);
    }

    [Theory]
    [InlineData(":let mapleader = \"\"")]
    [InlineData(":let mapleader = \"ab\"")]
    [InlineData(":let mapleader = \"\t\"")]
    [InlineData(":let mapleader = \"<CR>\"")]
    [InlineData(":lua vim.g.mapleader = \"ab\"")]
    public void Handle_InvalidLeader_PreservesExistingLeaderAndShowsError(string command)
    {
        var state = new NavigationState { Leader = "," };

        var result = new CommandHandler().Handle(state, command);

        Assert.Equal(CommandAction.Invalid, result);
        Assert.Equal(",", state.Leader);
        Assert.Contains("one printable key", state.Message);
    }

    [Fact]
    public void Handle_MalformedLeaderAssignment_PreservesLeaderAndReportsInvalidCommand()
    {
        var state = new NavigationState();

        var result = new CommandHandler().Handle(state, ":let mapleader = \",'");

        Assert.Equal(CommandAction.Invalid, result);
        Assert.Equal(" ", state.Leader);
        Assert.StartsWith("Not an available command", state.Message);
    }

    [Theory]
    [InlineData(":Ex")]
    [InlineData(":Explore")]
    [InlineData(":q")]
    public void Handle_ListingCommands_ReturnToExplorer(string command)
    {
        var state = new NavigationState { CommandText = command, IsCommandMode = true };
        state.OpenSelected();
        var handler = new CommandHandler();

        var result = handler.Handle(state, state.CommandText);

        Assert.Equal(CommandAction.ReturnToListing, result);
        Assert.False(state.IsReading);
        Assert.False(state.IsCommandMode);
        Assert.Empty(state.CommandText);
    }

    [Theory]
    [InlineData(":help")]
    [InlineData(":h")]
    public void Handle_HelpCommands_OpenHelp(string command)
    {
        var state = new NavigationState { CommandText = command, IsCommandMode = true };

        var result = new CommandHandler().Handle(state, command);

        Assert.Equal(CommandAction.OpenHelp, result);
        Assert.True(state.IsHelpOpen);
    }

    [Theory]
    [InlineData(":set nokeys", true, false)]
    [InlineData(":set keys", false, true)]
    [InlineData(":se keys", false, true)]
    [InlineData(":set keys!", true, false)]
    [InlineData(":set keys!", false, true)]
    [InlineData(":set invkeys", true, false)]
    public void Handle_KeysOption_UpdatesKeyboardEnabled(string command, bool initial, bool expected)
    {
        var state = new NavigationState { KeyboardEnabled = initial, IsCommandMode = true };

        var result = new CommandHandler().Handle(state, command);

        Assert.Equal(CommandAction.SetKeyboard, result);
        Assert.Equal(expected, state.KeyboardEnabled);
        Assert.Equal(
            expected ? "Keymaps on." : "Keymaps off. Type :set keys to turn them back on.",
            state.Message);
        Assert.False(state.IsCommandMode);
    }

    [Theory]
    [InlineData(":set nodev", true, false)]
    [InlineData(":set dev", false, true)]
    [InlineData(":set dev!", true, false)]
    [InlineData(":set invdev", false, true)]
    public void Handle_DevOption_UpdatesNotation(string command, bool initial, bool expected)
    {
        var state = new NavigationState { DevNotation = initial };

        var result = new CommandHandler().Handle(state, command);

        Assert.Equal(CommandAction.SetDevNotation, result);
        Assert.Equal(expected, state.DevNotation);
        Assert.StartsWith(expected ? "Vim notation" : "Plain notation: Space then f f", state.Message);
    }

    [Fact]
    public void NavigationState_DevNotation_IsOnByDefault() => Assert.True(new NavigationState().DevNotation);

    [Theory]
    [InlineData(":e")]
    [InlineData(":edit")]
    public void Handle_EditWithOpenDocument_Reloads(string command)
    {
        var state = new NavigationState();
        state.OpenSelected();

        var result = new CommandHandler().Handle(state, command);

        Assert.Equal(CommandAction.Reload, result);
    }

    [Fact]
    public void Handle_EditWithoutDocument_ReportsNoFileName()
    {
        var state = new NavigationState();

        var result = new CommandHandler().Handle(state, ":e");

        Assert.Equal(CommandAction.Invalid, result);
        Assert.Equal("E32: No file name", state.Message);
    }

    [Fact]
    public void Handle_UnknownCommand_ShowsHelpfulMessage()
    {
        var state = new NavigationState { CommandText = ":foo", IsCommandMode = true };

        var result = new CommandHandler().Handle(state, state.CommandText);

        Assert.Equal(CommandAction.Invalid, result);
        Assert.Equal("Not an available command: foo. Try :Ex or :help.", state.Message);
        Assert.False(state.IsCommandMode);
    }
}
