"""
errors.py — Nexis editor playground
Exercises: exception hierarchy, __cause__/__context__, ExceptionGroup,
           traceback manipulation, contextlib, custom exception types,
           warnings, sys.exc_info, exception notes (Python 3.11+).
"""

from __future__ import annotations

import contextlib
import logging
import sys
import traceback
import warnings
from collections.abc import Generator
from typing import Any, NoReturn, TypeVar

# ── Custom exception hierarchy ────────────────────────────────────────────────

class NexisError(Exception):
    """Base exception for all Nexis errors."""

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code

    def __str__(self) -> str:
        if self.code:
            return f"[{self.code}] {super().__str__()}"
        return super().__str__()


class ConfigError(NexisError):
    """Raised when configuration is invalid."""


class NetworkError(NexisError):
    """Raised for network-related failures."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        url: str | None = None,
    ) -> None:
        super().__init__(message, code="NET_ERR")
        self.status_code = status_code
        self.url = url

    def __str__(self) -> str:
        parts = [super().__str__()]
        if self.url:         parts.append(f"url={self.url!r}")
        if self.status_code: parts.append(f"status={self.status_code}")
        return " ".join(parts)


class AuthError(NetworkError):
    """Raised for authentication/authorization failures."""


class NotFoundError(NetworkError):
    """Raised when a resource is not found."""

    def __init__(self, resource: str, id: str) -> None:
        super().__init__(f"{resource} {id!r} not found", status_code=404)
        self.resource = resource
        self.id = id


class ValidationError(NexisError):
    """Raised when input validation fails."""

    def __init__(self, message: str, *, field: str | None = None) -> None:
        super().__init__(message, code="VALIDATION")
        self.field = field


# ── Exception chaining ────────────────────────────────────────────────────────

def load_config(path: str) -> dict[str, Any]:
    try:
        with open(path) as f:
            import json
            return json.load(f)
    except FileNotFoundError as e:
        raise ConfigError(f"Config file not found: {path}") from e
    except Exception as e:
        raise ConfigError(f"Failed to parse config: {path}") from e


def connect_db(dsn: str) -> None:
    try:
        raise ConnectionError("Connection refused")
    except ConnectionError as e:
        # __cause__: explicit chaining with "from"
        raise NetworkError("Database connection failed", url=dsn) from e


def auth_flow(token: str) -> None:
    if not token:
        raise ValidationError("Token is required", field="token")
    if token == "expired":
        err = AuthError("Token has expired", status_code=401)
        err.add_note("Hint: refresh your token with POST /auth/refresh")
        raise err


# ── Exception notes (Python 3.11+) ───────────────────────────────────────────

def demonstrate_notes() -> None:
    try:
        x = 1 / 0
    except ZeroDivisionError as e:
        e.add_note("This happened while computing a rate")
        e.add_note("Check the denominator before dividing")
        raise


# ── ExceptionGroup (Python 3.11+) ────────────────────────────────────────────

def run_batch(tasks: list[str]) -> None:
    errors: list[Exception] = []
    for task in tasks:
        try:
            if task == "fail1":
                raise ValueError(f"Invalid task: {task!r}")
            if task == "fail2":
                raise RuntimeError(f"Task {task!r} crashed")
        except Exception as e:
            errors.append(e)
    if errors:
        raise ExceptionGroup("batch failures", errors)


def handle_exception_group() -> None:
    try:
        run_batch(["ok", "fail1", "ok", "fail2"])
    except* ValueError as eg:
        print(f"  ValueError group: {[str(e) for e in eg.exceptions]}")
    except* RuntimeError as eg:
        print(f"  RuntimeError group: {[str(e) for e in eg.exceptions]}")


# ── Context managers for error handling ───────────────────────────────────────

@contextlib.contextmanager
def error_boundary(label: str) -> Generator[None, None, None]:
    """Catch and log all exceptions without re-raising."""
    try:
        yield
    except Exception as e:
        logging.error("[%s] %s: %s", label, type(e).__name__, e)


@contextlib.contextmanager
def suppress_and_log(*exception_types: type[BaseException]) -> Generator[None, None, None]:
    try:
        yield
    except exception_types as e:
        print(f"  suppressed: {type(e).__name__}: {e}")


T = TypeVar("T")


def try_parse_int(s: str, default: int = 0) -> int:
    with contextlib.suppress(ValueError, TypeError):
        return int(s)
    return default


# ── Warnings ──────────────────────────────────────────────────────────────────

def deprecated_function() -> None:
    warnings.warn(
        "deprecated_function is deprecated; use new_function instead",
        DeprecationWarning,
        stacklevel=2,
    )


def unstable_feature() -> None:
    warnings.warn(
        "This feature is experimental and may change without notice",
        FutureWarning,
        stacklevel=2,
    )


# ── sys.exc_info & manual traceback ──────────────────────────────────────────

def get_current_exception() -> tuple[type | None, BaseException | None, Any]:
    return sys.exc_info()


def format_exception_chain(exc: BaseException) -> list[str]:
    lines: list[str] = []
    current: BaseException | None = exc
    seen: set[int] = set()

    while current is not None and id(current) not in seen:
        seen.add(id(current))
        lines.append(f"{type(current).__name__}: {current}")
        if hasattr(current, "__notes__"):
            for note in current.__notes__:
                lines.append(f"  Note: {note}")
        cause    = current.__cause__
        context  = current.__context__
        if cause is not None and not current.__suppress_context__:
            lines.append("  (caused by above)")
            current = cause
        elif context is not None:
            lines.append("  (during handling of above)")
            current = context
        else:
            break

    return lines


# ── Re-raise patterns ─────────────────────────────────────────────────────────

def safe_divide(a: float, b: float) -> float:
    try:
        return a / b
    except ZeroDivisionError:
        raise  # re-raise preserving traceback


def assert_never(value: NoReturn) -> NoReturn:
    raise AssertionError(f"Unexpected value: {value!r}")


# ── Exception as a value pattern ─────────────────────────────────────────────

def capture(fn: Any, *args: Any, **kwargs: Any) -> tuple[Any, Exception | None]:
    try:
        return fn(*args, **kwargs), None
    except Exception as e:
        return None, e


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    logging.basicConfig(level=logging.ERROR, format="%(levelname)s %(message)s")

    print("── Custom exceptions ──")
    for exc in [
        ConfigError("Bad config file", code="CFG_001"),
        NetworkError("Connection failed", status_code=503, url="https://api.nexis.dev"),
        NotFoundError("project", "abc-123"),
        ValidationError("email is required", field="email"),
    ]:
        print(f"  {exc}")
        print(f"    type={type(exc).__name__}  NexisError={isinstance(exc, NexisError)}")

    print("\n── Exception chaining ──")
    try:
        connect_db("postgresql://localhost/nexis")
    except NetworkError as e:
        chain = format_exception_chain(e)
        for line in chain:
            print(f"  {line}")

    print("\n── Exception notes ──")
    try:
        demonstrate_notes()
    except ZeroDivisionError as e:
        chain = format_exception_chain(e)
        for line in chain:
            print(f"  {line}")

    print("\n── ExceptionGroup ──")
    handle_exception_group()

    print("\n── suppress & capture ──")
    with suppress_and_log(ValueError, KeyError):
        raise ValueError("this is suppressed")

    result, err = capture(int, "not a number")
    print(f"  capture: result={result!r}  err={err!r}")

    r1 = try_parse_int("42")
    r2 = try_parse_int("oops", default=-1)
    print(f"  try_parse_int: {r1}, {r2}")

    print("\n── Warnings ──")
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        deprecated_function()
        unstable_feature()
    for warning in w:
        print(f"  [{warning.category.__name__}] {warning.message}")

    print("\n── Traceback inspection ──")
    try:
        raise RuntimeError("test error for traceback")
    except RuntimeError:
        exc_type, exc_val, exc_tb = sys.exc_info()
        tb_lines = traceback.format_exception(exc_type, exc_val, exc_tb)
        for line in tb_lines[-2:]:  # last 2 lines
            print(f"  {line.rstrip()}")

    print("\n── Auth flow (with note) ──")
    try:
        auth_flow("expired")
    except AuthError as e:
        chain = format_exception_chain(e)
        for line in chain:
            print(f"  {line}")

    print("\nDone.")


if __name__ == "__main__":
    main()
