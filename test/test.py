# Test Python file — Nexis editor playground
# Mirrors the structure of test.rs: Config class, greeting, fibonacci, main.

from __future__ import annotations
from dataclasses import dataclass, field


# ── Config ────────────────────────────────────────────────────────────────────

@dataclass
class Config:
    host: str
    port: int
    settings: dict[str, str] = field(default_factory=dict)

    def set(self, key: str, value: str) -> None:
        self.settings[key] = value

    def get(self, key: str, default: str = "") -> str:
        return self.settings.get(key, default)

    def __str__(self) -> str:
        return f"Config(host={self.host!r}, port={self.port})"


# ── Helpers ───────────────────────────────────────────────────────────────────

def greet(name: str) -> str:
    return f"Hello, {name}!"


def fibonacci(n: int) -> int:
    if n <= 0:
        return 0
    a, b = 0, 1
    for _ in range(1, n):
        a, b = b, a + b
    return b


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    cfg = Config(host="localhost", port=8080)
    cfg.set("theme", "dark")
    cfg.set("lang", "python")

    print(greet("Nexis"))
    print(f"Port: {cfg.port}")
    print(f"Theme: {cfg.get('theme', 'default')}")

    for i in range(10):
        print(f"fib({i}) = {fibonacci(i)}")


if __name__ == "__main__":
    main()
