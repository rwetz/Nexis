#!/usr/bin/env python3
"""Test Python file — Nexis editor playground.

Exercises: dataclasses, protocols, generics, async/await, decorators,
           generators, context managers, pattern matching, type aliases.
"""

from __future__ import annotations

import asyncio
import contextlib
import dataclasses
import functools
import inspect
import itertools
import re
import time
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator, Callable, Generator, Iterator, Sequence
from enum import Enum, Flag, auto, unique
from typing import (
    TYPE_CHECKING,
    Annotated,
    Any,
    ClassVar,
    Generic,
    NamedTuple,
    Protocol,
    TypeAlias,
    TypeVar,
    cast,
    runtime_checkable,
)

if TYPE_CHECKING:
    pass

T = TypeVar("T")
T_co = TypeVar("T_co", covariant=True)
Seconds: TypeAlias = Annotated[float, "seconds since epoch"]

# ── Protocols ─────────────────────────────────────────────────────────────────

@runtime_checkable
class Comparable(Protocol[T_co]):
    def __lt__(self, other: T_co) -> bool: ...
    def __le__(self, other: T_co) -> bool: ...

# ── Enums ─────────────────────────────────────────────────────────────────────

@unique
class Status(Enum):
    IDLE    = "idle"
    LOADING = "loading"
    SUCCESS = "success"
    ERROR   = "error"

    @property
    def is_terminal(self) -> bool:
        return self in (Status.SUCCESS, Status.ERROR)


class Permission(Flag):
    READ    = auto()
    WRITE   = auto()
    EXECUTE = auto()
    ADMIN   = READ | WRITE | EXECUTE

    def allows(self, other: "Permission") -> bool:
        return (self & other) == other

# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclasses.dataclass(frozen=True, slots=True)
class Position:
    line: int
    character: int

    def __add__(self, other: "Position") -> "Position":
        return Position(self.line + other.line, self.character + other.character)


@dataclasses.dataclass(order=True)
class Version:
    major: int
    minor: int
    patch: int
    pre: str = dataclasses.field(default="", compare=False)

    _SEMVER_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"^v?(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)"
        r"(?:-(?P<pre>[a-zA-Z0-9.]+))?$"
    )

    @classmethod
    def parse(cls, s: str) -> "Version":
        m = cls._SEMVER_RE.match(s)
        if not m:
            raise ValueError(f"Invalid version: {s!r}")
        return cls(
            major=int(m["major"]),
            minor=int(m["minor"]),
            patch=int(m["patch"]),
            pre=m["pre"] or "",
        )

    @property
    def is_stable(self) -> bool:
        return not self.pre

    def bump_minor(self) -> "Version":
        return dataclasses.replace(self, minor=self.minor + 1, patch=0, pre="")

    def __str__(self) -> str:
        base = f"{self.major}.{self.minor}.{self.patch}"
        return f"{base}-{self.pre}" if self.pre else base

# ── Generic Result type ────────────────────────────────────────────────────────

@dataclasses.dataclass
class Ok(Generic[T]):
    value: T

    def unwrap(self) -> T:
        return self.value


@dataclasses.dataclass
class Err(Generic[T]):
    error: Exception

    def unwrap(self) -> T:
        raise self.error


def safe(f: Callable[..., T]) -> Callable[..., "Ok[T] | Err[T]"]:
    """Decorator: wraps exceptions into Err."""
    @functools.wraps(f)
    def wrapper(*args: Any, **kwargs: Any) -> "Ok[T] | Err[T]":
        try:
            return Ok(f(*args, **kwargs))
        except Exception as exc:
            return Err(exc)
    return wrapper

# ── Generators ────────────────────────────────────────────────────────────────

def fibonacci() -> Generator[int, None, None]:
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b


def sliding_window(seq: Sequence[T], n: int) -> Iterator[tuple[T, ...]]:
    it = iter(seq)
    window = tuple(itertools.islice(it, n))
    if len(window) == n:
        yield window
    for item in it:
        window = window[1:] + (item,)
        yield window


def chunk(seq: Sequence[T], size: int) -> Iterator[Sequence[T]]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]

# ── Decorators ────────────────────────────────────────────────────────────────

REGISTRY: dict[str, Callable[..., Any]] = {}


def register(name: str | None = None) -> Callable[[Callable[..., T]], Callable[..., T]]:
    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        key = name or fn.__name__
        REGISTRY[key] = fn
        return fn
    return decorator


def retry(
    *,
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple[type[Exception], ...] = (Exception,),
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            current_delay = delay
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as exc:
                    if attempt == max_attempts:
                        raise
                    time.sleep(current_delay)
                    current_delay *= backoff
            raise RuntimeError("unreachable")
        return wrapper
    return decorator


def log_calls(fn: Callable[..., T]) -> Callable[..., T]:
    sig = inspect.signature(fn)

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> T:
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        params = ", ".join(f"{k}={v!r}" for k, v in bound.arguments.items())
        print(f"[call] {fn.__qualname__}({params})")
        result = fn(*args, **kwargs)
        print(f"[ret]  {fn.__qualname__} -> {result!r}")
        return result
    return wrapper

# ── Context managers ──────────────────────────────────────────────────────────

class Timer:
    def __init__(self, label: str = "") -> None:
        self.label = label
        self.elapsed: float = 0.0

    def __enter__(self) -> "Timer":
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_: Any) -> None:
        self.elapsed = time.perf_counter() - self._start
        if self.label:
            print(f"[timer] {self.label}: {self.elapsed * 1000:.2f}ms")


