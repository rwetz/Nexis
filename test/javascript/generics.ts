// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * generics.ts — Nexis editor playground
 * Exercises: conditional types, infer, mapped types, template literal types,
 *            variadic tuple types, recursive types, higher-kinded types (HKT pattern).
 */

// ── Basic bounded generics ────────────────────────────────────────────────────

function identity<T>(x: T): T { return x }

function pair<A, B>(a: A, b: B): [A, B] { return [a, b] }

function head<T>(arr: readonly [T, ...T[]]): T { return arr[0] }

function last<T extends readonly unknown[]>(
  arr: readonly [...T]
): T extends readonly [...infer _, infer L] ? L : never {
  return arr[arr.length - 1] as never
}

// ── Conditional types ─────────────────────────────────────────────────────────

type IsArray<T> = T extends readonly unknown[] ? true : false
type IsFunction<T> = T extends (...args: never[]) => unknown ? true : false
type IsPromise<T> = T extends Promise<infer _> ? true : false

type NonNullable2<T> = T extends null | undefined ? never : T

type Awaited2<T> = T extends Promise<infer U>
  ? Awaited2<U>
  : T

type Flatten<T> = T extends readonly (infer U)[] ? Flatten<U> : T

type FlattenOnce<T extends readonly unknown[]> =
  T extends readonly (infer U)[] ? U : never

// ── infer ─────────────────────────────────────────────────────────────────────

type ReturnType2<T> = T extends (...args: never[]) => infer R ? R : never

type Parameters2<T> = T extends (...args: infer P) => unknown ? P : never

type FirstParameter<T> = T extends (first: infer F, ...rest: never[]) => unknown ? F : never

type InstanceType2<T> = T extends abstract new (...args: never[]) => infer I ? I : never

type UnpackPromise<T> = T extends Promise<infer U> ? U : T

type UnwrapArray<T> = T extends (infer U)[] ? U : T

// Deep unwrap promise chain
type DeepAwaited<T> =
  T extends Promise<infer U> ? DeepAwaited<U> :
  T extends PromiseLike<infer U> ? DeepAwaited<U> :
  T

// ── Mapped types ──────────────────────────────────────────────────────────────

type Readonly2<T> = { readonly [K in keyof T]: T[K] }

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

type Partial2<T> = { [K in keyof T]?: T[K] }

type Required2<T> = { [K in keyof T]-?: T[K] }

type Nullable<T> = { [K in keyof T]: T[K] | null }

type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K]
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

type Pick2<T, K extends keyof T> = { [P in K]: T[P] }

type Omit2<T, K extends keyof T> = Pick2<T, Exclude<keyof T, K>>

type Record2<K extends PropertyKey, V> = { [P in K]: V }

type PickByValue<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K]
}

type OmitByValue<T, V> = {
  [K in keyof T as T[K] extends V ? never : K]: T[K]
}

// ── Template literal types ────────────────────────────────────────────────────

type EventName<T extends string> = `on${Capitalize<T>}`
type EventHandler<T extends string> = `handle${Capitalize<T>}`
type CSSProperty = `--${string}`
type DataAttr<T extends string> = `data-${T}`
type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
type APIRoute = `/${string}`
type APIEndpoint = `${HTTPMethod} ${APIRoute}`

type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K]
}

type Setters<T> = {
  [K in keyof T as `set${Capitalize<string & K>}`]: (v: T[K]) => void
}

type Accessors<T> = Getters<T> & Setters<T>

// Split string type
type Split<S extends string, D extends string> =
  string extends S ? string[] :
  S extends "" ? [] :
  S extends `${infer T}${D}${infer U}` ? [T, ...Split<U, D>] :
  [S]

// Join tuple of strings
type Join<T extends string[], D extends string> =
  T extends [] ? "" :
  T extends [string] ? `${T[0]}` :
  T extends [string, ...infer R extends string[]] ? `${T[0]}${D}${Join<R, D>}` :
  string

// Path access type
type PathKeys<T, P extends string = ""> =
  T extends object
    ? { [K in keyof T & string]: K | PathKeys<T[K], `${K}.`> }[keyof T & string]
    : never

type PathValue<T, P extends string> =
  P extends `${infer K}.${infer Rest}`
    ? K extends keyof T ? PathValue<T[K], Rest> : never
    : P extends keyof T ? T[P] : never

// ── Variadic tuple types ───────────────────────────────────────────────────────

type Concat<A extends unknown[], B extends unknown[]> = [...A, ...B]

type Zip<A extends unknown[], B extends unknown[]> =
  A extends [infer AH, ...infer AT]
    ? B extends [infer BH, ...infer BT]
      ? [[AH, BH], ...Zip<AT, BT>]
      : []
    : []

type TupleOf<T, N extends number, R extends T[] = []> =
  R["length"] extends N ? R : TupleOf<T, N, [...R, T]>

