# Test R file — Nexis editor playground
# Exercises: vectors, data frames, functions, closures, S3/R6 classes,
#            functional programming, regex, apply family, environments

# ── Vectors & basic ops ───────────────────────────────────────────────────────

x <- c(3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5)
cat("Sum:", sum(x), "\n")
cat("Mean:", mean(x), "\n")
cat("SD:", round(sd(x), 4), "\n")
cat("Sorted:", sort(x), "\n")
cat("Unique:", sort(unique(x)), "\n")
cat("Tabulated:\n")
print(table(x))

# Named vector
scores <- c(alice = 95, bob = 78, carol = 88, dave = 92, eve = 100)
cat("\nTop 3:\n")
print(sort(scores, decreasing = TRUE)[1:3])

# Logical indexing
high <- scores[scores >= 90]
cat("Scores >= 90:", paste(names(high), collapse = ", "), "\n")

# Vectorised operations
vec <- seq(1, 20, by = 2)
cat("Odd numbers 1-19:", vec, "\n")
cat("Squares:", vec^2, "\n")
cat("Cumsum:", cumsum(vec), "\n")

# Matrix
m <- matrix(1:16, nrow = 4, ncol = 4)
cat("\nMatrix:\n")
print(m)
cat("Transpose:\n")
print(t(m))
cat("Row sums:", rowSums(m), "\n")
cat("Col means:", colMeans(m), "\n")
cat("Determinant:", det(matrix(c(1,2,3,4), 2, 2)), "\n")

# ── Functions & closures ──────────────────────────────────────────────────────

make_counter <- function(start = 0, step = 1) {
  count <- start
  list(
    tick  = function() { count <<- count + step; count },
    reset = function() { count <<- start },
    value = function() count
  )
}

ctr <- make_counter(10, 2)
invisible(replicate(3, ctr$tick()))
cat("\nCounter after 3 ticks (step=2):", ctr$value(), "\n")

# Memoisation
memoize <- function(f) {
  cache <- list()
  function(...) {
    key <- paste(..., sep = "_")
    if (!is.null(cache[[key]])) {
      cache[[key]]
    } else {
      result <- f(...)
      cache[[key]] <<- result
      result
    }
  }
}

fib_raw <- function(n) {
  if (n <= 1) return(n)
  fib_memo(n - 1) + fib_memo(n - 2)
}
fib_memo <- memoize(fib_raw)

cat("Fibonacci 0-10:", sapply(0:10, fib_memo), "\n")

# Currying / partial application
power <- function(exp) function(base) base^exp
square <- power(2)
cube   <- power(3)
cat("Squares 1-5:", sapply(1:5, square), "\n")
cat("Cubes   1-5:", sapply(1:5, cube),   "\n")

# ── Apply family ──────────────────────────────────────────────────────────────

mat <- matrix(rnorm(12, mean = 5, sd = 2), nrow = 3)
cat("\nMatrix row means:", apply(mat, 1, mean), "\n")
cat("Matrix col means:", apply(mat, 2, mean), "\n")

lst <- list(a = 1:5, b = 6:10, c = 11:15)
cat("lapply sum:", unlist(lapply(lst, sum)), "\n")
cat("sapply sum:", sapply(lst, sum), "\n")
cat("vapply sum:", vapply(lst, sum, numeric(1)), "\n")

# Reduce
cat("Reduce +:", Reduce(`+`, 1:10), "\n")
cat("Reduce * (acc):", Reduce(`*`, 1:5, accumulate = TRUE), "\n")

# Filter / Map (base R)
evens <- Filter(function(n) n %% 2 == 0, 1:20)
cat("Evens:", evens, "\n")
doubled <- Map(function(n) n * 2, 1:5)
cat("Doubled:", unlist(doubled), "\n")

# ── Data frames ───────────────────────────────────────────────────────────────

people <- data.frame(
  name   = c("Alice", "Bob", "Carol", "Dave", "Eve"),
  age    = c(30, 24, 28, 35, 22),
  score  = c(95, 78, 88, 92, 100),
  dept   = factor(c("eng", "mkt", "eng", "mkt", "eng")),
  active = c(TRUE, TRUE, FALSE, TRUE, TRUE),
  stringsAsFactors = FALSE
)

cat("\nData frame:\n")
print(people)
cat("\nSummary:\n")
print(summary(people))

# Subsetting
cat("\nEngineering dept:\n")
print(people[people$dept == "eng", c("name", "score")])

