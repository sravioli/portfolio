using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class ReadmeTextTests
{
    public static IEnumerable<TestCaseData<string, string[]>> RawLineCases =>
        [
            new("", [""]),
            new("plain text", ["plain text"]),
            new("first\nsecond", ["first", "second"]),
            new("first\r\nsecond", ["first", "second"]),
            new("first\rsecond", ["first\rsecond"]),
            new("first\n", ["first", ""]),
            new("first\r\n", ["first", ""]),
            new("a\r\nb\nc\rd", ["a", "b", "c\rd"]),
            new("\n\n", ["", "", ""]),
            new("a\r\n\r\nb\n\n", ["a", "", "b", "", ""]),
        ];

    [TestCaseSource(nameof(RawLineCases))]
    public void SplitRawLinesPreservesRawLinesAndTrailingEmptyEntries(
        string source,
        string[] expected
    )
    {
        Assert.That(ReadmeText.SplitRawLines(source), Is.EqualTo(expected));
    }
}
