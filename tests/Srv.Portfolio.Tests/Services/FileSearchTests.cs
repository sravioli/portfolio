using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class FileSearchTests
{
    [Fact]
    public void Search_EmptyQuery_IncludesEveryCatalogEntryOnce()
    {
        var results = FileSearch.Search(string.Empty);

        Assert.Equal(PortfolioCatalog.AllEntries().Count(), results.Count);
        Assert.Equal(results.Count, results.Select(result => result.Path).Distinct().Count());
        Assert.Contains(results, result => result.Path == "README.md" && result.Entry.IsRoot);
        Assert.Contains(results, result => result.Path == "wezterm-plugins/nap.wz/README.md");
        Assert.Contains(results, result => result.Entry.Repository == "nvim");
        Assert.All(results, result => Assert.Empty(result.Matches));
    }

    [Theory]
    [InlineData("chrono", "chrono")]
    [InlineData("CHRONO", "chrono")]
    [InlineData("chro rd", "chrono")]
    [InlineData("chrd", "chord.wz")]
    [InlineData("memo", "memo.wz")]
    public void Search_FuzzyQuery_FindsExpectedRepository(string query, string repository)
    {
        var results = FileSearch.Search(query);

        var result = Assert.Single(results, item => item.Entry.Repository == repository);
        var matched = string.Concat(result.Matches.Select(index => result.Path[index])).ToLowerInvariant();
        Assert.Equal(string.Concat(query.Where(character => !char.IsWhiteSpace(character))).ToLowerInvariant(), matched);
        Assert.Equal(result.Matches.Order(), result.Matches);
    }

    [Fact]
    public void Search_ContiguousMatch_RanksAheadOfScatteredMatch()
    {
        var result = FileSearch.Search("chro");

        Assert.Equal("chrono", result[0].Entry.Repository);
    }

    [Theory]
    [InlineData("no-such-file")]
    [InlineData("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")]
    public void Search_NoMatches_ReturnsEmptyResults(string query)
    {
        Assert.Empty(FileSearch.Search(query));
    }

    [Fact]
    public void Search_WhitespaceQuery_ReturnsAllEntriesWithoutHighlights()
    {
        var results = FileSearch.Search(" \t ");

        Assert.Equal(PortfolioCatalog.AllEntries().Count(), results.Count);
        Assert.All(results, result => Assert.Empty(result.Matches));
    }
}