type Head<T extends unknown[]> = T extends [infer H, ...unknown[]] ? H : never
type Tail<T extends unknown[]> = T extends [unknown, ...infer T] ? T : never
type Length<T extends unknown[]> = T["length"]

type Reverse<T extends unknown[]> =
  T extends [infer H, ...infer R]
    ? [...Reverse<R>, H]
    : []

// Pipe type: chain function return types
type PipeReturn<
  T extends [(...args: never[]) => unknown, ...((arg: never) => unknown)[]]
> = T extends [...infer _, infer Last extends (...args: never[]) => unknown]
  ? ReturnType<Last>
  : never

// ── Higher-kinded types (HKT encoding) ────────────────────────────────────────

interface HKT {
  readonly _A?: unknown
  readonly type: unknown
}

type Apply<F extends HKT, A> = (F & { readonly _A: A })["type"]

interface ArrayHKT extends HKT {
  readonly type: this["_A"][]
}

interface MaybeHKT extends HKT {
  readonly type: this["_A"] | null
}

interface PromiseHKT extends HKT {
  readonly type: Promise<this["_A"] | undefined>
}

// Functor typeclass (HKT)
interface Functor<F extends HKT> {
  map<A, B>(fa: Apply<F, A>, f: (a: A) => B): Apply<F, B>
}

const ArrayFunctor: Functor<ArrayHKT> = {
  map: (fa, f) => fa.map(f),
}

// ── Recursive types ───────────────────────────────────────────────────────────

type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue }

type DeepMerge<T, U> = {
  [K in keyof T | keyof U]:
    K extends keyof U
      ? K extends keyof T
        ? T[K] extends object
          ? U[K] extends object
            ? DeepMerge<T[K], U[K]>
            : U[K]
          : U[K]
        : U[K]
      : K extends keyof T
        ? T[K]
        : never
}

// ── Type-safe builder / fluent API ────────────────────────────────────────────

class Builder<T extends Record<string, unknown>> {
  private data: Partial<T> = {}

  set<K extends keyof T>(key: K, value: T[K]): Builder<T> {
    this.data[key] = value
    return this
  }

  build(): T {
    return this.data as T
  }
}

// ── Branded / opaque types ───────────────────────────────────────────────────

declare const brand: unique symbol
type Brand<T, B> = T & { [brand]: B }

type UserId    = Brand<string, "UserId">
type ProjectId = Brand<string, "ProjectId">
type Pixels    = Brand<number, "Pixels">
type Percent   = Brand<number, "Percent">

function makeUserId(s: string): UserId        { return s as UserId }
function makeProjectId(s: string): ProjectId  { return s as ProjectId }
function px(n: number): Pixels                { return n as Pixels }
function pct(n: number): Percent {
  if (n < 0 || n > 100) throw new RangeError(`Expected 0–100, got ${n}`)
  return n as Percent
}

// ── Utility: overloaded function signatures ───────────────────────────────────

function parse(input: string): JSONValue
function parse<T>(input: string, reviver: (key: string, value: unknown) => T): T
function parse(input: string, reviver?: (key: string, value: unknown) => unknown): unknown {
  return reviver ? JSON.parse(input, reviver) : JSON.parse(input)
}

// ── Type-level tests ──────────────────────────────────────────────────────────

type Assert<T extends true> = T
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

// These assertions are checked at compile time — if they fail, tsc errors.
type _tests = [
  Assert<Equals<Flatten<number[][][]>, number>>,
  Assert<Equals<Reverse<[1, 2, 3]>, [3, 2, 1]>>,
  Assert<Equals<Zip<[1, 2], ["a", "b"]>, [[1, "a"], [2, "b"]]>>,
  Assert<Equals<TupleOf<string, 3>, [string, string, string]>>,
  Assert<Equals<Split<"a.b.c", ".">, ["a", "b", "c"]>>,
  Assert<Equals<Join<["a", "b", "c"], "-">, "a-b-c">>,
]

// ── Runtime demos ─────────────────────────────────────────────────────────────

const uid     = makeUserId("u_abc123")
const pid     = makeProjectId("p_xyz789")
const width   = px(640)
const opacity = pct(75)

const builder = new Builder<{ host: string; port: number; tls: boolean }>()
const config  = builder.set("host", "localhost").set("port", 9090).set("tls", true).build()

console.log({ uid, pid, width, opacity, config })

const result = ArrayFunctor.map([1, 2, 3, 4, 5], x => x * x)
console.log("functor map:", result)

export type {
  IsArray, IsFunction, IsPromise,
  Awaited2, Flatten, DeepReadonly, DeepPartial,
  PickByValue, OmitByValue,
  Split, Join, PathValue,
  Concat, Zip, TupleOf, Reverse,
  JSONValue, DeepMerge,
  UserId, ProjectId, Pixels, Percent,
}
