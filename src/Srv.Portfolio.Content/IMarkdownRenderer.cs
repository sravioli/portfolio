using Srv.Portfolio.Models;

namespace Srv.Portfolio.Services;

public interface IMarkdownRenderer
{
    string Render(string source, PortfolioEntry entry);
}
