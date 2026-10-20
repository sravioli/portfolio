using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class FileFinderInteropTests
{
    [Test]
    public async Task OpenAsyncEveryOpenReimportsAndForwardsDialogToReturnedModule()
    {
        var first = new RecordingJsModule();
        var second = new RecordingJsModule();
        var runtime = new RecordingJsRuntime(first, second);
        var interop = new FileFinderInterop(runtime);
        await using var interopLifetime = interop.ConfigureAwait(true);
        var dialog = new ElementReference("finder-dialog");

        await interop.OpenAsync(dialog).ConfigureAwait(true);
        await interop.OpenAsync(dialog).ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                runtime.Calls.Select(call => call.Identifier),
                Is.EqualTo(new object?[] { "import", "import" })
            );
            Assert.That(
                runtime.Calls[0].Arguments.Single(),
                Is.EqualTo("./Pages/FileFinder.razor.js")
            );
            Assert.That(
                runtime.Calls[1].Arguments.Single(),
                Is.EqualTo("./Pages/FileFinder.razor.js")
            );
            Assert.That(first.Calls.Single().Arguments, Is.EqualTo(new object?[] { dialog }));
            Assert.That(first.Calls.Single().Identifier, Is.EqualTo("open"));
            Assert.That(second.Calls.Single().Arguments, Is.EqualTo(new object?[] { dialog }));
            Assert.That(second.Calls.Single().Identifier, Is.EqualTo("open"));
        }
    }

    [TestCase("import")]
    [TestCase("open")]
    public async Task OpenAsyncPropagatesFailuresAndRetainsOnlyAnImportedModule(string failureStage)
    {
        var sentinel = new InvalidOperationException(failureStage);
        var module = new RecordingJsModule();
        var runtime = new RecordingJsRuntime(module);
        var interop = new FileFinderInterop(runtime);
        await using var interopLifetime = interop.ConfigureAwait(true);
        var dialog = new ElementReference("dialog");
        if (failureStage == "import")
            runtime.ImportFailure = sentinel;
        else
            module.InvocationFailures["open"] = sentinel;

        var exception = await Assert
            .ThrowsAsync<InvalidOperationException>(async () =>
                await interop.OpenAsync(dialog).ConfigureAwait(true)
            )
            .ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(exception, Is.SameAs(sentinel));
            Assert.That(
                runtime.Calls.Single().Arguments.Single(),
                Is.EqualTo("./Pages/FileFinder.razor.js")
            );
        }
        if (failureStage == "import")
            Assert.That(module.Calls, Is.Empty);
        else
            Assert.That(module.Calls.Single().Identifier, Is.EqualTo("open"));
        await interop.CloseAsync(true).ConfigureAwait(true);
        var expectedCalls = failureStage == "import" ? [] : new[] { "open", "close" };
        Assert.That(module.Calls.Select(call => call.Identifier), Is.EqualTo(expectedCalls));
        if (failureStage == "open")
        {
            module.InvocationFailures.Remove("open");
            using (Assert.EnterMultipleScope())
            {
                Assert.That(module.Calls[^1].Identifier, Is.EqualTo("close"));
                Assert.That(module.Calls[^1].Arguments, Is.EqualTo(new object?[] { true }));
            }
        }
    }

    [Test]
    public async Task CloseAsyncBeforeOpenIsSafeAndForwardsBothRestoreFocusValues()
    {
        var module = new RecordingJsModule();
        var interop = new FileFinderInterop(new RecordingJsRuntime(module));
        await using var interopLifetime = interop.ConfigureAwait(true);

        await interop.CloseAsync(true).ConfigureAwait(true);
        Assert.That(module.Calls, Is.Empty);

        await interop.OpenAsync(new ElementReference("dialog")).ConfigureAwait(true);
        module.Calls.Clear();
        await interop.CloseAsync(false).ConfigureAwait(true);
        await interop.CloseAsync(true).ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                module.Calls.Select(call => call.Identifier),
                Is.EqualTo(new object?[] { "close", "close" })
            );
            Assert.That(module.Calls[0].Arguments, Is.EqualTo(new object?[] { false }));
            Assert.That(module.Calls[1].Arguments, Is.EqualTo(new object?[] { true }));
        }
    }

    [Test]
    public async Task DisposeAsyncBeforeOpenIsSafe()
    {
        var runtime = new RecordingJsRuntime();

        await new FileFinderInterop(runtime).DisposeAsync().ConfigureAwait(true);

        Assert.That(runtime.Calls, Is.Empty);
    }

    private static readonly string[] expectedArray =
    [
        "invoke:close",
        "invoke:dispose",
        "module.DisposeAsync",
    ];

    [TestCase("invoke")]
    [TestCase("dispose")]
    [TestCase("success")]
    [TestCase("disconnected-invoke")]
    [TestCase("disconnected-dispose")]
    public async Task DisposeAsyncRecordsOrderedStagesAndRetainsModuleAfterAnyOutcome(
        string scenario
    )
    {
        var module = new RecordingJsModule();
        var invocationFailure = new InvalidOperationException("invoke failed");
        var disposeFailure = new InvalidOperationException("dispose failed");
        if (scenario == "invoke")
            module.InvocationFailures["dispose"] = invocationFailure;
        if (scenario == "dispose")
            module.DisposeFailure = disposeFailure;
        if (scenario == "disconnected-invoke")
            module.InvocationFailures["dispose"] = new JSDisconnectedException("disconnected");
        if (scenario == "disconnected-dispose")
            module.DisposeFailure = new JSDisconnectedException("disconnected");
        var interop = new FileFinderInterop(new RecordingJsRuntime(module));
        await using var interopLifetime = interop.ConfigureAwait(true);
        await interop.OpenAsync(new ElementReference("dialog")).ConfigureAwait(true);
        module.Trace.Clear();
        module.Calls.Clear();

        if (scenario == "invoke")
            Assert.That(
                await Assert
                    .ThrowsAsync<InvalidOperationException>(async () =>
                        await interop.DisposeAsync().ConfigureAwait(true)
                    )
                    .ConfigureAwait(true),
                Is.SameAs(invocationFailure)
            );
        else if (scenario == "dispose")
            Assert.That(
                await Assert
                    .ThrowsAsync<InvalidOperationException>(async () =>
                        await interop.DisposeAsync().ConfigureAwait(true)
                    )
                    .ConfigureAwait(true),
                Is.SameAs(disposeFailure)
            );
        else
            await interop.DisposeAsync().ConfigureAwait(true);

        var expected = scenario is "invoke" or "disconnected-invoke"
            ? new[] { "invoke:dispose" }
            : ["invoke:dispose", "module.DisposeAsync"];
        Assert.That(module.Trace, Is.EqualTo(expected));

        module.InvocationFailures.Remove("dispose");
        module.DisposeFailure = null;
        await interop.CloseAsync(true).ConfigureAwait(true);
        await interop.DisposeAsync().ConfigureAwait(true);
        using (Assert.EnterMultipleScope())
        {
            Assert.That(module.Calls[^2].Identifier, Is.EqualTo("close"));
            Assert.That(module.Calls[^2].Arguments, Is.EqualTo(new object?[] { true }));
            Assert.That(module.Trace.TakeLast(3), Is.EqualTo(expectedArray));
        }
    }
}
