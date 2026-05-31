/// macros.rs — Nexis editor playground
/// Exercises: declarative macros (macro_rules!), procedural macro patterns
/// (shown as doc examples), built-in macros, attribute macros.

use std::collections::HashMap;
use std::fmt;

// ── Declarative macros (macro_rules!) ────────────────────────────────────────

/// Creates a `HashMap` from key-value pairs, like Python's dict literals.
macro_rules! map {
    () => { HashMap::new() };
    ($($k:expr => $v:expr),+ $(,)?) => {{
        let mut m = HashMap::new();
        $(m.insert($k, $v);)+
        m
    }};
}

/// Asserts two floats are approximately equal within epsilon.
macro_rules! assert_approx_eq {
    ($left:expr, $right:expr) => {
        assert_approx_eq!($left, $right, 1e-9)
    };
    ($left:expr, $right:expr, $eps:expr) => {{
        let (l, r, e) = ($left as f64, $right as f64, $eps as f64);
        assert!(
            (l - r).abs() < e,
            "assertion failed: |{} - {}| = {} >= {}",
            l, r, (l - r).abs(), e
        );
    }};
}

/// Repeats an expression N times, collecting results into a Vec.
macro_rules! repeat {
    ($n:expr, $expr:expr) => {{
        let mut v = Vec::with_capacity($n);
        for _ in 0..$n {
            v.push($expr);
        }
        v
    }};
}

/// Pattern-based enum dispatch — generates a `match` arm per variant.
macro_rules! dispatch {
    ($val:expr; $($variant:pat => $body:expr),+ $(,)?) => {
        match $val {
            $($variant => $body,)+
        }
    };
}

/// Generates getter/setter methods for a struct field.
macro_rules! accessor {
    ($field:ident: $ty:ty) => {
        pub fn $field(&self) -> &$ty {
            &self.$field
        }

        paste::paste! {
            pub fn [<set_ $field>](&mut self, v: $ty) {
                self.$field = v;
            }
        }
    };
}

/// Lazy static-like singleton initialisation.
macro_rules! lazy_static_val {
    (static $name:ident : $ty:ty = $init:expr;) => {
        fn $name() -> &'static $ty {
            use std::sync::OnceLock;
            static CELL: OnceLock<$ty> = OnceLock::new();
            CELL.get_or_init(|| $init)
        }
    };
}

/// Type-state builder pattern via macro.
macro_rules! builder_state {
    (
        $name:ident {
            $($field:ident : $ty:ty),* $(,)?
        }
    ) => {
        #[derive(Default, Debug)]
        pub struct $name {
            $($field: Option<$ty>,)*
        }

        impl $name {
            pub fn new() -> Self { Self::default() }

            $(
                pub fn $field(mut self, v: $ty) -> Self {
                    self.$field = Some(v);
                    self
                }
            )*
        }
    };
}

// ── Built-in macro examples ───────────────────────────────────────────────────

fn builtin_macros() {
    // format!/write!/writeln! — string formatting
    let s = format!("{:>10} | {:<10} | {:^10}", "right", "left", "center");
    println!("{s}");

    // Debug vs Display formatting
    let v: Vec<u8> = vec![0xDE, 0xAD, 0xBE, 0xEF];
    println!("Debug:  {:?}", v);
    println!("Pretty: {:#?}", v);
    println!("Hex:    {:x?}", v);

    // assert! / assert_eq! / assert_ne!
    assert_eq!(2 + 2, 4, "basic arithmetic broke");
    assert_ne!("hello", "world");

    // include_str! / include_bytes! (would include at compile time)
    // let readme = include_str!("../README.md");

    // concat! — compile-time string concatenation
    const GREETING: &str = concat!("Hello", ", ", "World", "!");
    println!("{GREETING}");

    // stringify! — turns tokens into a string literal
    let tokens = stringify!(1 + 2 * (3 - 4) / 5);
    println!("tokens: {tokens}");

    // env! — reads environment variable at compile time
    // let profile = env!("CARGO_PKG_VERSION");

    // file!/line!/column!/module_path!
    println!("at {}:{}", file!(), line!());

    // cfg! — conditional compilation as bool
    if cfg!(debug_assertions) {
        println!("debug build");
    }

    // todo! / unimplemented! / unreachable!
    // todo!("implement me");

    // matches! — inline pattern match returning bool
    let x: Option<i32> = Some(42);
    assert!(matches!(x, Some(n) if n > 0));

    // dbg! — debug print with value passthrough
    let y = dbg!(2 + 2 * 10);
    let _ = y;

    // try_blocks (nightly) equivalent via closures
    let result: Result<i32, &str> = (|| {
        let a = Some(1).ok_or("missing a")?;
        let b = Some(2).ok_or("missing b")?;
        Ok(a + b)
    })();
    println!("try_block result: {result:?}");
}

// ── Use of map! macro ─────────────────────────────────────────────────────────

fn map_macro_demo() {
    let empty: HashMap<&str, i32> = map!();
    assert!(empty.is_empty());

    let scores = map! {
        "alice" => 95,
        "bob"   => 78,
        "carol" => 88,
    };

    let mut sorted: Vec<_> = scores.iter().collect();
    sorted.sort_by_key(|(_, &v)| std::cmp::Reverse(v));
    for (name, score) in sorted {
        println!("  {name}: {score}");
    }
}

// ── Use of repeat! macro ──────────────────────────────────────────────────────

