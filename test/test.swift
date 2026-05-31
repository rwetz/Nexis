// Test Swift file — Nexis editor playground
// Exercises: final class, [String: String] dictionary, guard statement, tuple swap,
//            string interpolation (\()), UInt64 overflow-safe arithmetic (&+).

import Foundation

// ── Config ────────────────────────────────────────────────────────────────────

final class Config {
    let host: String
    let port: UInt16
    private var settings: [String: String] = [:]

    init(host: String, port: UInt16) {
        self.host = host
        self.port = port
    }

    func set(_ key: String, _ value: String) {
        settings[key] = value
    }

    func get(_ key: String, default fallback: String = "") -> String {
        return settings[key, default: fallback]
    }

    var description: String {
        "Config(host: \(host), port: \(port))"
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func greet(_ name: String) -> String {
    "Hello, \(name)!"
}

func fibonacci(_ n: Int) -> UInt64 {
    guard n > 0 else { return 0 }
    var (a, b): (UInt64, UInt64) = (0, 1)
    for _ in 1..<n {
        (a, b) = (b, a &+ b)
    }
    return b
}

// ── Entry point ───────────────────────────────────────────────────────────────

let cfg = Config(host: "localhost", port: 8080)
cfg.set("theme", "dark")
cfg.set("lang", "swift")

print(greet("Nexis"))
print("Port: \(cfg.port)")
print("Theme: \(cfg.get("theme", default: "default"))")

for i in 0..<10 {
    print("fib(\(i)) = \(fibonacci(i))")
}
