using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class PortfolioInteropTests
{
    private static readonly string[] InvocationTrace = ["invoke:dispose"];
    private static readonly string[] DisposalTrace = ["invoke:dispose", "module.DisposeAsync"];

    [Test]
    public async Task InitializeAsyncReimportsAndForwardsReferenceAndOptionsToLatestModule()
    {
        var first = new RecordingJsModule();
        var second = new RecordingJsModule();
        var runtime = new RecordingJsRuntime(first, second);
        var interop = new PortfolioInterop(runtime);
        await using var interopLifetime = interop.ConfigureAwait(true);
        using var reference = DotNetObjectReference.Create(new object());

        await interop.InitializeAsync(reference, false, ",").ConfigureAwait(true);
        await interop.InitializeAsync(reference, true, " ").ConfigureAwait(true);
        await interop.RefreshPreviewAsync().ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                runtime.Calls.Select(call => call.Identifier),
                Is.EqualTo(new object?[] { "import", "import" })
            );
            Assert.That(runtime.Calls[0].Arguments.Single(), Is.EqualTo("./Pages/Home.razor.js"));
            Assert.That(runtime.Calls[1].Arguments.Single(), Is.EqualTo("./Pages/Home.razor.js"));
            Assert.That(first.Calls[0].Identifier, Is.EqualTo("initialize"));
            Assert.That(first.Calls[0].Arguments[0], Is.SameAs(reference));
            Assert.That(
                first.Calls[0].Arguments,
                Is.EqualTo(new object?[] { reference, false, "," })
            );
            Assert.That(
                second.Calls[0].Arguments,
                Is.EqualTo(new object?[] { reference, true, " " })
            );
            Assert.That(second.Calls[1].Identifier, Is.EqualTo("refreshPreview"));
            Assert.That(second.Calls[1].Arguments, Is.Empty);
            Assert.That(first.Calls, Has.Count.EqualTo(1));
        }
    }

    [TestCase("import")]
    [TestCase("initialize")]
    public async Task InitializeAsyncPropagatesFailuresAndPreservesOnlyAnImportedModule(
        string failureStage
    )
    {
        var sentinel = new InvalidOperationException(failureStage);
        var module = new RecordingJsModule();
        var runtime = new RecordingJsRuntime(module);
        var interop = new PortfolioInterop(runtime);
        await using var interopLifetime = interop.ConfigureAwait(true);
        using var reference = DotNetObjectReference.Create(new object());
        if (failureStage == "import")
            runtime.ImportFailure = sentinel;
        else
            module.InvocationFailures["initialize"] = sentinel;

        var exception = await Assert
            .ThrowsAsync<InvalidOperationException>(async () =>
                await interop.InitializeAsync(reference, false, ",").ConfigureAwait(true)
            )
            .ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(exception, Is.SameAs(sentinel));
            Assert.That(
                runtime.Calls.Single().Arguments,
                Is.EqualTo(new object?[] { "./Pages/Home.razor.js" })
            );
        }
        if (failureStage == "import")
        {
            Assert.That(module.Calls, Is.Empty);
            await interop.RefreshPreviewAsync().ConfigureAwait(true);
            Assert.That(module.Calls, Is.Empty);
        }
        else
        {
            module.InvocationFailures.Remove("initialize");
            await interop.RefreshPreviewAsync().ConfigureAwait(true);
            Assert.That(
                module.Calls.Select(call => call.Identifier),
                Is.EqualTo(new object?[] { "initialize", "refreshPreview" })
            );
        }
    }

    [Test]
    public async Task ForwardingBeforeInitializationIsInertAndBooleanCallsReturnFalse()
    {
        var runtime = new RecordingJsRuntime();
        var interop = new PortfolioInterop(runtime);
        await using var interopLifetime = interop.ConfigureAwait(true);

        await interop.SetKeyboardEnabledAsync(true).ConfigureAwait(true);
        await interop.RefreshPreviewAsync().ConfigureAwait(true);
        await interop.MoveCursorAsync("wordForward").ConfigureAwait(true);
        Assert.That(await interop.FollowLinkAsync(true).ConfigureAwait(true), Is.False);
        await interop.JumpAsync(-2).ConfigureAwait(true);
        await interop.JumpHeadingAsync(3).ConfigureAwait(true);
        Assert.That(await interop.CopyTextAsync("copy me").ConfigureAwait(true), Is.False);
        await interop.FocusCommandAsync().ConfigureAwait(true);
        await interop.FocusPreviewAsync().ConfigureAwait(true);
        await interop.FocusExplorerAsync(new ElementReference("explorer")).ConfigureAwait(true);
        await interop.ApplyLeaderAsync(",").ConfigureAwait(true);
        await interop.SetHelpOpenAsync(new ElementReference("help"), true).ConfigureAwait(true);
        await interop.DisposeAsync().ConfigureAwait(true);

        Assert.That(runtime.Calls, Is.Empty);
    }

    [Test]
    public async Task ForwardingAfterInitializationUsesExactIdentifiersArgumentsAndResults()
    {
        var module = new RecordingJsModule();
        module.Results["followLink"] = true;
        module.Results["copyText"] = false;
        var runtime = new RecordingJsRuntime(module);
        var interop = new PortfolioInterop(runtime);
        await using var interopLifetime = interop.ConfigureAwait(true);
        using var reference = DotNetObjectReference.Create(new object());
        var explorer = new ElementReference("explorer-7");
        var help = new ElementReference("help-dialog-2");
        await interop.InitializeAsync(reference, false, "!").ConfigureAwait(true);
        module.Calls.Clear();

        await interop.SetKeyboardEnabledAsync(false).ConfigureAwait(true);
        await interop.RefreshPreviewAsync().ConfigureAwait(true);
        await interop.MoveCursorAsync("wordEndBackward").ConfigureAwait(true);
        Assert.That(await interop.FollowLinkAsync(false).ConfigureAwait(true), Is.True);
        await interop.JumpAsync(-2).ConfigureAwait(true);
        await interop.JumpHeadingAsync(3).ConfigureAwait(true);
        Assert.That(await interop.CopyTextAsync("exact copy text").ConfigureAwait(true), Is.False);
        await interop.FocusCommandAsync().ConfigureAwait(true);
        await interop.FocusPreviewAsync().ConfigureAwait(true);
        await interop.FocusExplorerAsync(explorer).ConfigureAwait(true);
        await interop.ApplyLeaderAsync(",").ConfigureAwait(true);
        await interop.SetHelpOpenAsync(help, true).ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                module.Calls.Select(call => call.Identifier),
                Is.EqualTo(
                    new object?[]
                    {
                        "setKeyboardEnabled",
                        "refreshPreview",
                        "moveCursor",
                        "followLink",
                        "jump",
                        "jumpHeading",
                        "copyText",
                        "focusCommand",
                        "focusPreview",
                        "focusExplorer",
                        "applyLeader",
                        "setHelpOpen",
                    }
                )
            );
            Assert.That(module.Calls[0].Arguments, Is.EqualTo(new object?[] { false }));
            Assert.That(module.Calls[1].Arguments, Is.Empty);
            Assert.That(module.Calls[2].Arguments, Is.EqualTo(new object?[] { "wordEndBackward" }));
            Assert.That(module.Calls[3].Arguments, Is.EqualTo(new object?[] { false }));
            Assert.That(module.Calls[4].Arguments, Is.EqualTo(new object?[] { -2 }));
            Assert.That(module.Calls[5].Arguments, Is.EqualTo(new object?[] { 3 }));
            Assert.That(module.Calls[6].Arguments, Is.EqualTo(new object?[] { "exact copy text" }));
            Assert.That(module.Calls[7].Arguments, Is.Empty);
            Assert.That(module.Calls[8].Arguments, Is.Empty);
            Assert.That(module.Calls[9].Arguments[0], Is.TypeOf<ElementReference>());
        }

        using (Assert.EnterMultipleScope())
        {
            Assert.That(module.Calls[9].Arguments[0], Is.EqualTo(explorer));
            Assert.That(module.Calls[10].Arguments, Is.EqualTo(new object?[] { "," }));
            Assert.That(module.Calls[11].Arguments[0], Is.TypeOf<ElementReference>());
        }
        using (Assert.EnterMultipleScope())
        {
            Assert.That(module.Calls[11].Arguments[0], Is.EqualTo(help));
            Assert.That(module.Calls[11].Arguments, Is.EqualTo(new object?[] { help, true }));
        }
    }

    [Test]
    public async Task DisposeAsyncSuccessAndDisconnectsDisposeInOrderThenClearModule()
    {
        foreach (var disconnectAt in new[] { "invoke", "dispose", "none" })
        {
            var module = new RecordingJsModule();
            if (disconnectAt == "invoke")
                module.InvocationFailures["dispose"] = new JSDisconnectedException("disconnected");
            if (disconnectAt == "dispose")
                module.DisposeFailure = new JSDisconnectedException("disconnected");
            var interop = new PortfolioInterop(new RecordingJsRuntime(module));
            await using var interopLifetime = interop.ConfigureAwait(true);
            using var reference = DotNetObjectReference.Create(new object());
            await interop.InitializeAsync(reference, true, " ").ConfigureAwait(true);
            module.Trace.Clear();
            module.Calls.Clear();

            await interop.DisposeAsync().ConfigureAwait(true);
            var expectedTrace = disconnectAt == "invoke" ? InvocationTrace : DisposalTrace;
            Assert.That(module.Trace, Is.EqualTo(expectedTrace));

            module.Trace.Clear();
            await interop.DisposeAsync().ConfigureAwait(true);
            await interop.RefreshPreviewAsync().ConfigureAwait(true);
            using (Assert.EnterMultipleScope())
            {
                Assert.That(module.Trace, Is.Empty);
                Assert.That(module.Calls, Has.Count.EqualTo(1));
            }
            Assert.That(module.Calls[0].Identifier, Is.EqualTo("dispose"));
        }
    }

    [TestCase("invoke")]
    [TestCase("dispose")]
    public async Task DisposeAsyncNonDisconnectFailurePropagatesAndRetainsModule(
        string failureStage
    )
    {
        var sentinel = new InvalidOperationException(failureStage);
        var module = new RecordingJsModule();
        if (failureStage == "invoke")
            module.InvocationFailures["dispose"] = sentinel;
        else
            module.DisposeFailure = sentinel;
        var interop = new PortfolioInterop(new RecordingJsRuntime(module));
        await using var interopLifetime = interop.ConfigureAwait(true);
        using var reference = DotNetObjectReference.Create(new object());
        await interop.InitializeAsync(reference, true, " ").ConfigureAwait(true);
        module.Trace.Clear();
        module.Calls.Clear();

        var exception = await Assert
            .ThrowsAsync<InvalidOperationException>(async () =>
                await interop.DisposeAsync().ConfigureAwait(true)
            )
            .ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(exception, Is.SameAs(sentinel));
            Assert.That(
                module.Trace,
                Is.EqualTo(failureStage == "invoke" ? InvocationTrace : DisposalTrace)
            );
        }
        module.InvocationFailures.Remove("dispose");
        module.DisposeFailure = null;
        await interop.RefreshPreviewAsync().ConfigureAwait(true);
        Assert.That(module.Calls[^1].Identifier, Is.EqualTo("refreshPreview"));
        await interop.DisposeAsync().ConfigureAwait(true);
        Assert.That(module.Trace[^1], Is.EqualTo("module.DisposeAsync"));
        module.Trace.Clear();
        await interop.DisposeAsync().ConfigureAwait(true);
        await interop.RefreshPreviewAsync().ConfigureAwait(true);
        Assert.That(module.Trace, Is.Empty);
    }
}