@contextlib.contextmanager
def temp_env(**kwargs: str) -> Generator[None, None, None]:
    import os
    old = {k: os.environ.get(k) for k in kwargs}
    os.environ.update(kwargs)
    try:
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

# ── Async ─────────────────────────────────────────────────────────────────────

async def fetch_batch(urls: list[str], *, concurrency: int = 5) -> list[Any]:
    sem = asyncio.Semaphore(concurrency)

    async def fetch_one(url: str) -> "Ok[bytes] | Err[bytes]":
        async with sem:
            await asyncio.sleep(0.01)
            if "error" in url:
                return Err(ValueError(f"Bad URL: {url}"))
            return Ok(url.encode())

    return list(await asyncio.gather(*[fetch_one(u) for u in urls]))


async def event_stream(n: int = 10) -> AsyncGenerator[str, None]:
    for i in range(n):
        await asyncio.sleep(0.01)
        yield f"event:{i}"

# ── Pattern matching (Python 3.10+) ──────────────────────────────────────────

def describe_shape(shape: object) -> str:
    match shape:
        case {"type": "circle", "r": float(r)} if r > 0:
            return f"circle with radius {r}"
        case {"type": "rect", "w": float(w), "h": float(h)}:
            return f"rectangle {w}x{h}, area={w*h:.2f}"
        case [int(x), int(y)]:
            return f"point ({x}, {y})"
        case str(s) if s.startswith("svg:"):
            return f"SVG shape: {s[4:]}"
        case None:
            return "nothing"
        case _:
            return f"unknown: {type(shape).__name__}"

# ── NamedTuple ────────────────────────────────────────────────────────────────

class Span(NamedTuple):
    start: Position
    end: Position

    @property
    def line_count(self) -> int:
        return self.end.line - self.start.line + 1

# ── Abstract base class ───────────────────────────────────────────────────────

class BasePlugin(ABC):
    _registry: ClassVar[dict[str, type["BasePlugin"]]] = {}

    def __init_subclass__(cls, name: str = "", **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if name:
            BasePlugin._registry[name] = cls

    @abstractmethod
    def activate(self) -> None: ...

    @abstractmethod
    def deactivate(self) -> None: ...

    @property
    @abstractmethod
    def display_name(self) -> str: ...


class LspPlugin(BasePlugin, name="lsp"):
    def activate(self)   -> None: print("LSP activated")
    def deactivate(self) -> None: print("LSP deactivated")

    @property
    def display_name(self) -> str: return "Language Server Protocol"

# ── Generic container with __slots__ ─────────────────────────────────────────

class BoundedBuffer(Generic[T]):
    __slots__ = ("_data", "_cap", "_head", "_tail", "_size")

    def __init__(self, capacity: int) -> None:
        self._data: list[T | None] = [None] * capacity
        self._cap  = capacity
        self._head = 0
        self._tail = 0
        self._size = 0

    def push(self, item: T) -> None:
        if self._size == self._cap:
            raise OverflowError("Buffer full")
        self._data[self._tail] = item
        self._tail = (self._tail + 1) % self._cap
        self._size += 1

    def pop(self) -> T:
        if self._size == 0:
            raise IndexError("Buffer empty")
        item = cast(T, self._data[self._head])
        self._data[self._head] = None
        self._head = (self._head + 1) % self._cap
        self._size -= 1
        return item

    def __len__(self) -> int:    return self._size
    def __bool__(self) -> bool:  return self._size > 0
    def __repr__(self) -> str:
        items = [self._data[(self._head + i) % self._cap] for i in range(self._size)]
        return f"BoundedBuffer({items!r}, cap={self._cap})"


@register("greet")
@log_calls
def greet(name: str, *, formal: bool = False) -> str:
    salutation = "Good day" if formal else "Hello"
    return f"{salutation}, {name}!"


@register("fib")
@safe
def nth_fibonacci(n: int) -> int:
    if n < 0:
        raise ValueError("n must be >= 0")
    return next(itertools.islice(fibonacci(), n, None))

# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
    print("-- Versions --")
    for raw in ["1.3.0", "v2.0.0-beta.1", "0.9.0"]:
        v = Version.parse(raw)
        print(f"  {v}  stable={v.is_stable}  next_minor={v.bump_minor()}")

    print("\n-- Fibonacci --")
    fibs = list(itertools.islice(fibonacci(), 12))
    print(f"  {fibs}")

    print("\n-- Decorators / Registry --")
    print(f"  {greet('Alice')}")
    print(f"  {greet('Bob', formal=True)}")
    result = nth_fibonacci(10)
    print(f"  fib(10) = {result.unwrap()}")

    print("\n-- Pattern matching --")
    for shape in [
        {"type": "circle", "r": 3.0},
        {"type": "rect",   "w": 4.0, "h": 5.0},
        [10, 20],
        "svg:path",
        None,
    ]:
        print(f"  {str(shape):40} -> {describe_shape(shape)}")

    print("\n-- Async batch fetch --")
    urls = [f"https://api.example.com/{i}" for i in range(5)] + ["https://error.example.com"]
    results = await fetch_batch(urls, concurrency=3)
    for url, res in zip(urls, results):
        tag = "ok" if isinstance(res, Ok) else "err"
        print(f"  [{tag}] {url.split('/')[-1]}")

    print("\n-- Bounded buffer --")
    buf: BoundedBuffer[int] = BoundedBuffer(4)
    for x in [10, 20, 30, 40]:
        buf.push(x)
    print(f"  {buf}")
    print(f"  pop -> {buf.pop()}, {buf.pop()}")

    print("\n-- Timer --")
    with Timer("fibonacci loop"):
        _ = sum(itertools.islice(fibonacci(), 1000))

    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