fn repeat_macro_demo() {
    let zeros: Vec<i32> = repeat!(5, 0);
    println!("zeros: {zeros:?}");

    let mut n = 0;
    let inc: Vec<i32> = repeat!(6, { n += 1; n });
    println!("inc: {inc:?}");
}

// ── Use of dispatch! macro ────────────────────────────────────────────────────

#[derive(Debug)]
enum Command {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(u8, u8, u8),
}

fn handle(cmd: Command) -> String {
    dispatch! { cmd;
        Command::Quit              => "quit".to_string(),
        Command::Move { x, y }    => format!("move to ({x}, {y})"),
        Command::Write(msg)        => format!("write: {msg}"),
        Command::ChangeColor(r,g,b) => format!("color rgb({r},{g},{b})")
    }
}

// ── Builder via macro ─────────────────────────────────────────────────────────

builder_state! {
    ServerConfig {
        host:     String,
        port:     u16,
        timeout:  u64,
        tls:      bool,
    }
}

// ── Lazy static via macro ─────────────────────────────────────────────────────

lazy_static_val! {
    static PRIMES: Vec<u32> = {
        let mut sieve = vec![true; 101];
        sieve[0] = false;
        sieve[1] = false;
        let mut i = 2usize;
        while i * i <= 100 {
            if sieve[i] {
                let mut j = i * i;
                while j <= 100 {
                    sieve[j] = false;
                    j += i;
                }
            }
            i += 1;
        }
        sieve.iter().enumerate()
            .filter(|(_, &p)| p)
            .map(|(i, _)| i as u32)
            .collect()
    };
}

// ── Custom Display using write! / format_args! ───────────────────────────────

struct Matrix2x2(f64, f64, f64, f64);

impl fmt::Display for Matrix2x2 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "| {:6.2}  {:6.2} |\n| {:6.2}  {:6.2} |", self.0, self.1, self.2, self.3)
    }
}

impl Matrix2x2 {
    fn det(&self) -> f64 { self.0 * self.3 - self.1 * self.2 }
    fn trace(&self) -> f64 { self.0 + self.3 }
}

// ── Recursive macro: nested list ─────────────────────────────────────────────

#[derive(Debug)]
enum NestedList {
    Nil,
    Cons(i32, Box<NestedList>),
}

macro_rules! list {
    ()             => { NestedList::Nil };
    ($x:expr $(, $rest:expr)* $(,)?) => {
        NestedList::Cons($x, Box::new(list!($($rest),*)))
    };
}

fn list_sum(l: &NestedList) -> i32 {
    match l {
        NestedList::Nil        => 0,
        NestedList::Cons(x, t) => x + list_sum(t),
    }
}

// ── Attribute-like usage (cfg, derive, allow, must_use) ───────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[must_use = "a Token was created but never used"]
struct Token {
    value: String,
    expires_at: u64,
}

#[allow(dead_code)]
fn make_token(v: &str) -> Token {
    Token { value: v.to_string(), expires_at: u64::MAX }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_macro() {
        let m = map! { "a" => 1, "b" => 2 };
        assert_eq!(m["a"], 1);
        assert_eq!(m["b"], 2);
    }

    #[test]
    fn test_approx_eq() {
        assert_approx_eq!(0.1 + 0.2, 0.3, 1e-10);
    }

    #[test]
    fn test_repeat() {
        let v = repeat!(4, 7_i32);
        assert_eq!(v, vec![7, 7, 7, 7]);
    }

    #[test]
    fn test_dispatch() {
        assert_eq!(handle(Command::Quit), "quit");
        assert_eq!(handle(Command::Move { x: 3, y: 4 }), "move to (3, 4)");
    }

    #[test]
    fn test_list() {
        let l = list![1, 2, 3, 4, 5];
        assert_eq!(list_sum(&l), 15);
    }

    #[test]
    fn test_matrix() {
        let m = Matrix2x2(1.0, 2.0, 3.0, 4.0);
        assert_approx_eq!(m.det(), -2.0);
        assert_approx_eq!(m.trace(), 5.0);
    }
}

fn main() {
    println!("── Built-in macros ──");
    builtin_macros();

    println!("\n── map! macro ──");
    map_macro_demo();

    println!("\n── repeat! macro ──");
    repeat_macro_demo();

    println!("\n── dispatch! macro ──");
    let cmds = vec![
        Command::Move { x: 10, y: 20 },
        Command::Write("Hello, Nexis!".to_string()),
        Command::ChangeColor(255, 128, 0),
        Command::Quit,
    ];
    for cmd in cmds {
        println!("  → {}", handle(cmd));
    }

    println!("\n── builder_state! macro ──");
    let cfg = ServerConfig::new()
        .host("localhost".to_string())
        .port(9090)
        .timeout(30)
        .tls(true);
    println!("  {cfg:?}");

    println!("\n── lazy_static_val! primes ──");
    println!("  {:?}", primes());

    println!("\n── Matrix2x2 Display ──");
    let mat = Matrix2x2(1.0, 2.0, 3.0, 4.0);
    println!("{mat}");
    println!("det={:.2}  trace={:.2}", mat.det(), mat.trace());

    println!("\n── Nested list ──");
    let l = list![10, 20, 30, 40, 50];
    println!("  sum = {}", list_sum(&l));

    println!("\n── assert_approx_eq! ──");
    assert_approx_eq!(std::f64::consts::PI, 3.14159265, 1e-7);
    println!("  π ≈ 3.14159265 ✓");

    println!("\nDone.");
}
