-- Test Lua file — Nexis editor playground
-- Exercises: tables as objects, metatables, __index / __tostring metamethods,
--            setmetatable, colon method syntax, local functions, string.format.

-- ── Config ────────────────────────────────────────────────────────────────────

local Config = {}
Config.__index = Config

function Config.new(host, port)
    return setmetatable({
        host     = host,
        port     = port,
        settings = {},
    }, Config)
end

function Config:set(key, value)
    self.settings[key] = value
end

function Config:get(key, default)
    return self.settings[key] or default or ""
end

function Config:__tostring()
    return string.format("Config(host=%s, port=%d)", self.host, self.port)
end

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function greet(name)
    return string.format("Hello, %s!", name)
end

local function fibonacci(n)
    if n <= 0 then return 0 end
    local a, b = 0, 1
    for _ = 1, n - 1 do
        a, b = b, a + b
    end
    return b
end

-- ── Entry point ───────────────────────────────────────────────────────────────

local function main()
    local cfg = Config.new("localhost", 8080)
    cfg:set("theme", "dark")
    cfg:set("lang", "lua")

    print(greet("Nexis"))
    print(string.format("Port: %d", cfg.port))
    print(string.format("Theme: %s", cfg:get("theme", "default")))

    for i = 0, 9 do
        print(string.format("fib(%d) = %d", i, fibonacci(i)))
    end
end

main()
