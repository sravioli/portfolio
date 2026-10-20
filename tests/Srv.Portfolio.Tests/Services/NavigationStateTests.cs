using Srv.Portfolio.Services;
using Srv.Portfolio.Models;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class NavigationStateTests
{
    [Test]
    public void Entries_UnchangedExpansion_ReusesReadOnlySnapshot()
    {
        var state = new NavigationState();
        var entries = state.Entries;

        state.SelectIndex(1);
        state.MoveSelection(1);
        state.SelectEdge(last: true);
        state.BeginCommand();
        state.SetKeyboardEnabled(false);
        state.CloseDocument();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.Entries, Is.SameAs(entries));
            Assert.That(entries, Has.Count.EqualTo(5));
            Assert.That(entries.Select(item => item.Name), Is.EqualTo(new[]
            {
                "README.md", "chrono/", "nvim/", "wezterm/", "wezterm-plugins/"
            }));
        }
        Assert.Throws<NotSupportedException>(() => ((IList<ExplorerItem>)entries).Clear());
    }

    [Test]
    public void OpenSelected_FolderToggle_ReplacesSnapshotWithoutMutatingPreviousListing()
    {
        var state = new NavigationState();
        var collapsed = state.Entries;
        state.SelectIndex(4);

        state.OpenSelected();
        var expanded = state.Entries;
        state.OpenSelected();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(expanded, Is.Not.SameAs(collapsed));
            Assert.That(expanded, Has.Count.EqualTo(17));
            Assert.That(expanded[4].IsExpanded, Is.True);
            Assert.That(state.Entries, Is.Not.SameAs(expanded));
            Assert.That(state.Entries, Is.EqualTo(collapsed));
            Assert.That(collapsed, Has.Count.EqualTo(5));
            Assert.That(collapsed[4].IsExpanded, Is.False);
        }
    }

    [Test]
    public void CollapseSelected_ExpandedParent_InvalidatesOnlyWhenTreeChanges()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        var expanded = state.Entries;

        state.CollapseSelected();
        Assert.That(state.Entries, Is.SameAs(expanded));
        state.CollapseSelected();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.Entries, Is.Not.SameAs(expanded));
            Assert.That(state.Entries, Has.Count.EqualTo(5));
            Assert.That(state.SelectedEntry.IsExpanded, Is.False);
            Assert.That(expanded.Any(item => item.Name == "memo.wz"), Is.True);
        }
    }

    [Test]
    public void NavigateTo_HiddenDocument_InvalidatesSnapshotWhenAncestorsExpand()
    {
        var state = new NavigationState();
        var collapsed = state.Entries;

        state.NavigateTo("memo.wz");
        var expanded = state.Entries;
        state.NavigateTo("beacon.wz");
        state.GoToParent();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(expanded, Is.Not.SameAs(collapsed));
            Assert.That(expanded, Has.Count.EqualTo(17));
            Assert.That(state.Entries, Is.SameAs(expanded));
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("beacon.wz"));
            Assert.That(state.IsReading, Is.False);
        }
    }

    [TestCase("")]
    [TestCase("chrono")]
    [TestCase("memo.wz")]
    public void OpenSelectedDocumentResetsViewAndPreservesExplorerState(string repository)
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

        using (Assert.EnterMultipleScope())
        {
            Assert.That(document, Is.SameAs(entry));
            Assert.That(state.CurrentDocument, Is.SameAs(entry));
            Assert.That(state.CurrentFolder, Is.SameAs(entry));
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.IsWelcome, Is.False);
            Assert.That(state.IsRawView, Is.False);
            Assert.That(state.Message, Is.Null);
            Assert.That(state.Entries, Is.EqualTo(entries));
            Assert.That(state.SelectedIndex, Is.EqualTo(selection));
            Assert.That(state.IsCommandMode, Is.True);
            Assert.That(state.CommandText, Is.EqualTo(":help"));
        }
    }

    [Test]
    public void NavigateToUnknownRepositoryPreservesExistingState()
    {
        var state = new NavigationState();
        var document = state.NavigateTo("memo.wz");
        var selection = state.SelectedIndex;
        var entries = state.Entries.ToArray();
        state.IsRawView = true;
        state.Message = "Old message";

        var result = state.NavigateTo("missing");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(result, Is.Null);
            Assert.That(state.CurrentDocument, Is.SameAs(document));
            Assert.That(state.CurrentFolder, Is.SameAs(document));
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.IsWelcome, Is.False);
            Assert.That(state.IsRawView, Is.True);
            Assert.That(state.Message, Is.EqualTo("Old message"));
            Assert.That(state.SelectedIndex, Is.EqualTo(selection));
            Assert.That(state.Entries, Is.EqualTo(entries));
        }
    }

    [Test]
    public void NavigateToAnotherDocumentResetsViewAndPreservesCommand()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");
        state.IsRawView = true;
        state.Message = "Old message";
        state.IsCommandMode = true;
        state.CommandText = ":help";

        var document = state.NavigateTo("chrono");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.CurrentDocument, Is.SameAs(document));
            Assert.That(state.CurrentFolder.Repository, Is.EqualTo("chrono"));
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("README.md"));
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.IsWelcome, Is.False);
            Assert.That(state.IsRawView, Is.False);
            Assert.That(state.Message, Is.Null);
            Assert.That(state.IsCommandMode, Is.True);
            Assert.That(state.CommandText, Is.EqualTo(":help"));
            Assert.That(
                state.Entries.Any(item => item.Name == "wezterm-plugins/" && item.IsExpanded),
                Is.True
            );
        }
    }

    [Test]
    public void BeginCommandExistingInputReplacesInputWithoutChangingDocumentOrMessage()
    {
        var state = new NavigationState();
        var document = state.NavigateTo("memo.wz");
        state.CommandText = "old input";
        state.Message = "Old message";

        state.BeginCommand();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsCommandMode, Is.True);
            Assert.That(state.CommandText, Is.EqualTo(":"));
            Assert.That(state.CurrentDocument, Is.SameAs(document));
            Assert.That(state.Message, Is.EqualTo("Old message"));
        }
    }

    [Test]
    public void EndCommandActiveCommandClearsInputWithoutChangingDocumentOrMessage()
    {
        var state = new NavigationState();
        var document = state.NavigateTo("memo.wz");
        state.BeginCommand();
        state.CommandText = ":help";
        state.Message = "Old message";

        state.EndCommand();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsCommandMode, Is.False);
            Assert.That(state.CommandText, Is.Empty);
            Assert.That(state.CurrentDocument, Is.SameAs(document));
            Assert.That(state.Message, Is.EqualTo("Old message"));
        }
    }

    [TestCase(true, "Keymaps on.")]
    [TestCase(false, "Keymaps off. Type :set keys to turn them back on.")]
    public void SetKeyboardEnabledRequestedValueUpdatesFeedbackWithoutClearingCommand(
        bool enabled,
        string message
    )
    {
        var state = new NavigationState { KeyboardEnabled = !enabled };
        state.BeginCommand();
        state.CommandText = ":help";

        state.SetKeyboardEnabled(enabled);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.KeyboardEnabled, Is.EqualTo(enabled));
            Assert.That(state.Message, Is.EqualTo(message));
            Assert.That(state.IsCommandMode, Is.True);
            Assert.That(state.CommandText, Is.EqualTo(":help"));
        }
    }

    [Test]
    public void CloseDocumentFromReadmeRestoresWelcomeAndPreservesExplorer()
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

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsWelcome, Is.True);
            Assert.That(state.IsReading, Is.False);
            Assert.That(state.CurrentDocument, Is.Null);
            Assert.That(state.CurrentFolder, Is.EqualTo(PortfolioCatalog.RootEntry));
            Assert.That(state.Entries, Is.EqualTo(entries));
            Assert.That(state.SelectedIndex, Is.EqualTo(selection));
            Assert.That(state.IsRawView, Is.False);
            Assert.That(state.IsCommandMode, Is.False);
            Assert.That(state.CommandText, Is.Empty);
            Assert.That(state.Message, Is.Null);
        }

        state.OpenSelected();
        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.IsWelcome, Is.False);
            Assert.That(state.CurrentDocument?.Repository, Is.EqualTo("memo.wz"));
        }
    }

    [Test]
    public void ConstructorInitialStateShowsWelcomeWithoutOpeningDocument()
    {
        var state = new NavigationState();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsWelcome, Is.True);
            Assert.That(state.IsReading, Is.False);
            Assert.That(state.CurrentDocument, Is.Null);
            Assert.That(state.CurrentFolder, Is.EqualTo(PortfolioCatalog.RootEntry));
        }
    }

    [Test]
    public void OpenSelectedFromWelcomeOpensReadmeAndDismissesWelcome()
    {
        var state = new NavigationState();

        state.OpenSelected();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsWelcome, Is.False);
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.CurrentDocument, Is.EqualTo(PortfolioCatalog.RootEntry));
        }
        state.GoToParent();
        Assert.That(state.IsWelcome, Is.False);
    }

    [Test]
    public void OpenSelectedFolderWhileWelcomingPreservesWelcomeUntilFileOpens()
    {
        var state = new NavigationState();
        state.SelectIndex(1);

        state.OpenSelected();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsWelcome, Is.True);
            Assert.That(state.IsReading, Is.False);
            Assert.That(state.CurrentFolder, Is.EqualTo(PortfolioCatalog.RootEntry));
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("chrono/"));
            Assert.That(state.SelectedEntry.IsExpanded, Is.True);
        }

        state.SelectIndex(2);
        state.OpenSelected();
        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsWelcome, Is.False);
            Assert.That(state.IsReading, Is.True);
        }
    }

    [Test]
    public void GoToParentFromReadmeReturnsToFolderWithReadmeSelected()
    {
        var state = new NavigationState();
        state.OpenSelected();

        state.GoToParent();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsReading, Is.False);
            Assert.That(state.SelectedIndex, Is.Zero);
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("README.md"));
        }
    }

    [Test]
    public void GoToParentFromExpandedFolderCollapsesItWithoutReplacingTree()
    {
        var state = new NavigationState();
        state.GoToParent();
        state.SelectIndex(4);
        state.OpenSelected();
        state.GoToParent();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.SelectedIndex, Is.EqualTo(4));
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("wezterm-plugins/"));
            Assert.That(state.SelectedEntry.IsExpanded, Is.False);
            Assert.That(state.Entries, Has.Count.EqualTo(5));
        }
    }

    [Test]
    public void NavigateToNvimOpensPlaceholderReadme()
    {
        var state = new NavigationState();

        var entry = state.NavigateTo("nvim");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(entry?.Repository, Is.EqualTo("nvim"));
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.CurrentDocument, Is.EqualTo(entry));
            Assert.That(state.IsWelcome, Is.False);
        }
    }

    [Test]
    public void MoveSelectionClampsAtListingEdges()
    {
        var state = new NavigationState();
        state.GoToParent();

        state.MoveSelection(-1);
        Assert.That(state.SelectedIndex, Is.Zero);

        state.MoveSelection(100);
        Assert.That(state.SelectedIndex, Is.EqualTo(state.Entries.Count - 1));
    }

    [Test]
    public void OpenSelectedPluginFileOpensItsReadmeAndPreservesParentSelection()
    {
        var state = new NavigationState();
        state.GoToParent();
        state.SelectIndex(4);
        state.OpenSelected();
        state.SelectIndex(state.Entries.ToList().FindIndex(item => item.Name == "memo.wz"));

        state.OpenSelected();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.CurrentFolder.Name, Is.EqualTo("memo.wz"));
            Assert.That(state.CurrentDocument?.Repository, Is.EqualTo("memo.wz"));
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.Entries.Any(item => item.Name == "chrono/"), Is.True);
            Assert.That(
                state.Entries.Any(item => item.Name == "wezterm-plugins/" && item.IsExpanded),
                Is.True
            );
        }

        state.GoToParent();
        Assert.That(state.SelectedEntry.Name, Is.EqualTo("memo.wz"));
        state.CollapseSelected();
        Assert.That(state.SelectedEntry.Name, Is.EqualTo("wezterm-plugins/"));
    }

    [Test]
    public void OpenSelectedFolderWhileReadingExpandsInlineAndPreservesDocument()
    {
        var state = new NavigationState();
        state.OpenSelected();
        state.SelectIndex(4);

        var document = state.OpenSelected();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(document, Is.Null);
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.CurrentDocument, Is.EqualTo(PortfolioCatalog.RootEntry));
            Assert.That(state.CurrentFolder, Is.EqualTo(PortfolioCatalog.RootEntry));
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("wezterm-plugins/"));
            Assert.That(state.SelectedEntry.IsExpanded, Is.True);
            Assert.That(state.Entries, Has.Count.EqualTo(17));
        }
        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.Entries[5].Depth, Is.EqualTo(1));
            Assert.That(state.Entries[5].Name, Is.EqualTo("README.md"));
            Assert.That(state.Entries[6].Name, Is.EqualTo("beacon.wz"));
            Assert.That(state.Entries.Any(item => item.Name == "../"), Is.False);
        }
    }

    [Test]
    public void OpenSelectedExpandedFolderHidesChildrenAndKeepsOtherFoldersExpanded()
    {
        var state = new NavigationState();
        state.SelectIndex(1);
        state.OpenSelected();
        state.SelectIndex(
            state.Entries.ToList().FindIndex(item => item.Name == "wezterm-plugins/")
        );
        state.OpenSelected();
        state.OpenSelected();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.SelectedEntry.IsExpanded, Is.False);
            Assert.That(state.Entries.Any(item => item.Name == "beacon.wz"), Is.False);
            Assert.That(
                state.Entries.Any(item => item.Name == "chrono/" && item.IsExpanded),
                Is.True
            );
            Assert.That(state.Entries[2].Name, Is.EqualTo("README.md"));
        }
    }

    [Test]
    public void NavigateToHiddenPluginExpandsAncestorsAndSelectsFile()
    {
        var state = new NavigationState();

        state.NavigateTo("memo.wz");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("memo.wz"));
            Assert.That(state.CurrentDocument?.Repository, Is.EqualTo("memo.wz"));
            Assert.That(
                state.Entries.Any(item => item.Name == "wezterm-plugins/" && item.IsExpanded),
                Is.True
            );
            Assert.That(state.Entries.Any(item => item.Name == "chrono/"), Is.True);
        }
    }

    [Test]
    public void CollapseSelectedChildOfFolderSelectsThenCollapsesParentWithoutClosingDocument()
    {
        var state = new NavigationState();
        state.NavigateTo("memo.wz");

        state.CollapseSelected();
        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.SelectedEntry.Name, Is.EqualTo("wezterm-plugins/"));
            Assert.That(state.SelectedEntry.IsExpanded, Is.True);
        }

        state.CollapseSelected();

        using (Assert.EnterMultipleScope())
        {
            Assert.That(state.SelectedEntry.IsExpanded, Is.False);
            Assert.That(state.IsReading, Is.True);
            Assert.That(state.CurrentDocument?.Repository, Is.EqualTo("memo.wz"));
            Assert.That(state.Entries.Any(item => item.Name == "memo.wz"), Is.False);
            Assert.That(state.SelectedIndex, Is.InRange(0, state.Entries.Count - 1));
        }
    }
}
