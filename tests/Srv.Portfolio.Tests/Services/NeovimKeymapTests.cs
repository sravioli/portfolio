using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class NeovimKeymapTests
{
    [TestCase("<C-d>", KeyAction.HalfPageDown)]
    [TestCase("<C-u>", KeyAction.HalfPageUp)]
    [TestCase("]]", KeyAction.NextHeading)]
    [TestCase("[[", KeyAction.PreviousHeading)]
    [TestCase("<C-l>", KeyAction.FocusPreview)]
    [TestCase("<C-h>", KeyAction.FocusExplorer)]
    [TestCase("<C-p>", KeyAction.OpenFileFinder)]
    [TestCase("<leader>bx", KeyAction.CloseDocument)]
    [TestCase("<C-c>", KeyAction.CopyDocument)]
    public void HandleReadingMapsReturnExpectedAction(string key, KeyAction expected)
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");

        Assert.That(new KeymapHandler().Handle(state, key), Is.EqualTo(expected));
    }

    [TestCase("<C-d>")]
    [TestCase("<C-u>")]
    [TestCase("]]")]
    [TestCase("[[")]
    [TestCase("<C-l>")]
    [TestCase("<leader>bx")]
    [TestCase("<C-c>")]
    public void HandleReadingOnlyMapsOnSplashAreIgnored(string key)
    {
        Assert.That(
            new KeymapHandler().Handle(new NavigationState(), key),
            Is.EqualTo(KeyAction.Ignored)
        );
    }

    [TestCase("h", KeyAction.CursorLeft)]
    [TestCase("l", KeyAction.CursorRight)]
    [TestCase("w", KeyAction.WordForward)]
    [TestCase("b", KeyAction.WordBackward)]
    [TestCase("e", KeyAction.WordEnd)]
    [TestCase("0", KeyAction.LineStart)]
    [TestCase("$", KeyAction.LineEnd)]
    [TestCase("Enter", KeyAction.OpenLink)]
    [TestCase("<C-o>", KeyAction.JumpBack)]
    [TestCase("<C-i>", KeyAction.JumpForward)]
    public void HandleCursorMapsInPreviewReturnCursorAction(string key, KeyAction expected)
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(new KeymapHandler().Handle(state, key), Is.EqualTo(expected));
            Assert.That(state.IsReading, Is.True);
        }
    }

    [Test]
    public void HandleGxInPreviewFollowsLink()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        var keymap = new KeymapHandler();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(keymap.Handle(state, "g"), Is.EqualTo(KeyAction.Changed));
            Assert.That(keymap.Handle(state, "x"), Is.EqualTo(KeyAction.FollowLink));
        }
        Assert.That(keymap.Handle(state, "x"), Is.EqualTo(KeyAction.Ignored));
    }

    [TestCase("w")]
    [TestCase("<C-o>")]
    [TestCase("$")]
    public void HandleCursorMapsOnSplashAreIgnored(string key)
    {
        Assert.That(
            new KeymapHandler().Handle(new NavigationState(), key),
            Is.EqualTo(KeyAction.Ignored)
        );
    }

    [TestCase("<leader>sk")]
    [TestCase("<leader>sh")]
    public void HandleRemovedSearchHelpMapsAreIgnored(string key)
    {
        var state = new NavigationState();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(new KeymapHandler().Handle(state, key), Is.EqualTo(KeyAction.Ignored));
            Assert.That(state.IsHelpOpen, Is.False);
        }
    }
}
