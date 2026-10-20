using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class NeovimKeymapTests
{
    [Theory]
    [InlineData("<C-d>", KeyAction.HalfPageDown)]
    [InlineData("<C-u>", KeyAction.HalfPageUp)]
    [InlineData("]]", KeyAction.NextHeading)]
    [InlineData("[[", KeyAction.PreviousHeading)]
    [InlineData("<C-l>", KeyAction.FocusPreview)]
    [InlineData("<C-h>", KeyAction.FocusExplorer)]
    [InlineData("<C-p>", KeyAction.OpenFileFinder)]
    [InlineData("<leader>bx", KeyAction.CloseDocument)]
    [InlineData("<C-c>", KeyAction.CopyDocument)]
    public void Handle_ReadingMaps_ReturnExpectedAction(string key, KeyAction expected)
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");

        Assert.Equal(expected, new KeymapHandler().Handle(state, key));
    }

    [Theory]
    [InlineData("<C-d>")]
    [InlineData("<C-u>")]
    [InlineData("]]")]
    [InlineData("[[")]
    [InlineData("<C-l>")]
    [InlineData("<leader>bx")]
    [InlineData("<C-c>")]
    public void Handle_ReadingOnlyMapsOnSplash_AreIgnored(string key)
    {
        Assert.Equal(KeyAction.Ignored, new KeymapHandler().Handle(new NavigationState(), key));
    }

    [Theory]
    [InlineData("h", KeyAction.CursorLeft)]
    [InlineData("l", KeyAction.CursorRight)]
    [InlineData("w", KeyAction.WordForward)]
    [InlineData("b", KeyAction.WordBackward)]
    [InlineData("e", KeyAction.WordEnd)]
    [InlineData("0", KeyAction.LineStart)]
    [InlineData("$", KeyAction.LineEnd)]
    [InlineData("Enter", KeyAction.OpenLink)]
    [InlineData("<C-o>", KeyAction.JumpBack)]
    [InlineData("<C-i>", KeyAction.JumpForward)]
    public void Handle_CursorMapsInPreview_ReturnCursorAction(string key, KeyAction expected)
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");

        Assert.Equal(expected, new KeymapHandler().Handle(state, key));
        Assert.True(state.IsReading);
    }

    [Fact]
    public void Handle_GxInPreview_FollowsLink()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        var keymap = new KeymapHandler();

        Assert.Equal(KeyAction.Changed, keymap.Handle(state, "g"));
        Assert.Equal(KeyAction.FollowLink, keymap.Handle(state, "x"));
        Assert.Equal(KeyAction.Ignored, keymap.Handle(state, "x"));
    }

    [Theory]
    [InlineData("w")]
    [InlineData("<C-o>")]
    [InlineData("$")]
    public void Handle_CursorMapsOnSplash_AreIgnored(string key)
    {
        Assert.Equal(KeyAction.Ignored, new KeymapHandler().Handle(new NavigationState(), key));
    }

    [Theory]
    [InlineData("<leader>sk")]
    [InlineData("<leader>sh")]
    public void Handle_SearchHelpMaps_OpenHelp(string key)
    {
        var state = new NavigationState();

        Assert.Equal(KeyAction.Changed, new KeymapHandler().Handle(state, key));
        Assert.True(state.IsHelpOpen);
    }
}
