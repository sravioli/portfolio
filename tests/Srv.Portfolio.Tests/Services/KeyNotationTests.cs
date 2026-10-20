using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class KeyNotationTests
{
    [Theory]
    [InlineData("x", "Space", "Space then x", "<leader>x")]
    [InlineData("ff", ",", ", then f f", "<leader>ff")]
    [InlineData("aBz", "Leader", "Leader then a B z", "<leader>aBz")]
    [InlineData("", "Custom", "Custom then ", "<leader>")]
    public void Leader_FormatsKeysForDevelopmentAndUserNotation(
        string keys, string leaderLabel, string expectedUser, string expectedDevelopment)
    {
        Assert.Equal(expectedUser, KeyNotation.Leader(keys, false, leaderLabel));
        Assert.Equal(expectedDevelopment, KeyNotation.Leader(keys, true, "ignored label"));
    }

    [Theory]
    [InlineData('x', "Ctrl+x", "<C-x>")]
    [InlineData('A', "Ctrl+A", "<C-A>")]
    [InlineData(',', "Ctrl+,", "<C-,>")]
    public void Control_PreservesInputCaseAndCharacter(char key, string expectedUser, string expectedDevelopment)
    {
        Assert.Equal(expectedUser, KeyNotation.Control(key, false));
        Assert.Equal(expectedDevelopment, KeyNotation.Control(key, true));
    }
}
