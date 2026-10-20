using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class CancellationSourcesTests
{
    [Test]
    public void CancelAndDisposeNullReferenceIsANoOp()
    {
        CancellationTokenSource? cancellation = null;

        CancellationSources.CancelAndDispose(ref cancellation);

        Assert.That(cancellation, Is.Null);
    }

    [Test]
    public void CancelAndDisposeInvokesCallbacksThenDisposesAndClearsReference()
    {
        CancellationTokenSource? cancellation = new();
        var original = cancellation;
        var callbackObservedCancellation = false;
        cancellation.Token.Register(() =>
            callbackObservedCancellation = cancellation!.IsCancellationRequested
        );

        CancellationSources.CancelAndDispose(ref cancellation);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(callbackObservedCancellation, Is.True);
            Assert.That(cancellation, Is.Null);
        }
        Assert.Throws<ObjectDisposedException>(() => _ = original.Token);
    }

    [Test]
    public void CancelAndDisposeWhenCallbackThrowsRetainsCanceledUsableSource()
    {
        var sentinel = new InvalidOperationException("callback failed");
        CancellationTokenSource? cancellation = new();
        var original = cancellation;
        original.Token.Register(() => throw sentinel);

        var exception = Assert.Throws<AggregateException>(() =>
            CancellationSources.CancelAndDispose(ref cancellation)
        );

        using (Assert.EnterMultipleScope())
        {
            Assert.That(exception.InnerExceptions, Does.Contain(sentinel));
            Assert.That(cancellation, Is.SameAs(original));
            Assert.That(original.IsCancellationRequested, Is.True);
            Assert.That(original.Token.IsCancellationRequested, Is.True);
        }
        original.Dispose();
    }
}
