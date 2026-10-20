namespace Srv.Portfolio.Services;

internal sealed class CommandHistory
{
    private readonly List<string> _commands = [];
    private int _position;
    private string _draft = string.Empty;

    public void Add(string command)
    {
        if (!string.IsNullOrWhiteSpace(command.TrimStart(':')))
        {
            _commands.Add(command);
        }

        Reset();
    }

    public string Previous(string currentText)
    {
        if (_commands.Count == 0)
        {
            return currentText;
        }

        if (_position == _commands.Count)
        {
            _draft = currentText;
        }

        if (_position > 0)
        {
            _position--;
        }

        return _commands[_position];
    }

    public string Next(string currentText)
    {
        if (_commands.Count == 0 || _position >= _commands.Count)
        {
            return currentText;
        }

        _position++;
        return _position == _commands.Count ? _draft : _commands[_position];
    }

    public void Reset()
    {
        _position = _commands.Count;
        _draft = string.Empty;
    }
}
