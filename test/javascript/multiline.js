/**
 * multiline.js — Nexis editor playground
 * Exercises: template literals, tagged templates, regex literals,
 *            long strings, heredoc-style patterns, complex destructuring,
 *            generator functions, WeakRef, FinalizationRegistry.
 */

// ── Template literals ─────────────────────────────────────────────────────────

const name = "Nexis"
const version = "1.3.0"

// Multiline template literal
const readme = `
  # ${name} v${version}

  A Tauri-based IDE with:
  - Integrated terminal (PTY via ConPTY / portable-pty)
  - LSP support (Language Server Protocol)
  - DAP debugger
  - AI assistant (Claude)
  - Git integration

  Built with ❤️ using Rust + TypeScript.
`

// Nested template literals
const makeTable = (rows) => `
  ┌${'─'.repeat(20)}┬${'─'.repeat(10)}┐
  │ ${'Name'.padEnd(19)}│ ${'Score'.padStart(9)} │
  ├${'─'.repeat(20)}┼${'─'.repeat(10)}┤
${rows.map(([n, s]) => `  │ ${n.padEnd(19)}│ ${String(s).padStart(9)} │`).join('\n')}
  └${'─'.repeat(20)}┴${'─'.repeat(10)}┘
`

const table = makeTable([
  ["Alice", 95],
  ["Bob",   78],
  ["Carol", 88],
])
console.log(table)

// ── Tagged templates ──────────────────────────────────────────────────────────

// SQL builder with parameterisation
function sql(strings, ...values) {
  const params = []
  const query  = strings.reduce((acc, str, i) => {
    if (i > 0) {
      params.push(values[i - 1])
      return acc + `$${i}`
    }
    return acc + str
  })
  return { query, params }
}

const userId = 42
const limit  = 10
const { query, params } = sql`
  SELECT id, name, email
  FROM users
  WHERE id > ${userId}
    AND is_active = ${true}
  LIMIT ${limit}
`
console.log("Query:", query.trim())
console.log("Params:", params)

// HTML escaping tagged template
function html(strings, ...values) {
  const escape = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  return strings.reduce((acc, str, i) =>
    acc + (i > 0 ? escape(values[i - 1]) : "") + str
  )
}

const userInput = '<script>alert("xss")</script>'
const safeHtml = html`<p>User said: ${userInput}</p>`
console.log("Safe HTML:", safeHtml)

// Debug / logging tagged template
function debug(strings, ...values) {
  const parts = strings.map((str, i) => {
    const val = values[i - 1]
    if (i === 0) return str
    const type = typeof val
    const formatted = type === "object"
      ? JSON.stringify(val, null, 0)
      : String(val)
    return `\x1b[33m${formatted}\x1b[0m (${type})${str}`
  })
  console.log("DEBUG:", parts.join(""))
}

debug`user=${name} version=${version} active=${true} count=${42}`

// ── Raw strings ───────────────────────────────────────────────────────────────

const raw = String.raw`Line1\nLine2\nLine3`  // \n not interpreted
console.log("Raw:", raw)

const regexPattern = String.raw`^\d{4}-\d{2}-\d{2}$`
console.log("Regex string:", regexPattern)

// ── Complex destructuring ─────────────────────────────────────────────────────

const data = {
  user: {
    id:    1,
    name:  "Alice",
    email: "alice@nexis.dev",
    address: {
      city:    "San Francisco",
      country: "US",
      zip:     "94107",
    },
    scores: [95, 88, 92, 78, 100],
    metadata: {
      preferences: {
        theme:    "dark",
        language: "en",
        timezone: "America/Los_Angeles",
      },
    },
  },
  meta: {
    total:  4,
    cursor: "abc123",
    hasNext: true,
  },
}

// Deep destructuring with renaming, defaults, rest
const {
  user: {
    id:    userId2,
    name:  userName,
    email: userEmail = "unknown@example.com",
    address: { city, country, zip: postalCode },
    scores: [topScore, ...remainingScores],
    metadata: {
      preferences: {
        theme = "light",
        language: lang = "en",
        ...otherPrefs
      },
    },
  },
  meta: { total, ...pagingMeta },
} = data

console.log({ userId2, userName, city, postalCode, topScore, remainingScores, theme, lang, otherPrefs, pagingMeta })

// Array destructuring with skipping and defaults
const matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
const [[r1c1, , r1c3], [, r2c2], [r3c1, r3c2, r3c3]] = matrix
console.log({ r1c1, r1c3, r2c2, r3c1, r3c2, r3c3 })

