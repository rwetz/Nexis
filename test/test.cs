// Test C# file — Nexis editor playground
// Mirrors the structure of test.rs: Config class, greeting, fibonacci, main.

using System;
using System.Collections.Generic;

// ── Config ────────────────────────────────────────────────────────────────────

class Config
{
    public string Host { get; }
    public int Port { get; }
    private readonly Dictionary<string, string> _settings = new();

    public Config(string host, int port)
    {
        Host = host;
        Port = port;
    }

    public void Set(string key, string value) => _settings[key] = value;

    public string Get(string key) =>
        _settings.TryGetValue(key, out var val) ? val : string.Empty;

    public override string ToString() =>
        $"Config {{ Host={Host}, Port={Port} }}";
}

// ── Program ───────────────────────────────────────────────────────────────────

class Program
{
    static string Greet(string name) => $"Hello, {name}!";

    static long Fibonacci(int n)
    {
        if (n <= 0) return 0;
        if (n == 1) return 1;
        long a = 0, b = 1;
        for (int i = 2; i <= n; i++)
        {
            (a, b) = (b, a + b);
        }
        return b;
    }

    static void Main()
    {
        var cfg = new Config("localhost", 8080);
        cfg.Set("theme", "dark");
        cfg.Set("lang", "csharp");

        Console.WriteLine(Greet("Nexis"));
        Console.WriteLine($"Port: {cfg.Port}");
        Console.WriteLine($"Theme: {cfg.Get("theme")}");

        for (int i = 0; i < 10; i++)
        {
            Console.WriteLine($"fib({i}) = {Fibonacci(i)}");
        }
    }
}
