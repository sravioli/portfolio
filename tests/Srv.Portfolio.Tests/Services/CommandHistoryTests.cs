using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class CommandHistoryTests
{
    [Test]
    public void Previous_WhenHistoryExists_ReturnsCommandsFromNewestToOldest()
    {
        var history = new CommandHistory();
        history.Add(":help");
        history.Add(":Ex");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(history.Previous(":"), Is.EqualTo(":Ex"));
            Assert.That(history.Previous(":Ex"), Is.EqualTo(":help"));
            Assert.That(history.Previous(":help"), Is.EqualTo(":help"));
        }
    }

    [Test]
    public void Next_AfterPrevious_RestoresDraftAfterNewestCommand()
    {
        var history = new CommandHistory();
        history.Add(":help");
        history.Add(":Ex");
        history.Previous(":draft");

        using (Assert.EnterMultipleScope())
        {
            Assert.That(history.Next(":Ex"), Is.EqualTo(":draft"));
            Assert.That(history.Next(":draft"), Is.EqualTo(":draft"));
        }
    }

    [Test]
    public void Previous_WithoutHistory_PreservesCurrentInput()
    {
        var history = new CommandHistory();

        Assert.That(history.Previous(":unfinished"), Is.EqualTo(":unfinished"));
    }

    [Test]
    public void Next_WithoutHistory_PreservesCurrentInput()
    {
        var history = new CommandHistory();

        Assert.That(history.Next(":unfinished"), Is.EqualTo(":unfinished"));
    }

    [TestCase("  ")]
    [TestCase(":")]
    [TestCase(":  ")]
    public void Add_EmptyCommand_DoesNotAddToHistory(string command)
    {
        var history = new CommandHistory();
        history.Add(command);

        Assert.That(history.Previous(":draft"), Is.EqualTo(":draft"));
    }
}
