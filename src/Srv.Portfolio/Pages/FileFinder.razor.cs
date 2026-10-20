using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Srv.Portfolio.Models;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Pages;

public partial class FileFinder
{
    [Parameter] public EventCallback<PortfolioEntry> OnOpen { get; set; }
    [Parameter] public EventCallback OnClose { get; set; }

    private IReadOnlyList<FileSearchResult> _results = FileSearch.Search(string.Empty);
    private readonly int _totalCount = PortfolioCatalog.AllEntries().Count();
    private int _selectedIndex;
    private string _query = string.Empty;
    private string? _preview;
    private string? _error;
    private bool _loading;
    private bool _disposed;
    private CancellationTokenSource? _previewCancellation;
    private ElementReference _dialog;
    private ElementReference _input;
    private FileFinderInterop? _interop;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            _interop = new FileFinderInterop(JS);
            await _interop.OpenAsync(_dialog);
            await LoadPreview();
        }
    }

    private async Task Filter(ChangeEventArgs args)
    {
        _query = args.Value?.ToString() ?? string.Empty;
        _results = FileSearch.Search(_query);
        _selectedIndex = 0;
        await LoadPreview();
    }

    private async Task SelectResult(int index)
    {
        _selectedIndex = Math.Clamp(index, 0, Math.Max(0, _results.Count - 1));
        await _input.FocusAsync(preventScroll: true);
        await LoadPreview();
    }

    private async Task LoadPreview()
    {
        _previewCancellation?.Cancel();
        _previewCancellation?.Dispose();
        _previewCancellation = null;
        _preview = null;
        _error = null;
        _loading = false;
        if (_results.Count == 0 || _disposed)
        {
            return;
        }

        var cancellation = new CancellationTokenSource();
        _previewCancellation = cancellation;
        _loading = true;
        await InvokeAsync(StateHasChanged);
        try
        {
            var source = await Readmes.GetAsync(_results[_selectedIndex].Entry, cancellation.Token);
            if (!cancellation.IsCancellationRequested && !_disposed)
            {
                _preview = source;
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException)
        {
            if (!cancellation.IsCancellationRequested && !_disposed)
            {
                _error = exception.Message;
            }
        }
        finally
        {
            if (ReferenceEquals(_previewCancellation, cancellation))
            {
                _previewCancellation = null;
                _loading = false;
                cancellation.Dispose();
                if (!_disposed)
                {
                    await InvokeAsync(StateHasChanged);
                }
            }
        }
    }

    private async Task HandleKey(KeyboardEventArgs args)
    {
        if (args.Key == "Escape")
        {
            await Close();
        }
        else if (args.Key == "Enter")
        {
            await OpenSelected();
        }
        else if (args.Key is "ArrowDown" or "ArrowUp" ||
                 (args.CtrlKey && args.Key is "j" or "k" or "n" or "p"))
        {
            var down = args.Key is "ArrowDown" or "j" or "n";
            await SelectResult(_selectedIndex + (down ? 1 : -1));
        }
    }

    private async Task OpenSelected()
    {
        if (_results.Count == 0)
        {
            return;
        }

        var entry = _results[_selectedIndex].Entry;
        await (_interop?.CloseAsync(restoreFocus: false) ?? ValueTask.CompletedTask);
        await OnOpen.InvokeAsync(entry);
    }

    private async Task Close()
    {
        await (_interop?.CloseAsync(restoreFocus: true) ?? ValueTask.CompletedTask);
        await OnClose.InvokeAsync();
    }

    public async ValueTask DisposeAsync()
    {
        _disposed = true;
        _previewCancellation?.Cancel();
        _previewCancellation?.Dispose();
        _previewCancellation = null;
        if (_interop is not null)
        {
            await _interop.DisposeAsync();
        }
    }
}