// Swap without temp variable
let [a, b] = [10, 20]
;[a, b] = [b, a]
console.log("Swapped:", a, b)

// ── Generator functions ───────────────────────────────────────────────────────

function* fibonacci() {
  let [a, b] = [0, 1]
  while (true) {
    yield a
    ;[a, b] = [b, a + b]
  }
}

function* range(start, end, step = 1) {
  for (let i = start; i < end; i += step) yield i
}

function* map(iter, fn) {
  for (const value of iter) yield fn(value)
}

function* filter(iter, fn) {
  for (const value of iter) if (fn(value)) yield value
}

function* take(iter, n) {
  let count = 0
  for (const value of iter) {
    if (count++ >= n) return
    yield value
  }
}

function* zip(...iters) {
  const iterators = iters.map(i => i[Symbol.iterator]())
  while (true) {
    const results = iterators.map(it => it.next())
    if (results.some(r => r.done)) return
    yield results.map(r => r.value)
  }
}

const fibs   = take(fibonacci(), 10)
const evens  = filter(range(0, 20), n => n % 2 === 0)
const mapped = map(range(1, 6), n => n * n)

console.log("Fibs:", [...fibs])
console.log("Evens:", [...evens])
console.log("Squares:", [...mapped])
console.log("Zip:", [...zip([1, 2, 3], ["a", "b", "c"], [true, false, true])])

// Delegating generator with yield*
function* concat(...generators) {
  for (const gen of generators) yield* gen
}

const all = concat(range(0, 3), range(10, 13), range(20, 23))
console.log("Concat:", [...all])

// ── WeakRef & FinalizationRegistry ────────────────────────────────────────────

const registry = new FinalizationRegistry((heldValue) => {
  console.log(`Object with token "${heldValue}" was garbage collected`)
})

function createTracked(name) {
  const obj = { name, data: new Array(1000).fill(0) }
  const ref = new WeakRef(obj)
  registry.register(obj, name)
  return ref
}

let ref = createTracked("large-object")
console.log("WeakRef deref:", ref.deref()?.name)

// ── Long string edge cases ────────────────────────────────────────────────────

// String with every printable ASCII character
const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).join("")
console.log("ASCII:", ascii)

// Very long line (tests horizontal scroll / line wrapping in editor)
const longLine = "This is an intentionally very long line of text that tests how the editor handles long lines without soft wrapping enabled. It contains enough characters to exceed the default viewport width in most editors and should trigger horizontal scrolling. The line continues here: " + "x".repeat(200) + " END"

// String with special escape sequences
const escapes = "Tab:\t Newline:\n CarriageReturn:\r NullByte:\0 Bell:\x07 Backspace:\x08 Form-feed:\x0C Vertical-tab:\x0B"

// Unicode escape sequences
const unicodeEscapes = "Hello" // "Hello"
const codePoints     = "\u{1F600}\u{1F4BB}\u{1F680}"    // 😀💻🚀

console.log("Escapes (length):", escapes.length)
console.log("Unicode escapes:", unicodeEscapes)
console.log("Code points:", codePoints)

// ── Optional chaining & nullish coalescing ────────────────────────────────────

const deeply = {
  a: {
    b: {
      c: {
        value: 42
      }
    }
  }
}

const v1 = deeply?.a?.b?.c?.value          // 42
const v2 = deeply?.x?.y?.z ?? "default"    // "default"
const v3 = null?.toString()                // undefined
const v4 = undefined ?? null ?? 0 ?? "nope" // 0

console.log({ v1, v2, v3, v4 })

// ── Logical assignment operators ──────────────────────────────────────────────

let x = null
let y = 0
let z = "hello"

x ??= "was null"    // x = "was null" (null/undefined only)
y ||= 42            // y = 42 (falsy)
z &&= z.toUpperCase() // z = "HELLO" (truthy)

console.log({ x, y, z })

// ── Object.entries / fromEntries pipeline ─────────────────────────────────────

const scores = { alice: 95, bob: 78, carol: 88, dave: 92 }

const normalized = Object.fromEntries(
  Object.entries(scores)
    .filter(([_, score]) => score >= 80)
    .map(([name, score]) => [name, { score, grade: score >= 90 ? "A" : "B" }])
    .sort(([, a], [, b]) => b.score - a.score)
)

console.log("Normalized:", normalized)
