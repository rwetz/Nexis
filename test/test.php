<?php
// Test PHP file — Nexis editor playground
// Exercises: declare(strict_types=1), final class, constructor property promotion,
//            readonly properties, null coalescing (??), __toString, type hints.

declare(strict_types=1);

// ── Config ────────────────────────────────────────────────────────────────────

final class Config
{
    private array $settings = [];

    public function __construct(
        public readonly string $host,
        public readonly int    $port,
    ) {}

    public function set(string $key, string $value): void
    {
        $this->settings[$key] = $value;
    }

    public function get(string $key, string $default = ''): string
    {
        return $this->settings[$key] ?? $default;
    }

    public function __toString(): string
    {
        return "Config(host={$this->host}, port={$this->port})";
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function greet(string $name): string
{
    return "Hello, {$name}!";
}

function fibonacci(int $n): int
{
    if ($n <= 0) return 0;
    $a = 0;
    $b = 1;
    for ($i = 1; $i < $n; $i++) {
        [$a, $b] = [$b, $a + $b];
    }
    return $b;
}

// ── Entry point ───────────────────────────────────────────────────────────────

function main(): void
{
    $cfg = new Config('localhost', 8080);
    $cfg->set('theme', 'dark');
    $cfg->set('lang', 'php');

    echo greet('Nexis') . PHP_EOL;
    echo "Port: {$cfg->port}" . PHP_EOL;
    echo "Theme: {$cfg->get('theme', 'default')}" . PHP_EOL;

    for ($i = 0; $i < 10; $i++) {
        echo "fib({$i}) = " . fibonacci($i) . PHP_EOL;
    }
}

main();
