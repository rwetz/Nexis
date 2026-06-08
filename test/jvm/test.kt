// Test Kotlin file — Nexis editor playground
// Exercises: data classes, sealed classes, extension functions, coroutines, generics

package test

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

// ── Data classes ──────────────────────────────────────────────────────────────

data class Config(
    val host: String,
    val port: Int = 8080,
    val settings: Map<String, String> = emptyMap()
) {
    fun withSetting(key: String, value: String): Config =
        copy(settings = settings + (key to value))

    fun getSetting(key: String, default: String = ""): String =
        settings.getOrDefault(key, default)

    override fun toString() = "Config(host=$host, port=$port)"
}

// ── Sealed class hierarchy ────────────────────────────────────────────────────

sealed class Result<out T> {
    data class Success<T>(val value: T) : Result<T>()
    data class Failure(val error: Throwable) : Result<Nothing>()
    object Loading : Result<Nothing>()

    val isSuccess get() = this is Success
    val isFailure get() = this is Failure

    fun getOrNull(): T? = when (this) {
        is Success -> value
        else -> null
    }

    fun getOrElse(default: @UnsafeVariance T): T = when (this) {
        is Success -> value
        else -> default
    }

    fun <R> map(transform: (T) -> R): Result<R> = when (this) {
        is Success -> Success(transform(value))
        is Failure -> this
        is Loading -> Loading
    }

    fun onSuccess(action: (T) -> Unit): Result<T> {
        if (this is Success) action(value)
        return this
    }
}

// ── Generic stack ─────────────────────────────────────────────────────────────

class Stack<T> {
    private val elements = ArrayDeque<T>()

    fun push(item: T) = elements.addLast(item)
    fun pop(): T = elements.removeLast()
    fun peek(): T = elements.last()
    fun isEmpty() = elements.isEmpty()
    val size get() = elements.size

    operator fun contains(item: T) = item in elements

    override fun toString() = "Stack$elements"
}

// ── Extension functions ───────────────────────────────────────────────────────

fun String.toTitleCase(): String =
    split(" ").joinToString(" ") { word ->
        word.replaceFirstChar { it.uppercase() }
    }

fun Int.fibonacci(): Long {
    require(this >= 0) { "Input must be non-negative, got $this" }
    var a = 0L
    var b = 1L
    repeat(this) { a = b.also { b += a } }
    return a
}

fun <T> List<T>.second(): T {
    if (size < 2) throw NoSuchElementException("List has fewer than 2 elements")
    return this[1]
}

// ── Inline + reified ─────────────────────────────────────────────────────────

inline fun <reified T> Any?.castOrNull(): T? = this as? T

inline fun <T> measureNs(block: () -> T): Pair<T, Long> {
    val start = System.nanoTime()
    val result = block()
    return result to (System.nanoTime() - start)
}

// ── Coroutine flow ────────────────────────────────────────────────────────────

fun fibonacciFlow(): Flow<Long> = flow {
    var a = 0L
    var b = 1L
    while (true) {
        emit(a)
        a = b.also { b += a }
    }
}

// ── DSL builder ──────────────────────────────────────────────────────────────

class HtmlBuilder {
    private val sb = StringBuilder()

    fun tag(name: String, attrs: Map<String, String> = emptyMap(), content: HtmlBuilder.() -> Unit) {
        val attrStr = if (attrs.isEmpty()) "" else attrs.entries.joinToString(" ", prefix = " ") { (k, v) -> """$k="$v"""" }
        sb.append("<$name$attrStr>")
        content()
        sb.append("</$name>")
    }

    fun text(s: String) { sb.append(s) }

    override fun toString() = sb.toString()
}

fun html(block: HtmlBuilder.() -> Unit): String = HtmlBuilder().apply(block).toString()

// ── Entry point ───────────────────────────────────────────────────────────────

fun main() = runBlocking {
    val cfg = Config("localhost")
        .withSetting("theme", "dark")
        .withSetting("lang", "kotlin")

    println(cfg)
    println("Theme: ${cfg.getSetting("theme")}")

    println("\nFirst 10 Fibonacci numbers:")
    (0..9).forEach { n -> println("  fib($n) = ${n.fibonacci()}") }

    println("\nFirst 10 via Flow:")
    fibonacciFlow()
        .take(10)
        .toList()
        .forEachIndexed { i, v -> println("  fib($i) = $v") }

    println("\nSealed Result:")
    val r: Result<Int> = Result.Success(42)
    r.map { it * 2 }
        .onSuccess { println("  Doubled: $it") }

    println("\nStack:")
    val stack = Stack<String>()
    listOf("a", "b", "c").forEach { stack.push(it) }
    println("  Size: ${stack.size}, peek: ${stack.peek()}, pop: ${stack.pop()}")

    println("\nHTML DSL:")
    println(html {
        tag("div", mapOf("class" to "container")) {
            tag("h1") { text("Hello Nexis") }
            tag("p") { text("Kotlin DSL test") }
        }
    })

    println("\n'hello world'.toTitleCase() = ${"hello world".toTitleCase()}")
}
