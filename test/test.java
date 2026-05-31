// Test Java file — Nexis editor playground
// Exercises: static nested class, HashMap<K,V>, getOrDefault, @Override, final fields,
//            string concatenation, System.out.println, iterative fibonacci.

import java.util.HashMap;
import java.util.Map;

public class test {

      // ── Config ────────────────────────────────────────────────────────────────

    static class Config {
        private final String host;
        private final int port;
        private final Map<String, String> settings = new HashMap<>();

        Config(String host, int port) {
            this.host = host;
            this.port = port;
          
        }

        void set(String key, String value) {
            settings.put(key, value);
        }

        String get(String key) {
            return settings.getOrDefault(key, "");
        }

        @Override
        public String toString() {
            return "Config{host=" + host + ", port=" + port + ", settings=" + settings + "}";
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    static String greet(String name) {
        return "Hello, " + name + "!";
    }

    static long fibonacci(int n) {
        if (n <= 0) return 0;
        if (n == 1) return 1;
        long a = 0, b = 1;
        for (int i = 2; i <= n; i++) {
            long tmp = a + b;
            a = b;
            b = tmp;
        }
        return b;
    }

    // ── Entry point ───────────────────────────────────────────────────────────

    public static void main(String[] args) {
        Config cfg = new Config("localhost", 8080);
        cfg.set("theme", "dark");
        cfg.set("lang", "java");

        System.out.println(greet("Nexis"));
        System.out.println("Port: " + cfg.port);
        System.out.println("Theme: " + cfg.get("theme"));

        for (int i = 0; i < 10; i++) {
            System.out.println("fib(" + i + ") = " + fibonacci(i));
        }
    }
}