# Ordering
cat("\nSorted by age descending:\n")
print(people[order(-people$age), c("name", "age")])

# tapply: mean score by department
cat("\nMean score by dept:\n")
print(tapply(people$score, people$dept, mean))

# Aggregation
cat("\nAggregate (mean score per dept):\n")
print(aggregate(score ~ dept, data = people, FUN = mean))

# ── S3 class ──────────────────────────────────────────────────────────────────

new_config <- function(host, port = 8080) {
  obj <- list(host = host, port = port, settings = list())
  class(obj) <- "Config"
  obj
}

set_setting <- function(cfg, ...) UseMethod("set_setting")
get_setting <- function(cfg, ...) UseMethod("get_setting")

set_setting.Config <- function(cfg, key, value) {
  cfg$settings[[key]] <- value
  cfg
}

get_setting.Config <- function(cfg, key, default = NULL) {
  if (!is.null(cfg$settings[[key]])) cfg$settings[[key]] else default
}

print.Config <- function(cfg, ...) {
  cat(sprintf("Config(host=%s, port=%d)\n", cfg$host, cfg$port))
}

toString.Config <- function(cfg, ...) {
  sprintf("Config(%s:%d)", cfg$host, cfg$port)
}

cfg <- new_config("localhost")
cfg <- set_setting(cfg, "theme", "dark")
cfg <- set_setting(cfg, "lang",  "r")
print(cfg)
cat("theme:", get_setting(cfg, "theme", "default"), "\n")

# ── Regex & string ops ────────────────────────────────────────────────────────

text <- "The quick brown fox jumps over the lazy dog. FOX IS QUICK."

cat("\nRegex demos:\n")
cat("  Match 'fox':", grepl("fox", text, ignore.case = TRUE), "\n")
cat("  Extract words:", paste(regmatches(text, gregexpr("\\b[A-Z]+\\b", text))[[1]], collapse = ", "), "\n")
cat("  Replace:", sub("fox", "cat", text, ignore.case = TRUE), "\n")
cat("  All replace:", gsub("(fox|dog)", "[\\1]", text, ignore.case = TRUE), "\n")

# String formatting
cat(sprintf("  Pi = %.6f\n", pi))
cat(sprintf("  %-10s: %5.1f%%\n", "Alice", 95.5))
cat(sprintf("  %#010x\n", 255L))

# ── Environments ─────────────────────────────────────────────────────────────

make_namespace <- function() {
  env <- new.env(parent = emptyenv())
  env$registry <- list()

  register <- function(name, fn) {
    env$registry[[name]] <- fn
    invisible(env)
  }

  dispatch <- function(name, ...) {
    fn <- env$registry[[name]]
    if (is.null(fn)) stop(paste("Unknown command:", name))
    fn(...)
  }

  list(register = register, dispatch = dispatch, env = env)
}

ns <- make_namespace()
ns$register("greet",   function(n) paste("Hello,", n))
ns$register("shout",   function(n) toupper(paste("Hello,", n, "!")))
ns$register("whisper", function(n) tolower(paste("hello,", n, "...")))

cat("\nNamespace dispatch:\n")
for (cmd in c("greet", "shout", "whisper")) {
  cat(sprintf("  %s: %s\n", cmd, ns$dispatch(cmd, "Nexis")))
}

# ── Statistical computations ──────────────────────────────────────────────────

set.seed(42)
n    <- 1000
data <- rnorm(n, mean = 50, sd = 10)

cat(sprintf("\nSample (n=%d): mean=%.2f sd=%.2f min=%.2f max=%.2f\n",
            n, mean(data), sd(data), min(data), max(data)))

# Confidence interval
se <- sd(data) / sqrt(n)
ci <- c(mean(data) - 1.96 * se, mean(data) + 1.96 * se)
cat(sprintf("95%% CI: [%.3f, %.3f]\n", ci[1], ci[2]))

# Quantiles
cat("Quartiles:", quantile(data, probs = c(0.25, 0.5, 0.75)), "\n")

# Correlation
y <- data * 0.7 + rnorm(n, 0, 5)
cat(sprintf("Correlation with y: %.4f\n", cor(data, y)))

# Simple linear regression
model <- lm(y ~ data)
coefs <- coef(model)
cat(sprintf("lm: y = %.4f + %.4f*x  (R²=%.4f)\n",
            coefs[1], coefs[2], summary(model)$r.squared))
