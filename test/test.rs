// Test Rust file — Nexis editor playground
// Exercises: structs, impl blocks, derive macros, HashMap, Option, match expressions,
//            format!/println! macros, string slices (&str / String), iterators, fibonacci recursion.
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct Config {
    host: String,
    port: u16,
    settings: HashMap<String, String>,
}

impl Config {
    fn new(host: &str, port: u16) -> Self {
        Self {
            host: host.to_string(),
            port,
            settings: HashMap::new(),
        }
    }

    fn set(&mut self, key: &str, value: &str) {
        self.settings.insert(key.to_string(), value.to_string());
    }

    fn get(&self, key: &str) -> Option<&str> {
        self.settings.get(key).map(|s| s.as_str())
    }
}

fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn fibonacci(n: u64) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn main() {
    let mut cfg = Config::new("localhost", 8080);
    cfg.set("theme", "dark");
    cfg.set("lang", "rust");

    println!("{}", greet("Nexis"));
    println!("Port: {}", cfg.port);
    println!("Theme: {}", cfg.get("theme").unwrap_or("default"));

    for i in 0..10 {
        println!("fib({}) = {}", i, fibonacci(i));
    }
}
