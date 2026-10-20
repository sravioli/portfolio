using Srv.Portfolio.Models;

namespace Srv.Portfolio.Services;

internal sealed record FileSearchResult(
    PortfolioEntry Entry,
    string Path,
    IReadOnlyList<int> Matches
);

internal static class FileSearch
{
    private static readonly SearchEntry[] SearchEntries =
    [
        .. PortfolioCatalog.AllEntries().Select(entry => new SearchEntry(entry, BuildPath(entry))),
    ];

    public static IReadOnlyList<FileSearchResult> Search(string query)
    {
        var pattern = string.Concat(query.Where(character => !char.IsWhiteSpace(character)));
        var results = new List<(FileSearchResult Result, int Score)>();
        foreach (var searchEntry in SearchEntries)
        {
            var entry = searchEntry.Entry;
            var path = searchEntry.Path;
            var matches = new List<int>();
            var cursor = 0;
            foreach (var character in pattern)
            {
                var index = path.IndexOf(
                    character.ToString(),
                    cursor,
                    StringComparison.OrdinalIgnoreCase
                );
                if (index < 0)
                {
                    break;
                }

                matches.Add(index);
                cursor = index + 1;
            }

            if (matches.Count != pattern.Length)
            {
                continue;
            }

            var gaps = matches.Count < 2 ? 0 : matches[^1] - matches[0] + 1 - matches.Count;
            var score = gaps * 10 + (matches.Count == 0 ? 0 : matches[0]);
            results.Add((new FileSearchResult(entry, path, matches), score));
        }

        return
        [
            .. results
                .OrderBy(item => item.Score)
                .ThenBy(item => item.Result.Path.Length)
                .ThenBy(item => item.Result.Path, StringComparer.OrdinalIgnoreCase)
                .Select(item => item.Result),
        ];
    }

    private static string BuildPath(PortfolioEntry entry)
    {
        var repositoryPath = string.Join('/', PortfolioCatalog.GetPath(entry).Skip(1));
        return (repositoryPath.Length > 0 ? repositoryPath + "/" : "")
            + (entry.ReadmePath ?? "README.md");
    }

    private sealed record SearchEntry(PortfolioEntry Entry, string Path);
}
