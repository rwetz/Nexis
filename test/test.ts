// Test TypeScript file — Nexis editor playground
// Exercises: class with readonly/private fields, Map<K,V>, string|undefined union, template literals,
//            bigint arithmetic, nullish coalescing (??), iterative fibonacci.

// ── Config ────────────────────────────────────────────────────────────────────

class Config {
  readonly host: string;
  readonly port: number;
  private settings = new Map<string, string>();

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  set(key: string, value: string): void {
    this.settings.set(key, value);
  }

  get(key: string): string | undefined {
    return this.settings.get(key);
  }

  getOr(key: string, fallback: string): string {
    return this.settings.get(key) ?? fallback;
  }

  toString(): string {
    return `Config { host: ${this.host}, port: ${this.port} }`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function greet(name: string): string {
  return `Hello, ${name}!`;
}

function fibonacci(n: number): bigint {
  if (n <= 0) return 0n;
  let a = 0n, b = 1n;
  for (let i = 1; i < n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

// ── Entry point ───────────────────────────────────────────────────────────────

function main(): void {
  const cfg = new Config("localhost", 8080);
  cfg.set("theme", "dark");
  cfg.set("lang", "typescript");

  console.log(greet("Nexis"));
  console.log(`Port: ${cfg.port}`);
  console.log(`Theme: ${cfg.getOr("theme", "default")}`);

  for (let i = 0; i < 10; i++) {
    console.log(`fib(${i}) = ${fibonacci(i)}`);
  }
}

main();
