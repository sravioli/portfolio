using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class CancellationSourcesTests
{
    [Fact]
    public void CancelAndDispose_NullReference_IsANoOp()
    {
        CancellationTokenSource? cancellation = null;

        CancellationSources.CancelAndDispose(ref cancellation);

        Assert.Null(cancellation);
    }

    [Fact]
    public void CancelAndDispose_InvokesCallbacksThenDisposesAndClearsReference()
    {
        CancellationTokenSource? cancellation = new();
        var original = cancellation;
        var callbackObservedCancellation = false;
        cancellation.Token.Register(() => callbackObservedCancellation = cancellation!.IsCancellationRequested);

        CancellationSources.CancelAndDispose(ref cancellation);

        Assert.True(callbackObservedCancellation);
        Assert.Null(cancellation);
        Assert.Throws<ObjectDisposedException>(() => _ = original.Token);
    }

    [Fact]
    public void CancelAndDispose_WhenCallbackThrows_RetainsCanceledUsableSource()
    {
        var sentinel = new InvalidOperationException("callback failed");
        CancellationTokenSource? cancellation = new();
        var original = cancellation;
        original.Token.Register(() => throw sentinel);

        var exception = Assert.Throws<AggregateException>(() => CancellationSources.CancelAndDispose(ref cancellation));

        Assert.Contains(sentinel, exception.InnerExceptions);
        Assert.Same(original, cancellation);
        Assert.True(original.IsCancellationRequested);
        Assert.True(original.Token.IsCancellationRequested);
        original.Dispose();
    }
}
