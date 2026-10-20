using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class FileFinderInteropTests
{
    [Fact]
    public async Task OpenAsync_EveryOpenReimportsAndForwardsDialogToReturnedModule()
    {
        var first = new RecordingJsModule();
        var second = new RecordingJsModule();
        var runtime = new RecordingJsRuntime(first, second);
        var interop = new FileFinderInterop(runtime);
        var dialog = new ElementReference("finder-dialog");

        await interop.OpenAsync(dialog);
        await interop.OpenAsync(dialog);

        Assert.Equal(["import", "import"], runtime.Calls.Select(call => call.Identifier));
        Assert.Equal("./Pages/FileFinder.razor.js", runtime.Calls[0].Arguments.Single());
        Assert.Equal("./Pages/FileFinder.razor.js", runtime.Calls[1].Arguments.Single());
        Assert.Equal(new object?[] { dialog }, first.Calls.Single().Arguments);
        Assert.Equal("open", first.Calls.Single().Identifier);
        Assert.Equal(new object?[] { dialog }, second.Calls.Single().Arguments);
        Assert.Equal("open", second.Calls.Single().Identifier);
    }

    [Theory]
    [InlineData("import")]
    [InlineData("open")]
    public async Task OpenAsync_PropagatesFailuresAndRetainsOnlyAnImportedModule(string failureStage)
    {
        var sentinel = new InvalidOperationException(failureStage);
        var module = new RecordingJsModule();
        var runtime = new RecordingJsRuntime(module);
        var interop = new FileFinderInterop(runtime);
        var dialog = new ElementReference("dialog");
        if (failureStage == "import")
            runtime.ImportFailure = sentinel;
        else
            module.InvocationFailures["open"] = sentinel;

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(async () => await interop.OpenAsync(dialog));

        Assert.Same(sentinel, exception);
        Assert.Equal("./Pages/FileFinder.razor.js", runtime.Calls.Single().Arguments.Single());
        if (failureStage == "import")
            Assert.Empty(module.Calls);
        else
            Assert.Equal("open", module.Calls.Single().Identifier);
        await interop.CloseAsync(true);
        var expectedCalls = failureStage == "import" ? Array.Empty<string>() : new[] { "open", "close" };
        Assert.Equal(expectedCalls, module.Calls.Select(call => call.Identifier));
        if (failureStage == "open")
        {
            module.InvocationFailures.Remove("open");
            Assert.Equal("close", module.Calls[^1].Identifier);
            Assert.Equal(new object?[] { true }, module.Calls[^1].Arguments);
        }
    }

    [Fact]
    public async Task CloseAsync_BeforeOpenIsSafeAndForwardsBothRestoreFocusValues()
    {
        var module = new RecordingJsModule();
        var interop = new FileFinderInterop(new RecordingJsRuntime(module));

        await interop.CloseAsync(true);
        Assert.Empty(module.Calls);

        await interop.OpenAsync(new ElementReference("dialog"));
        module.Calls.Clear();
        await interop.CloseAsync(false);
        await interop.CloseAsync(true);

        Assert.Equal(["close", "close"], module.Calls.Select(call => call.Identifier));
        Assert.Equal(new object?[] { false }, module.Calls[0].Arguments);
        Assert.Equal(new object?[] { true }, module.Calls[1].Arguments);
    }

    [Fact]
    public async Task DisposeAsync_BeforeOpenIsSafe()
    {
        var runtime = new RecordingJsRuntime();

        await new FileFinderInterop(runtime).DisposeAsync();

        Assert.Empty(runtime.Calls);
    }

    [Theory]
    [InlineData("invoke")]
    [InlineData("dispose")]
    [InlineData("success")]
    [InlineData("disconnected-invoke")]
    [InlineData("disconnected-dispose")]
    public async Task DisposeAsync_RecordsOrderedStagesAndRetainsModuleAfterAnyOutcome(string scenario)
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
        await interop.OpenAsync(new ElementReference("dialog"));
        module.Trace.Clear();
        module.Calls.Clear();

        if (scenario == "invoke")
            Assert.Same(invocationFailure,
                await Assert.ThrowsAsync<InvalidOperationException>(async () => await interop.DisposeAsync()));
        else if (scenario == "dispose")
            Assert.Same(disposeFailure,
                await Assert.ThrowsAsync<InvalidOperationException>(async () => await interop.DisposeAsync()));
        else
            await interop.DisposeAsync();

        var expected = scenario is "invoke" or "disconnected-invoke"
            ? new[] { "invoke:dispose" }
            : new[] { "invoke:dispose", "module.DisposeAsync" };
        Assert.Equal(expected, module.Trace);

        module.InvocationFailures.Remove("dispose");
        module.DisposeFailure = null;
        await interop.CloseAsync(true);
        await interop.DisposeAsync();
        Assert.Equal("close", module.Calls[^2].Identifier);
        Assert.Equal(new object?[] { true }, module.Calls[^2].Arguments);
        Assert.Equal(new[] { "invoke:close", "invoke:dispose", "module.DisposeAsync" }, module.Trace.TakeLast(3));
    }
}
