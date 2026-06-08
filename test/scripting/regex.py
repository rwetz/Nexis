"""
regex.py — Nexis editor playground
Exercises: all re flags, lookahead/lookbehind, named groups, backreferences,
           atomic groups, possessive quantifiers (via regex module), verbose mode.
"""

import re
from dataclasses import dataclass
from typing import Iterator

# ── Basic patterns & flags ───────────────────────────────────────────────────

SAMPLE = """
Alice Smith <alice@nexis.dev> — joined 2023-01-15, score: 95.5
Bob Johnson <bob@example.org> — joined 2024-06-30, score: 78
Carol O'Brien <carol@nexis.dev> — joined 2022-11-03, score: 88.25
Dave Lee <dave@test.io> — joined 2025-01-01, score: 100
"""

# re.IGNORECASE
def find_nexis_users(text: str) -> list[str]:
    return re.findall(r'\b\w+@nexis\.dev\b', text, re.IGNORECASE)

# re.MULTILINE (^ and $ match line boundaries)
def find_names_at_line_start(text: str) -> list[str]:
    return re.findall(r'^\w+\s\w+', text, re.MULTILINE)

# re.DOTALL (. matches newline)
def extract_block(text: str, start: str, end: str) -> str | None:
    pattern = re.escape(start) + r'(.*?)' + re.escape(end)
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1) if m else None

# re.VERBOSE — readable pattern
DATE_PATTERN = re.compile(r"""
    (?P<year>  \d{4}) -   # 4-digit year
    (?P<month> \d{2}) -   # 2-digit month
    (?P<day>   \d{2})     # 2-digit day
""", re.VERBOSE)

# re.ASCII — \w \d etc. match only ASCII
ASCII_WORD = re.compile(r'\w+', re.ASCII)

# ── Named groups ──────────────────────────────────────────────────────────────

EMAIL_RE = re.compile(
    r'(?P<local>[a-zA-Z0-9._%+\-]+)'
    r'@'
    r'(?P<domain>[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})'
)

def parse_email(s: str) -> dict[str, str] | None:
    m = EMAIL_RE.fullmatch(s.strip())
    return m.groupdict() if m else None


SEMVER_RE = re.compile(
    r'^'
    r'v?(?P<major>0|[1-9]\d*)'
    r'\.'
    r'(?P<minor>0|[1-9]\d*)'
    r'\.'
    r'(?P<patch>0|[1-9]\d*)'
    r'(?:-(?P<pre>[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*))?'
    r'(?:\+(?P<build>[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*))?'
    r'$'
)

@dataclass
class SemVer:
    major: int
    minor: int
    patch: int
    pre:   str | None = None
    build: str | None = None

    @classmethod
    def parse(cls, s: str) -> "SemVer | None":
        m = SEMVER_RE.match(s)
        if not m:
            return None
        return cls(
            major=int(m["major"]),
            minor=int(m["minor"]),
            patch=int(m["patch"]),
            pre=m["pre"],
            build=m["build"],
        )

    def __str__(self) -> str:
        base = f"{self.major}.{self.minor}.{self.patch}"
        if self.pre:   base += f"-{self.pre}"
        if self.build: base += f"+{self.build}"
        return base

# ── Lookahead / lookbehind ────────────────────────────────────────────────────

# Positive lookahead: word followed by ".dev"
def find_dev_words(text: str) -> list[str]:
    return re.findall(r'\b\w+(?=\.dev)', text)

# Negative lookahead: number NOT followed by "px"
def find_raw_numbers(text: str) -> list[str]:
    return re.findall(r'\d+(?!\s*px)', text)

# Positive lookbehind: email address preceded by <
def find_bracketed_emails(text: str) -> list[str]:
    return re.findall(r'(?<=<)[^>]+@[^>]+(?=>)', text)

# Negative lookbehind: word not preceded by @
NON_AT_WORD = re.compile(r'(?<!@)\b[A-Za-z]{4,}\b')

# ── Backreferences ────────────────────────────────────────────────────────────

# Match repeated word: "the the", "is is"
REPEATED_WORD = re.compile(r'\b(\w+)\s+\1\b', re.IGNORECASE)

def find_repeated_words(text: str) -> list[str]:
    return REPEATED_WORD.findall(text)

# Balanced quote — naive (proper balance needs recursive regex or parser)
QUOTED_STRING = re.compile(r'(["\'])(?:(?!\1).|\\.)*\1')

# ── Non-capturing groups ──────────────────────────────────────────────────────

# (?:...) — group without capture
IP_OCTET = r'(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)'
IP_RE    = re.compile(r'\b' + r'\.'.join([IP_OCTET] * 4) + r'\b')

def find_ips(text: str) -> list[str]:
    return IP_RE.findall(text)

# ── Atomic groups via workaround (Python re doesn't support (?>...)) ─────────
# Use possessive quantifiers available in the `regex` module, or rewrite
# to avoid catastrophic backtracking manually.

# Catastrophic backtracking example — avoid patterns like (a+)+b
# Safe alternative:
SAFE_REPEAT = re.compile(r'a{1,100}b')

# ── re.sub with function ──────────────────────────────────────────────────────

def camel_to_snake(s: str) -> str:
    s = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', s)
    s = re.sub(r'([a-z\d])([A-Z])',     r'\1_\2', s)
    return s.lower()

def snake_to_camel(s: str) -> str:
    return re.sub(r'_([a-z])', lambda m: m.group(1).upper(), s)

