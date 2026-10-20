using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class PortfolioInteropTests
{
    [Fact]
    public async Task InitializeAsync_ReimportsAndForwardsReferenceAndOptionsToLatestModule()
    {
        var first = new RecordingJsModule();
        var second = new RecordingJsModule();
        var runtime = new RecordingJsRuntime(first, second);
        var interop = new PortfolioInterop(runtime);
        using var reference = DotNetObjectReference.Create(new object());

        await interop.InitializeAsync(reference, false, ",");
        await interop.InitializeAsync(reference, true, " ");
        await interop.RefreshPreviewAsync();

        Assert.Equal(["import", "import"], runtime.Calls.Select(call => call.Identifier));
        Assert.Equal("./Pages/Home.razor.js", runtime.Calls[0].Arguments.Single());
        Assert.Equal("./Pages/Home.razor.js", runtime.Calls[1].Arguments.Single());
        Assert.Equal("initialize", first.Calls[0].Identifier);
        Assert.Same(reference, first.Calls[0].Arguments[0]);
        Assert.Equal(new object?[] { reference, false, "," }, first.Calls[0].Arguments);
        Assert.Equal(new object?[] { reference, true, " " }, second.Calls[0].Arguments);
        Assert.Equal("refreshPreview", second.Calls[1].Identifier);
        Assert.Empty(second.Calls[1].Arguments);
        Assert.Single(first.Calls);
    }

    [Theory]
    [InlineData("import")]
    [InlineData("initialize")]
    public async Task InitializeAsync_PropagatesFailuresAndPreservesOnlyAnImportedModule(string failureStage)
    {
        var sentinel = new InvalidOperationException(failureStage);
        var module = new RecordingJsModule();
        var runtime = new RecordingJsRuntime(module);
        var interop = new PortfolioInterop(runtime);
        using var reference = DotNetObjectReference.Create(new object());
        if (failureStage == "import")
            runtime.ImportFailure = sentinel;
        else
            module.InvocationFailures["initialize"] = sentinel;

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await interop.InitializeAsync(reference, false, ","));

        Assert.Same(sentinel, exception);
        Assert.Equal(new object?[] { "./Pages/Home.razor.js" }, runtime.Calls.Single().Arguments);
        if (failureStage == "import")
        {
            Assert.Empty(module.Calls);
            await interop.RefreshPreviewAsync();
            Assert.Empty(module.Calls);
        }
        else
        {
            module.InvocationFailures.Remove("initialize");
            await interop.RefreshPreviewAsync();
            Assert.Equal(["initialize", "refreshPreview"], module.Calls.Select(call => call.Identifier));
        }
    }

    [Fact]
    public async Task Forwarding_BeforeInitialization_IsInertAndBooleanCallsReturnFalse()
    {
        var runtime = new RecordingJsRuntime();
        var interop = new PortfolioInterop(runtime);

        await interop.SetKeyboardEnabledAsync(true);
        await interop.RefreshPreviewAsync();
        await interop.MoveCursorAsync("wordForward");
        Assert.False(await interop.FollowLinkAsync(true));
        await interop.JumpAsync(-2);
        await interop.JumpHeadingAsync(3);
        Assert.False(await interop.CopyTextAsync("copy me"));
        await interop.FocusCommandAsync();
        await interop.FocusPreviewAsync();
        await interop.FocusExplorerAsync(new ElementReference("explorer"));
        await interop.ApplyLeaderAsync(",");
        await interop.SetHelpOpenAsync(new ElementReference("help"), true);
        await interop.DisposeAsync();

        Assert.Empty(runtime.Calls);
    }

    [Fact]
    public async Task Forwarding_AfterInitialization_UsesExactIdentifiersArgumentsAndResults()
    {
        var module = new RecordingJsModule();
        module.Results["followLink"] = true;
        module.Results["copyText"] = false;
        var runtime = new RecordingJsRuntime(module);
        var interop = new PortfolioInterop(runtime);
        using var reference = DotNetObjectReference.Create(new object());
        var explorer = new ElementReference("explorer-7");
        var help = new ElementReference("help-dialog-2");
        await interop.InitializeAsync(reference, false, "!");
        module.Calls.Clear();

        await interop.SetKeyboardEnabledAsync(false);
        await interop.RefreshPreviewAsync();
        await interop.MoveCursorAsync("wordEndBackward");
        Assert.True(await interop.FollowLinkAsync(false));
        await interop.JumpAsync(-2);
        await interop.JumpHeadingAsync(3);
        Assert.False(await interop.CopyTextAsync("exact copy text"));
        await interop.FocusCommandAsync();
        await interop.FocusPreviewAsync();
        await interop.FocusExplorerAsync(explorer);
        await interop.ApplyLeaderAsync(",");
        await interop.SetHelpOpenAsync(help, true);

        Assert.Equal(
            ["setKeyboardEnabled", "refreshPreview", "moveCursor", "followLink", "jump", "jumpHeading",
             "copyText", "focusCommand", "focusPreview", "focusExplorer", "applyLeader", "setHelpOpen"],
            module.Calls.Select(call => call.Identifier));
        Assert.Equal(new object?[] { false }, module.Calls[0].Arguments);
        Assert.Empty(module.Calls[1].Arguments);
        Assert.Equal(new object?[] { "wordEndBackward" }, module.Calls[2].Arguments);
        Assert.Equal(new object?[] { false }, module.Calls[3].Arguments);
        Assert.Equal(new object?[] { -2 }, module.Calls[4].Arguments);
        Assert.Equal(new object?[] { 3 }, module.Calls[5].Arguments);
        Assert.Equal(new object?[] { "exact copy text" }, module.Calls[6].Arguments);
        Assert.Empty(module.Calls[7].Arguments);
        Assert.Empty(module.Calls[8].Arguments);
        Assert.Equal(explorer, Assert.IsType<ElementReference>(module.Calls[9].Arguments[0]));
        Assert.Equal(new object?[] { "," }, module.Calls[10].Arguments);
        Assert.Equal(help, Assert.IsType<ElementReference>(module.Calls[11].Arguments[0]));
        Assert.Equal(new object?[] { help, true }, module.Calls[11].Arguments);
    }

    [Fact]
    public async Task DisposeAsync_SuccessAndDisconnectsDisposeInOrderThenClearModule()
    {
        foreach (var disconnectAt in new[] { "invoke", "dispose", "none" })
        {
            var module = new RecordingJsModule();
            if (disconnectAt == "invoke")
                module.InvocationFailures["dispose"] = new JSDisconnectedException("disconnected");
            if (disconnectAt == "dispose")
                module.DisposeFailure = new JSDisconnectedException("disconnected");
            var interop = new PortfolioInterop(new RecordingJsRuntime(module));
            using var reference = DotNetObjectReference.Create(new object());
            await interop.InitializeAsync(reference, true, " ");
            module.Trace.Clear();
            module.Calls.Clear();

            await interop.DisposeAsync();
            var expectedTrace = disconnectAt == "invoke"
                ? new[] { "invoke:dispose" }
                : new[] { "invoke:dispose", "module.DisposeAsync" };
            Assert.Equal(expectedTrace, module.Trace);

            module.Trace.Clear();
            await interop.DisposeAsync();
            await interop.RefreshPreviewAsync();
            Assert.Empty(module.Trace);
            Assert.Single(module.Calls);
            Assert.Equal("dispose", module.Calls[0].Identifier);
        }
    }

    [Theory]
    [InlineData("invoke")]
    [InlineData("dispose")]
    public async Task DisposeAsync_NonDisconnectFailurePropagatesAndRetainsModule(string failureStage)
    {
        var sentinel = new InvalidOperationException(failureStage);
        var module = new RecordingJsModule();
        if (failureStage == "invoke")
            module.InvocationFailures["dispose"] = sentinel;
        else
            module.DisposeFailure = sentinel;
        var interop = new PortfolioInterop(new RecordingJsRuntime(module));
        using var reference = DotNetObjectReference.Create(new object());
        await interop.InitializeAsync(reference, true, " ");
        module.Trace.Clear();
        module.Calls.Clear();

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(async () => await interop.DisposeAsync());

        Assert.Same(sentinel, exception);
        Assert.Equal(failureStage == "invoke"
            ? ["invoke:dispose"]
            : ["invoke:dispose", "module.DisposeAsync"], module.Trace);
        module.InvocationFailures.Remove("dispose");
        module.DisposeFailure = null;
        await interop.RefreshPreviewAsync();
        Assert.Equal("refreshPreview", module.Calls[^1].Identifier);
        await interop.DisposeAsync();
        Assert.Equal("module.DisposeAsync", module.Trace[^1]);
        module.Trace.Clear();
        await interop.DisposeAsync();
        await interop.RefreshPreviewAsync();
        Assert.Empty(module.Trace);
    }
}
