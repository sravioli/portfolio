using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class FileSearchTests
{
    [Test]
    public void SearchEmptyQueryIncludesEveryCatalogEntryOnce()
    {
        var results = FileSearch.Search(string.Empty);

        Assert.That(results, Has.Count.EqualTo(PortfolioCatalog.AllEntries().Count()));
        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                results.Select(result => result.Path).Distinct().Count(),
                Is.EqualTo(results.Count)
            );
            Assert.That(
                results.Any(result => result.Path == "README.md" && result.Entry.IsRoot),
                Is.True
            );
            Assert.That(
                results.Any(result => result.Path == "wezterm-plugins/nap.wz/README.md"),
                Is.True
            );
            Assert.That(results.Any(result => result.Entry.Repository == "nvim"), Is.True);
        }
        foreach (var result in results)
            Assert.That(result.Matches, Is.Empty);
    }

    [TestCase("chrono", "chrono")]
    [TestCase("CHRONO", "chrono")]
    [TestCase("chro rd", "chrono")]
    [TestCase("chrd", "chord.wz")]
    [TestCase("memo", "memo.wz")]
    public void SearchFuzzyQueryFindsExpectedRepository(string query, string repository)
    {
        var results = FileSearch.Search(query);

        var matches = results.Where(item => item.Entry.Repository == repository).ToList();
        Assert.That(matches, Has.Count.EqualTo(1));
        var result = matches[0];
        var matched = string.Concat(result.Matches.Select(index => result.Path[index]));
        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                matched,
                Is.EqualTo(
                    string.Concat(query.Where(character => !char.IsWhiteSpace(character)))
                ).IgnoreCase
            );
            Assert.That(result.Matches, Is.EqualTo(result.Matches.Order()));
        }
    }

    [Test]
    public void SearchContiguousMatchRanksAheadOfScatteredMatch()
    {
        var result = FileSearch.Search("chro");

        Assert.That(result[0].Entry.Repository, Is.EqualTo("chrono"));
    }

    [TestCase("no-such-file")]
    [TestCase("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")]
    public void SearchNoMatchesReturnsEmptyResults(string query)
    {
        Assert.That(FileSearch.Search(query), Is.Empty);
    }

    [Test]
    public void SearchWhitespaceQueryReturnsAllEntriesWithoutHighlights()
    {
        var results = FileSearch.Search(" \t ");

        Assert.That(results, Has.Count.EqualTo(PortfolioCatalog.AllEntries().Count()));
        foreach (var result in results)
            Assert.That(result.Matches, Is.Empty);
    }
}
