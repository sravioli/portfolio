using System.Text;
using System.Text.Json.Serialization;

namespace Srv.Portfolio.Models;

internal sealed record ReadmeSnapshot(
    string Repository,
    string ReadmePath,
    string Source,
    string Html
)
{
    internal bool Matches(PortfolioEntry entry) =>
        Source is not null && Html is not null &&
        string.Equals(Repository, entry.Repository, StringComparison.Ordinal) &&
        string.Equals(ReadmePath, entry.ReadmePath, StringComparison.Ordinal);

    internal static string AssetPath(PortfolioEntry entry) =>
        $"readmes/{Uri.EscapeDataString(entry.Repository)}/{Convert.ToHexString(Encoding.UTF8.GetBytes(entry.ReadmePath!))}.json";
}

[JsonSerializable(typeof(ReadmeSnapshot))]
internal sealed partial class ReadmeSnapshotJsonContext : JsonSerializerContext;