def mask_email(s: str) -> str:
    def replace(m: re.Match) -> str:
        local  = m.group("local")
        domain = m.group("domain")
        masked = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{masked}@{domain}"
    return EMAIL_RE.sub(replace, s)

def expand_abbreviations(text: str, abbrevs: dict[str, str]) -> str:
    pattern = re.compile(
        r'\b(' + '|'.join(re.escape(k) for k in sorted(abbrevs, key=len, reverse=True)) + r')\b'
    )
    return pattern.sub(lambda m: abbrevs[m.group()], text)

# ── re.split edge cases ───────────────────────────────────────────────────────

def smart_split(text: str) -> list[str]:
    """Split on whitespace OR comma, stripping both."""
    return [t for t in re.split(r'[\s,]+', text) if t]

# ── Tokenizer ────────────────────────────────────────────────────────────────

TOKEN_PATTERNS = [
    ("NUMBER",     r'\d+(?:\.\d+)?(?:[eE][+-]?\d+)?'),
    ("STRING",     r'"(?:[^"\\]|\\.)*"'),
    ("IDENTIFIER", r'[A-Za-z_]\w*'),
    ("OPERATOR",   r'[-+*/=<>!&|^~%]+'),
    ("PUNCT",      r'[()[\]{},;:.]'),
    ("WHITESPACE", r'\s+'),
    ("UNKNOWN",    r'.'),
]

MASTER_RE = re.compile(
    '|'.join(f'(?P<{name}>{pattern})' for name, pattern in TOKEN_PATTERNS)
)

@dataclass
class Token:
    kind:   str
    value:  str
    start:  int
    end:    int

def tokenize(source: str) -> Iterator[Token]:
    for m in MASTER_RE.finditer(source):
        kind = m.lastgroup
        if kind != "WHITESPACE":
            yield Token(kind=kind, value=m.group(), start=m.start(), end=m.end())

# ── URL parser via regex ──────────────────────────────────────────────────────

URL_RE = re.compile(
    r'^(?P<scheme>[a-zA-Z][a-zA-Z0-9+\-.]*)'
    r'://'
    r'(?:(?P<userinfo>[^@/?#]*)@)?'
    r'(?P<host>[^/?#:]*)'
    r'(?::(?P<port>\d+))?'
    r'(?P<path>[^?#]*)'
    r'(?:\?(?P<query>[^#]*))?'
    r'(?:#(?P<fragment>.*))?$'
)

def parse_url(url: str) -> dict[str, str | None] | None:
    m = URL_RE.match(url)
    return m.groupdict() if m else None

# ── Regex compilation cache / reuse ──────────────────────────────────────────

class RegexMatcher:
    __slots__ = ("_pattern", "_flags")

    def __init__(self, pattern: str, flags: int = 0) -> None:
        self._pattern = re.compile(pattern, flags)
        self._flags   = flags

    def match(self, s: str) -> re.Match | None:
        return self._pattern.match(s)

    def find_all(self, s: str) -> list[str]:
        return self._pattern.findall(s)

    def sub(self, repl: str, s: str) -> str:
        return self._pattern.sub(repl, s)

# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("── Named groups — Date parsing ──")
    for date_str in ["2025-06-01", "invalid", "1999-12-31"]:
        m = DATE_PATTERN.search(date_str)
        if m:
            print(f"  {date_str} -> year={m['year']} month={m['month']} day={m['day']}")

    print("\n── Email parsing ──")
    for email in ["alice@nexis.dev", "bob+filter@example.org", "invalid", "user@"]:
        result = parse_email(email)
        print(f"  {email!r:35} -> {result}")

    print("\n── SemVer ──")
    for v in ["1.3.0", "v2.0.0-beta.1", "0.9.0+build.42", "not-a-version"]:
        sv = SemVer.parse(v)
        print(f"  {v!r:25} -> {sv}")

    print("\n── Lookahead / lookbehind ──")
    print("  .dev words:", find_dev_words(SAMPLE))
    print("  bracketed emails:", find_bracketed_emails(SAMPLE))

    print("\n── Backreferences (repeated words) ──")
    test_text = "the the quick brown fox fox jumps over the lazy dog dog"
    print(f"  '{test_text}'")
    print("  repeated:", find_repeated_words(test_text))

    print("\n── IP addresses ──")
    ip_text = "servers: 192.168.1.1, 10.0.0.1, 999.999.999.999 (invalid), 172.16.254.1"
    print("  found:", find_ips(ip_text))

    print("\n── Substitution ──")
    names = ["camelCaseIdentifier", "HTTPSRequestHandler", "getURLFromString", "parseJSON"]
    for n in names:
        print(f"  {n} -> {camel_to_snake(n)} -> {snake_to_camel(camel_to_snake(n))}")

    print("\n── Email masking ──")
    print(f"  {mask_email('Contact alice@nexis.dev or bob@example.org for help')}")

    print("\n── Tokenizer ──")
    source = 'if x >= 3.14 { print("hello") } // comment'
    tokens = list(tokenize(source))
    for tok in tokens[:10]:
        print(f"  {tok.kind:12} {tok.value!r}")

    print("\n── URL parsing ──")
    urls = [
        "https://user:pass@nexis.dev:8080/api/v1?foo=bar&baz=1#section",
        "ftp://files.example.com/data.zip",
        "ws://localhost:9090/ws",
    ]
    for url in urls:
        parsed = parse_url(url)
        if parsed:
            print(f"  {url}")
            print(f"    {parsed}")

    print("\nDone.")


if __name__ == "__main__":
    main()
