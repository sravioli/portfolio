namespace Srv.Portfolio.Services;

internal static class CancellationSources
{
    internal static void CancelAndDispose(ref CancellationTokenSource? cancellation)
    {
        cancellation?.Cancel();
        cancellation?.Dispose();
        cancellation = null;
    }
}
