/**
 * unicode.ts — Nexis editor playground
 * Tests the editor's handling of Unicode: identifiers, strings, RTL,
 * surrogate pairs, emoji sequences, zero-width joiners, combining chars.
 */

// ── Unicode identifiers (ES2015+) ─────────────────────────────────────────────

const π  = Math.PI
const τ  = 2 * π
const φ  = (1 + Math.sqrt(5)) / 2   // golden ratio
const ε  = Number.EPSILON
const ∞  = Infinity
const √2 = Math.SQRT2
const °  = Math.PI / 180             // degrees to radians

function areaOfCircle(r: number): number {
  return π * r ** 2
}

function circumference(r: number): number {
  return τ * r
}

// Greek-letter function names
function Σ<T extends number>(arr: T[]): T {
  return arr.reduce((acc, v) => (acc + v) as T, 0 as T)
}

function Π<T extends number>(arr: T[]): T {
  return arr.reduce((acc, v) => (acc * v) as T, 1 as T)
}

// ── Unicode string literals ───────────────────────────────────────────────────

const greetings: Record<string, string> = {
  English:   "Hello, World!",
  Japanese:  "こんにちは、世界！",
  Chinese:   "你好，世界！",
  Arabic:    "مرحباً بالعالم!",          // RTL text
  Hebrew:    "שלום עולם!",               // RTL text
  Korean:    "안녕하세요, 세계!",
  Russian:   "Привет, мир!",
  Greek:     "Γεια σου, Κόσμε!",
  Hindi:     "नमस्ते, दुनिया!",
  Thai:      "สวัสดีชาวโลก!",
  Georgian:  "გამარჯობა, მსოფლიო!",
  Armenian:  "Բարեւ, Աշխ ɚrh!",
}

// ── Emoji & surrogate pairs ───────────────────────────────────────────────────

const emojiLength = (s: string): number => [...s].length   // spread handles surrogates

const emojis = {
  simple:      "🎉🦀🌍🚀💡",
  family:      "👨‍👩‍👧‍👦",           // ZWJ sequence (family)
  flag:        "🏳️‍🌈",            // rainbow flag via ZWJ
  skintone:    "👋🏾",             // base emoji + modifier
  keycap:      "1️⃣2️⃣3️⃣",        // keycap sequences
  regionalIndicator: "🇺🇸🇯🇵🇬🇧", // flag via regional indicator pairs
}

console.table(
  Object.entries(emojis).map(([key, val]) => ({
    key,
    byLength:    val.length,
    bySpread:    emojiLength(val),
    bySegmenter: [...new Intl.Segmenter().segment(val)].length,
  }))
)

// ── Intl APIs ─────────────────────────────────────────────────────────────────

const numberFormats: Record<string, Intl.NumberFormat> = {
  "en-US": new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
  "de-DE": new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }),
  "ja-JP": new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }),
  "ar-SA": new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", numberingSystem: "arab" }),
}

for (const [locale, fmt] of Object.entries(numberFormats)) {
  console.log(`  ${locale}: ${fmt.format(1234567.89)}`)
}

const relativeFmt = new Intl.RelativeTimeFormat("en", { style: "long" })
const dateUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", -45],
  ["minute", -3],
  ["hour",   -2],
  ["day",    -1],
  ["week",   -2],
  ["month",  -6],
  ["year",   -1],
]
dateUnits.forEach(([unit, n]) => console.log(`  ${relativeFmt.format(n, unit)}`))

// ── Combining characters & normalization ──────────────────────────────────────

const composed   = "café"          // NFC — é as single codepoint U+00E9
const decomposed = "café"    // NFD — e + combining acute accent U+0301

console.log("Same string?",   composed === decomposed)             // false
console.log("After NFC?",     composed === decomposed.normalize("NFC"))  // true
console.log("Lengths:",       composed.length, decomposed.length)  // 4, 5

// Zero-width non-joiner / joiner
const zwj  = "‍"  // Zero-width joiner
const zwnj = "‌"  // Zero-width non-joiner
const zwsp = "​"  // Zero-width space
const bom  = "﻿"  // Byte-order mark (zero-width no-break space)

// ── Regex & Unicode ───────────────────────────────────────────────────────────

const unicodeWordRE = /\p{Letter}+/gu          // Unicode property escapes
const emojiRE       = /\p{Emoji_Presentation}/gu
const numberRE      = /\p{Decimal_Number}/gu

const sample = "Hello مرحبا Привет 123 🎉 ℝ ∑"
console.log("Letters:",  sample.match(unicodeWordRE))
console.log("Emoji:",    sample.match(emojiRE))
console.log("Numbers:",  sample.match(numberRE))

// ── String segmentation ───────────────────────────────────────────────────────

function graphemeClusters(s: string): string[] {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  return [...seg.segment(s)].map(({ segment }) => segment)
}

function wordBoundaries(s: string, locale = "en-US"): string[] {
  const seg = new Intl.Segmenter(locale, { granularity: "word" })
  return [...seg.segment(s)]
    .filter(({ isWordLike }) => isWordLike)
    .map(({ segment }) => segment)
}

const mixed = "Hello 🌍! café — the naïve résumé"
console.log("Graphemes:", graphemeClusters(mixed))
console.log("Words:",     wordBoundaries(mixed))

// ── Bidi algorithm markers ────────────────────────────────────────────────────

// U+200F RIGHT-TO-LEFT MARK, U+200E LEFT-TO-RIGHT MARK
const ltr  = "‎"
const rtl  = "‏"
const bidi = `${ltr}Hello${rtl} ‫مرحبا‬ ${ltr}World`
console.log("Bidi string:", bidi)

// ── Unusual but valid identifiers ────────────────────────────────────────────

const _ = "underscore only"  // classic
const __ = "double under"
const $$ = "double dollar"
const 안녕 = "identifier in Korean"
const αβγ = [1, 2, 3]        // Greek letters
const 日本語変数 = "Japanese identifier"

// ── Template literal with unicode escapes ────────────────────────────────────

const code = 0x1F600  // 😀
const char = String.fromCodePoint(code)
const tag  = `\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}`  // 🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland flag

console.log(`Code point U+${code.toString(16).toUpperCase().padStart(4, "0")}: ${char}`)
console.log("Tag sequence:", tag)

export {
  π, τ, φ, ε, √2, °,
  areaOfCircle, circumference,
  Σ, Π,
  greetings, emojis,
  graphemeClusters, wordBoundaries,
  emojiLength,
}
