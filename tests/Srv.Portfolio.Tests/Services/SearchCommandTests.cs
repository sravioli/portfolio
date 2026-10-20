using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class SearchCommandTests
{
    [Test]
    public void HandleSlashCommand_WithOpenDocument_StartsReadmeSearch()
    {
        var state = new NavigationState { IsCommandMode = true, CommandText = "/needle" };
        state.OpenSelected();

        var result = CommandHandler.Handle(state, state.CommandText);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.SearchReadme));
            Assert.That(state.SearchQuery, Is.EqualTo("needle"));
            Assert.That(state.IsCommandMode, Is.False);
        }
    }

    [TestCase(":nohl")]
    [TestCase(":nohlsearch")]
    [TestCase(":nohls")]
    public void HandleNoHighlightCommand_PreservesSearchAndClearsCommandMode(string command)
    {
        var state = new NavigationState
        {
            IsCommandMode = true,
            SearchQuery = "needle",
        };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.ClearSearchHighlight));
            Assert.That(state.SearchQuery, Is.EqualTo("needle"));
            Assert.That(state.IsCommandMode, Is.False);
        }
    }

    [Test]
    public void HandleEmptySlashCommand_WithPreviousSearch_RepeatsSearch()
    {
        var state = new NavigationState
        {
            IsCommandMode = true,
            CommandText = "/",
            SearchQuery = "needle",
        };
        state.OpenSelected();

        var result = CommandHandler.Handle(state, state.CommandText);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.SearchReadme));
            Assert.That(state.SearchQuery, Is.EqualTo("needle"));
        }
    }

    [TestCase("/")]
    [TestCase("/   ")]
    public void HandleSlashCommand_WithoutPattern_ShowsError(string command)
    {
        var state = new NavigationState { IsCommandMode = true };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.Invalid));
            Assert.That(state.Message, Is.EqualTo("E35: No previous regular expression"));
            Assert.That(state.IsErrorMessage, Is.True);
            Assert.That(state.IsCommandMode, Is.False);
        }
    }

    [Test]
    public void HandleSlashCommand_WithoutOpenDocument_ShowsError()
    {
        var state = new NavigationState { IsCommandMode = true };

        var result = CommandHandler.Handle(state, "/needle");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.Invalid));
            Assert.That(state.Message, Is.EqualTo("E486: Pattern not found: needle"));
            Assert.That(state.IsErrorMessage, Is.True);
        }
    }

    [Test]
    public void HandleSlashKey_EntersSearchCommandMode()
    {
        var state = new NavigationState();

        var result = new KeymapHandler().Handle(state, "/");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.FocusCommand));
            Assert.That(state.IsCommandMode, Is.True);
            Assert.That(state.CommandText, Is.EqualTo("/"));
        }
    }

    [Test]
    public void HandleSlashKey_WhenKeyboardDisabled_StillEntersSearchCommandMode()
    {
        var state = new NavigationState { KeyboardEnabled = false };

        var result = new KeymapHandler().Handle(state, "/");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(KeyAction.FocusCommand));
            Assert.That(state.IsCommandMode, Is.True);
            Assert.That(state.CommandText, Is.EqualTo("/"));
        }
    }

    [TestCase("n", KeyAction.NextSearchMatch)]
    [TestCase("N", KeyAction.PreviousSearchMatch)]
    public void HandleSearchNavigation_WhenSearchExists_MovesThroughMatches(
        string key,
        KeyAction expected
    )
    {
        var state = new NavigationState { SearchQuery = "needle" };
        state.OpenSelected();

        Assert.That(new KeymapHandler().Handle(state, key), Is.EqualTo(expected));
    }
}
