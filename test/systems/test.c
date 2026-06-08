/* Test C file — Nexis editor playground
   Exercises: typedef struct, #define macros, fixed-width integers (uint16_t/uint64_t),
              pointer params, strncpy/snprintf, NULL return, printf format strings. */

#include <stdio.h>
#include <string.h>
#include <stdint.h>

/* ── Config ──────────────────────────────────────────────────────────────── */

#define MAX_SETTINGS 16
#define KEY_LEN      64
#define VAL_LEN      256

typedef struct {
    char key[KEY_LEN];
    char value[VAL_LEN];
} Setting;

typedef struct {
    char     host[256];
    uint16_t port;
    Setting  settings[MAX_SETTINGS];
    int      count;
} Config;

void config_init(Config *cfg, const char *host, uint16_t port) {
    strncpy(cfg->host, host, sizeof(cfg->host) - 1);
    cfg->port  = port;
    cfg->count = 0;
}

void config_set(Config *cfg, const char *key, const char *value) {
    if (cfg->count >= MAX_SETTINGS) return;
    strncpy(cfg->settings[cfg->count].key,   key,   KEY_LEN - 1);
    strncpy(cfg->settings[cfg->count].value, value, VAL_LEN - 1);
    cfg->count++;
}

const char *config_get(const Config *cfg, const char *key) {
    for (int i = 0; i < cfg->count; i++) {
        if (strcmp(cfg->settings[i].key, key) == 0) {
            return cfg->settings[i].value;
        }
    }
    return NULL;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

void greet(const char *name, char *out, size_t len) {
    snprintf(out, len, "Hello, %s!", name);
}

uint64_t fibonacci(int n) {
    if (n <= 0) return 0;
    if (n == 1) return 1;
    uint64_t a = 0, b = 1;
    for (int i = 2; i <= n; i++) {
        uint64_t tmp = a + b;
        a = b;
        b = tmp;
    }
    return b;
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

int main(void) {
    Config cfg;
    config_init(&cfg, "localhost", 8080);
    config_set(&cfg, "theme", "dark");
    config_set(&cfg, "lang", "c");

    char greeting[128];
    greet("Nexis", greeting, sizeof(greeting));
    printf("%s\n", greeting);
    printf("Port: %u\n", cfg.port);

    const char *theme = config_get(&cfg, "theme");
    printf("Theme: %s\n", theme ? theme : "default");

    for (int i = 0; i < 10; i++) {
        printf("fib(%d) = %llu\n", i, (unsigned long long)fibonacci(i));
    }

    return 0;
}
