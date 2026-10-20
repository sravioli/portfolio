using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class EditPathCommandTests
{
    [TestCase(":e chrono/.github/readme.md", "chrono", "README.md")]
    [TestCase(":edit ./chrono\\.github\\readme.md", "chrono", "README.md")]
    [TestCase(":e README.md", "", "README.md")]
    [TestCase(
        ":e wezterm-plugins/memo.wz/.github/readme.md",
        "memo.wz",
        "memo.wz"
    )]
    public void HandleEditCommand_WithReadmePath_OpensDocumentAndExpandsTree(
        string command,
        string expectedRepository,
        string expectedSelection
    )
    {
        var state = new NavigationState { IsExplorerOpen = false };

        var result = CommandHandler.Handle(state, command);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.OpenReadme));
            Assert.That(state.CurrentDocument?.Repository, Is.EqualTo(expectedRepository));
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.IsExplorerOpen, Is.True);
            Assert.That(state.SelectedEntry.Name, Is.EqualTo(expectedSelection));
        }

        if (expectedRepository == "chrono")
        {
            Assert.That(
                state.Entries.Any(item =>
                    item.Entry?.Repository == "chrono" && item.IsExpanded
                ),
                Is.True
            );
        }
        else if (expectedRepository == "memo.wz")
        {
            Assert.That(
                state.Entries.Any(item =>
                    item.Entry?.Repository == "wezterm-plugins" && item.IsExpanded
                ),
                Is.True
            );
        }
    }

    [Test]
    public void HandleEditCommand_WithUnknownReadmePath_PreservesCurrentDocument()
    {
        var state = new NavigationState();
        var original = state.NavigateTo("chrono");

        var result = CommandHandler.Handle(state, ":e chrono/missing.md");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.EqualTo(CommandAction.Invalid));
            Assert.That(state.CurrentDocument, Is.SameAs(original));
            Assert.That(state.Message, Is.EqualTo("E484: Can't open file chrono/missing.md"));
            Assert.That(state.IsErrorMessage, Is.True);
        }
    }
}
