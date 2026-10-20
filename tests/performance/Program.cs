using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Srv.Portfolio.Models;
using Srv.Portfolio.Services;

Console.WriteLine(JsonSerializer.Serialize(new
{
    runtime = RuntimeInformation.FrameworkDescription,
    os = RuntimeInformation.OSDescription,
    architecture = RuntimeInformation.ProcessArchitecture.ToString()
}));

var state = new NavigationState();
var filter = args.SingleOrDefault();
var measurements = 0;
Measure("collapsed explorer / status reads", () => ReadListing(state), 10_000);
state.NavigateTo("memo.wz");
Measure("expanded explorer / status reads", () => ReadListing(state), 10_000);
Measure("selection / expanded explorer", () =>
{
    state.MoveSelection(1);
    state.MoveSelection(-1);
    return state.SelectedIndex;
}, 10_000);
Measure("fuzzy finder / wz", () => FileSearch.Search("wz").Count, 1_000);
var source = string.Concat(Enumerable.Range(0, 200).Select(i =>
    $"## Section {i}\n\nText with [memo](https://github.com/sravioli/memo.wz) and **bold**.\n\n```csharp\nvar value = {i};\n```\n\n"));
Measure("uncached Markdown / 200 sections", () =>
    MarkdownProcessor.Render(source, PortfolioCatalog.Find("memo.wz")!).Length, 3);
var entry = PortfolioCatalog.Find("memo.wz")!;
var snapshot = new ReadmeSnapshot(entry.Repository, entry.ReadmePath!, source, MarkdownProcessor.Render(source, entry));
var snapshotJson = JsonSerializer.Serialize(snapshot, ReadmeSnapshotJsonContext.Default.ReadmeSnapshot);
if (JsonSerializer.Deserialize(snapshotJson, ReadmeSnapshotJsonContext.Default.ReadmeSnapshot) != snapshot)
    throw new InvalidOperationException("Snapshot round-trip changed README content.");
Measure("pre-rendered Markdown JSON / 200 sections", () =>
    JsonSerializer.Deserialize(snapshotJson, ReadmeSnapshotJsonContext.Default.ReadmeSnapshot)!.Html.Length, 1_000);
if (measurements == 0)
    throw new ArgumentException("No benchmark matches the supplied workload filter.");

static int ReadListing(NavigationState state) =>
    state.Entries.Count + state.Entries.Count + state.SelectedEntry.Depth + state.Entries[0].Depth;

void Measure(string name, Func<int> operation, int iterations)
{
    if (filter is not null && !name.Contains(filter, StringComparison.OrdinalIgnoreCase)) return;
    measurements++;
    var first = Stopwatch.GetTimestamp();
    var firstResult = operation();
    var checksum = firstResult;
    var firstMs = Stopwatch.GetElapsedTime(first).TotalMilliseconds;
    var warmupUntil = Stopwatch.GetTimestamp() + Stopwatch.Frequency;
    var warmupIterations = 0;
    do
    {
        checksum ^= operation();
        warmupIterations++;
    } while (warmupIterations < (iterations > 10 ? 2_000 : 5) ||
        Stopwatch.GetTimestamp() < warmupUntil);
    var warmupChecksum = checksum;
    checksum = 0;
    var times = new List<double>(21);
    var allocations = new List<double>(21);
    var collections = new int[3];
    for (var sample = 0; sample < 21; sample++)
    {
        var counts = Enumerable.Range(0, 3).Select(GC.CollectionCount).ToArray();
        var bytes = GC.GetAllocatedBytesForCurrentThread();
        var start = Stopwatch.GetTimestamp();
        for (var i = 0; i < iterations; i++) checksum ^= operation();
        var elapsed = Stopwatch.GetElapsedTime(start).TotalMicroseconds / iterations;
        var allocated = (double)(GC.GetAllocatedBytesForCurrentThread() - bytes) / iterations;
        times.Add(elapsed);
        allocations.Add(allocated);
        for (var i = 0; i < 3; i++) collections[i] += GC.CollectionCount(i) - counts[i];
    }
    times.Sort();
    allocations.Sort();
    Console.WriteLine(JsonSerializer.Serialize(new
    {
        name, iterations, samples = times.Count, firstMs, warmupIterations,
        medianUs = times[times.Count / 2], p95Us = times[(int)(times.Count * .95)],
        bytesPerOp = allocations[allocations.Count / 2], collections,
        firstResult, checksum, warmupChecksum
    }));
}
