using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class KeyNotationTests
{
    [TestCase("x", "Space", "Space then x", "<leader>x")]
    [TestCase("ff", ",", ", then f f", "<leader>ff")]
    [TestCase("aBz", "Leader", "Leader then a B z", "<leader>aBz")]
    [TestCase("", "Custom", "Custom then ", "<leader>")]
    public void LeaderFormatsKeysForDevelopmentAndUserNotation(
        string keys,
        string leaderLabel,
        string expectedUser,
        string expectedDevelopment
    )
    {
        using (Assert.EnterMultipleScope())
        {
            Assert.That(KeyNotation.Leader(keys, false, leaderLabel), Is.EqualTo(expectedUser));
            Assert.That(
                KeyNotation.Leader(keys, true, "ignored label"),
                Is.EqualTo(expectedDevelopment)
            );
        }
    }

    [TestCase('x', "Ctrl+x", "<C-x>")]
    [TestCase('A', "Ctrl+A", "<C-A>")]
    [TestCase(',', "Ctrl+,", "<C-,>")]
    public void ControlPreservesInputCaseAndCharacter(
        char key,
        string expectedUser,
        string expectedDevelopment
    )
    {
        using (Assert.EnterMultipleScope())
        {
            Assert.That(KeyNotation.Control(key, false), Is.EqualTo(expectedUser));
            Assert.That(KeyNotation.Control(key, true), Is.EqualTo(expectedDevelopment));
        }
    }
}
