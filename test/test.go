// Test Go file — Nexis editor playground
// Mirrors the structure of test.rs: Config struct, greeting, fibonacci, main.

package main

import "fmt"

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	Host     string
	Port     uint16
	settings map[string]string
}

func NewConfig(host string, port uint16) *Config {
	return &Config{
		Host:     host,
		Port:     port,
		settings: make(map[string]string),
	}
}

func (c *Config) Set(key, value string) {
	c.settings[key] = value
}

func (c *Config) Get(key string) (string, bool) {
	v, ok := c.settings[key]
	return v, ok
}

func (c *Config) GetOr(key, fallback string) string {
	if v, ok := c.settings[key]; ok {
		return v
	}
	return fallback
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func greet(name string) string {
	return fmt.Sprintf("Hello, %s!", name)
}

func fibonacci(n int) uint64 {
	if n <= 0 {
		return 0
	}
	a, b := uint64(0), uint64(1)
	for i := 1; i < n; i++ {
		a, b = b, a+b
	}
	return b
}

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	cfg := NewConfig("localhost", 8080)
	cfg.Set("theme", "dark")
	cfg.Set("lang", "go")

	fmt.Println(greet("Nexis"))
	fmt.Printf("Port: %d\n", cfg.Port)
	fmt.Printf("Theme: %s\n", cfg.GetOr("theme", "default"))

	for i := 0; i < 10; i++ {
		fmt.Printf("fib(%d) = %d\n", i, fibonacci(i))
	}
}
