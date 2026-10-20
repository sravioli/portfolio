using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class ReadmeTextTests
{
    public static TheoryData<string, string[]> RawLineCases => new()
    {
        { "", [""] },
        { "plain text", ["plain text"] },
        { "first\nsecond", ["first", "second"] },
        { "first\r\nsecond", ["first", "second"] },
        { "first\rsecond", ["first\rsecond"] },
        { "first\n", ["first", ""] },
        { "first\r\n", ["first", ""] },
        { "a\r\nb\nc\rd", ["a", "b", "c\rd"] },
        { "\n\n", ["", "", ""] },
        { "a\r\n\r\nb\n\n", ["a", "", "b", "", ""] }
    };

    [Theory]
    [MemberData(nameof(RawLineCases))]
    public void SplitRawLines_PreservesRawLinesAndTrailingEmptyEntries(string source, string[] expected)
    {
        Assert.Equal(expected, ReadmeText.SplitRawLines(source));
    }
}
