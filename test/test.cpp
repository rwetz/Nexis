// Test C++ file — Nexis editor playground
// Exercises: class with public/private access, unordered_map, std::optional, std::move,
//            const-qualified methods, value_or, std::cout chaining.

#include <iostream>
#include <string>
#include <unordered_map>
#include <optional>

// ── Config ────────────────────────────────────────────────────────────────────

class Config {
public:
    Config(std::string host, uint16_t port)
        : host_(std::move(host)), port_(port) {}

    void set(const std::string& key, const std::string& value) {
        settings_[key] = value;
    }

    std::optional<std::string> get(const std::string& key) const {
        auto it = settings_.find(key);
        if (it != settings_.end()) return it->second;
        return std::nullopt;
    }

    uint16_t port() const { return port_; }

    std::string summary() const {
        return "Host: " + host_ + ", Port: " + std::to_string(port_);
    }

private:
    std::string host_;
    uint16_t port_;
    std::unordered_map<std::string, std::string> settings_;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

std::string greet(const std::string& name) {
    return "Hello, " + name + "!";
}

uint64_t fibonacci(int n) {
    if (n <= 0) return 0;
    if (n == 1) return 1;
    uint64_t a = 0, b = 1;
    for (int i = 2; i <= n; ++i) {
        uint64_t tmp = a + b;
        a = b;
        b = tmp;
    }
    return b;
}

// ── Entry point ───────────────────────────────────────────────────────────────

int main() {
    Config cfg("localhost", 8080);
    cfg.set("theme", "dark");
    cfg.set("lang", "c++");

    std::cout << greet("Nexis") << "\n";
    std::cout << "Port: " << cfg.port() << "\n";
    std::cout << "Theme: " << cfg.get("theme").value_or("default") << "\n";

    for (int i = 0; i < 10; ++i) {
        std::cout << "fib(" << i << ") = " << fibonacci(i) << "\n";
    }

    return 0;
}
