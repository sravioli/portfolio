using Srv.Portfolio.Models;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Rendering;

public sealed class MarkdownRenderer : IMarkdownRenderer
{
    public string Render(string source, PortfolioEntry entry) => MarkdownProcessor.Render(source, entry);
}
