using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Srv.Portfolio.Models;
using Srv.Portfolio.Pages;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Pages;

[TestFixture]
internal sealed class ExplorerTreeTests
{
    [TestCase(0)]
    [TestCase(1)]
    [TestCase(4)]
    public async Task OnClick_VisibleEntry_InvokesOpenOnce(int index)
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        await using var renderer = new TreeRenderer(services);
        var opened = new List<int>();
        var state = new NavigationState();

        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var id = renderer.Attach(new ExplorerTree());
            await renderer.RenderAsync(id, ParameterView.FromDictionary(new Dictionary<string, object?>
            {
                [nameof(ExplorerTree.Entries)] = state.Entries,
                [nameof(ExplorerTree.OnOpen)] = EventCallback.Factory.Create<int>(
                    opened, (int entry) => opened.Add(entry)),
            }));

            var events = renderer.Events(id);
            Assert.That(events.Count(item => item.Name == "onclick"), Is.EqualTo(state.Entries.Count));
            Assert.That(events.Any(item => item.Name == "ondblclick"), Is.False);

            await renderer.ClickAsync(events.Where(item => item.Name == "onclick").ElementAt(index).Id);
        });

        Assert.That(opened, Is.EqualTo(new[] { index }));
    }

    [Test]
    public async Task SetParameters_UnchangedEntriesAndSelection_SkipsRender()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        await using var renderer = new TreeRenderer(services);
        var state = new NavigationState();
        var opened = new List<int>();

        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var id = renderer.Attach(new ExplorerTree());
            Task RenderAsync(int selectedIndex, object receiver) =>
                renderer.RenderAsync(id, ParameterView.FromDictionary(new Dictionary<string, object?>
                {
                    [nameof(ExplorerTree.Entries)] = state.Entries,
                    [nameof(ExplorerTree.SelectedIndex)] = selectedIndex,
                    [nameof(ExplorerTree.OnOpen)] = EventCallback.Factory.Create<int>(
                        receiver, (int entry) => opened.Add(entry)),
                }));

            await RenderAsync(0, opened);
            Assert.That(renderer.RenderedComponents, Is.EqualTo(1));

            await RenderAsync(0, new object());
            Assert.That(renderer.RenderedComponents, Is.EqualTo(1));

            await RenderAsync(1, opened);
            Assert.That(renderer.RenderedComponents, Is.EqualTo(2));
            Assert.That(SelectedButtons(renderer.Frames(id)), Is.EqualTo(new[] { 1 }));

            var folder = state.Entries.Select((item, index) => (item, index))
                .First(pair => pair.item.Kind == ExplorerItemKind.Folder).index;
            state.SelectIndex(folder);
            state.OpenSelected();
            await RenderAsync(1, opened);
            Assert.That(renderer.RenderedComponents, Is.EqualTo(3));
            Assert.That(renderer.Events(id).Count(item => item.Name == "onclick"), Is.EqualTo(state.Entries.Count));

            await renderer.ClickAsync(renderer.Events(id).First(item => item.Name == "onclick").Id);
        });

        Assert.That(opened, Is.EqualTo(new[] { 0 }));
    }

#pragma warning disable BL0006
    private static int[] SelectedButtons(ArrayRange<RenderTreeFrame> frames)
    {
        var selected = new List<int>();
        var button = -1;
        for (var index = 0; index < frames.Count; index++)
        {
            var frame = frames.Array[index];
            if (frame.FrameType == RenderTreeFrameType.Element && frame.ElementName == "button")
            {
                button++;
            }
            else if (frame.FrameType == RenderTreeFrameType.Attribute && frame.AttributeName == "class"
                && frame.AttributeValue is string value && value.Contains("selected", StringComparison.Ordinal))
            {
                selected.Add(button);
            }
        }

        return [.. selected];
    }
#pragma warning restore BL0006

    [TestCase(0)]
    [TestCase(2)]
    public async Task OnClick_SearchResult_OpensClickedFileOnce(int index)
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        await using var renderer = new TreeRenderer(services);
        var opened = new List<PortfolioEntry>();
        var results = FileSearch.Search(string.Empty);

        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var id = renderer.Attach(new FinderWithoutPreview());
            await renderer.RenderAsync(id, ParameterView.FromDictionary(new Dictionary<string, object?>
            {
                [nameof(FileFinder.OnOpen)] = EventCallback.Factory.Create<PortfolioEntry>(
                    opened, (PortfolioEntry entry) => opened.Add(entry)),
            }));

            var events = renderer.Events(id);
            Assert.That(events.Any(item => item.Name == "ondblclick"), Is.False);
            await renderer.ClickAsync(events.Where(item => item.Name == "onclick").ElementAt(index).Id);
        });

        Assert.That(opened, Is.EqualTo(new[] { results[index].Entry }));
    }

    [Test]
    public async Task OnKeyDown_EnterInSearch_OpensSelectedFileOnce()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        await using var renderer = new TreeRenderer(services);
        var opened = new List<PortfolioEntry>();

        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var id = renderer.Attach(new FinderWithoutPreview());
            await renderer.RenderAsync(id, ParameterView.FromDictionary(new Dictionary<string, object?>
            {
                [nameof(FileFinder.OnOpen)] = EventCallback.Factory.Create<PortfolioEntry>(
                    opened, (PortfolioEntry entry) => opened.Add(entry)),
            }));

            await renderer.KeyAsync(renderer.Events(id).Single(item => item.Name == "onkeydown").Id, "Enter");
        });

        Assert.That(opened, Is.EqualTo(new[] { FileSearch.Search(string.Empty)[0].Entry }));
    }

    private sealed class FinderWithoutPreview : FileFinder
    {
        protected override Task OnAfterRenderAsync(bool firstRender) => Task.CompletedTask;
    }

    // Capture Blazor's real event bindings without introducing a browser-test dependency.
#pragma warning disable BL0006
    internal sealed class TreeRenderer(IServiceProvider services)
        : Renderer(services, NullLoggerFactory.Instance)
    {
        public override Dispatcher Dispatcher { get; } = Dispatcher.CreateDefault();

        public int RenderedComponents { get; private set; }

        public int Attach(IComponent component) => AssignRootComponentId(component);

        public ArrayRange<RenderTreeFrame> Frames(int id) => GetCurrentRenderTreeFrames(id);

        public Task RenderAsync(int id, ParameterView parameters) =>
            RenderRootComponentAsync(id, parameters);

        public Task ClickAsync(ulong eventId) =>
            DispatchEventAsync(eventId, null, new MouseEventArgs());

        public Task KeyAsync(ulong eventId, string key) =>
            DispatchEventAsync(eventId, null, new KeyboardEventArgs { Key = key });

        public List<(string Name, ulong Id)> Events(int id)
        {
            var frames = GetCurrentRenderTreeFrames(id);
            var events = new List<(string, ulong)>();
            for (var index = 0; index < frames.Count; index++)
            {
                var frame = frames.Array[index];
                if (frame.FrameType == RenderTreeFrameType.Attribute && frame.AttributeEventHandlerId != 0)
                {
                    events.Add((frame.AttributeName, frame.AttributeEventHandlerId));
                }
            }
            return events;
        }

        protected override Task UpdateDisplayAsync(in RenderBatch renderBatch)
        {
            RenderedComponents += renderBatch.UpdatedComponents.Count;
            return Task.CompletedTask;
        }

        protected override void HandleException(Exception exception) =>
            System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(exception).Throw();
    }
#pragma warning restore BL0006
}
