defmodule NexisPlayground do
  @moduledoc """
  Test Elixir file — Nexis editor playground.

  Exercises: pattern matching, structs, protocols, behaviours, GenServer,
             pipelines, comprehensions, macros, binary pattern matching.
  """

  # ── Module attributes ────────────────────────────────────────────────────────

  @version "1.3.0"
  @max_retries 3
  @fibonacci_cache %{0 => 0, 1 => 1}

  # ── Structs ──────────────────────────────────────────────────────────────────

  defmodule Config do
    @enforce_keys [:host]
    defstruct host: "localhost",
              port: 8080,
              settings: %{},
              tls: false

    @type t :: %__MODULE__{
      host:     String.t(),
      port:     pos_integer(),
      settings: map(),
      tls:      boolean()
    }

    @spec new(String.t(), keyword()) :: t()
    def new(host, opts \\ []) do
      %__MODULE__{
        host:     host,
        port:     Keyword.get(opts, :port, 8080),
        tls:      Keyword.get(opts, :tls, false),
        settings: Keyword.get(opts, :settings, %{})
      }
    end

    @spec set(t(), atom(), term()) :: t()
    def set(%__MODULE__{} = cfg, key, value) do
      %{cfg | settings: Map.put(cfg.settings, key, value)}
    end

    @spec get(t(), atom(), term()) :: term()
    def get(%__MODULE__{settings: s}, key, default \\ nil) do
      Map.get(s, key, default)
    end

    defimpl String.Chars do
      def to_string(%{host: h, port: p}), do: "Config(host=#{h}, port=#{p})"
    end
  end

  # ── Protocol ─────────────────────────────────────────────────────────────────

  defprotocol Describable do
    @doc "Returns a human-readable description."
    @spec describe(t) :: String.t()
    def describe(value)
  end

  defmodule User do
    defstruct [:id, :name, :email, role: :member, active: true]

    @type role :: :admin | :member | :viewer
    @type t :: %__MODULE__{
      id:     String.t(),
      name:   String.t(),
      email:  String.t(),
      role:   role(),
      active: boolean()
    }

    def new(name, email, role \\ :member) do
      %__MODULE__{
        id:    :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower),
        name:  name,
        email: email,
        role:  role
      }
    end

    def admin?(%__MODULE__{role: :admin}), do: true
    def admin?(_), do: false

    defimpl Describable do
      def describe(%{name: name, email: email, role: role}) do
        "User[#{name} <#{email}>, role=#{role}]"
      end
    end

    defimpl String.Chars do
      def to_string(%{name: n, email: e}), do: "#{n} <#{e}>"
    end
  end

  # ── Pattern matching helpers ──────────────────────────────────────────────────

  def classify(value) do
    case value do
      nil                  -> :null
      true                 -> :bool_true
      false                -> :bool_false
      n when is_integer(n) and n < 0  -> {:negative_int, n}
      n when is_integer(n)             -> {:positive_int, n}
      f when is_float(f)               -> {:float, Float.round(f, 4)}
      "" -> :empty_string
      s when is_binary(s) and byte_size(s) > 100 -> {:long_string, byte_size(s)}
      s when is_binary(s)              -> {:string, s}
      [] -> :empty_list
      [h | _] = list                   -> {:list, length(list), h}
      %{} = map when map_size(map) == 0 -> :empty_map
      %{__struct__: mod}               -> {:struct, mod}
      %{}                              -> :map
      _                                -> :unknown
    end
  end

  # ── Guards & multiple clauses ─────────────────────────────────────────────────

  def fibonacci(0), do: 0
  def fibonacci(1), do: 1
  def fibonacci(n) when is_integer(n) and n > 1 do
    fibonacci(n - 1) + fibonacci(n - 2)
  end
  def fibonacci(n), do: raise(ArgumentError, "expected non-negative integer, got: #{inspect(n)}")

  def fibonacci_stream do
    Stream.unfold({0, 1}, fn {a, b} -> {a, {b, a + b}} end)
  end

  # ── Pipe operator demos ───────────────────────────────────────────────────────

  def process_names(names) do
    names
    |> Enum.filter(&(String.length(&1) >= 3))
    |> Enum.map(&String.trim/1)
    |> Enum.map(&String.capitalize/1)
    |> Enum.sort()
    |> Enum.with_index(1)
    |> Enum.map(fn {name, i} -> "#{i}. #{name}" end)
    |> Enum.join("\n")
  end

  # ── Comprehensions ────────────────────────────────────────────────────────────

  def pythagorean_triples(limit) do
    for c <- 1..limit,
        b <- 1..c,
        a <- 1..b,
        a * a + b * b == c * c do
      {a, b, c}
    end
  end

  def word_frequencies(text) do
    for word <- String.split(text, ~r/\W+/, trim: true),
        word != "",
        into: %{} do
      lower = String.downcase(word)
      {lower, Map.get(%{}, lower, 0) + 1}
    end
    |> then(fn _ ->
      text
      |> String.downcase()
      |> String.split(~r/\W+/, trim: true)
      |> Enum.frequencies()
    end)
  end

  # ── Binary pattern matching ───────────────────────────────────────────────────

  def parse_ip(<<a, b, c, d>>) do
    {:ok, {a, b, c, d}}
  end
  def parse_ip(_), do: {:error, :invalid}

  def decode_tlv(<<type::8, length::16, value::binary-size(length), rest::binary>>) do
    {:ok, {type, value}, rest}
  end
  def decode_tlv(_), do: {:error, :incomplete}

  def parse_utf8_char(<<0b0::1, cp::7, rest::binary>>), do: {cp, rest}
  def parse_utf8_char(<<0b110::3, h::5, 0b10::2, l::6, rest::binary>>), do: {h <<< 6 ||| l, rest}
  def parse_utf8_char(<<0b1110::4, h::4, 0b10::2, m::6, 0b10::2, l::6, rest::binary>>) do
    {h <<< 12 ||| m <<< 6 ||| l, rest}
  end

  # ── With / error handling ─────────────────────────────────────────────────────

  def create_workspace(name, owner_email) do
    with {:ok, email} <- validate_email(owner_email),
         {:ok, user}  <- {:ok, User.new(name <> "_owner", email, :admin)},
         {:ok, _}     <- check_name_available(name) do
      {:ok, %{name: name, owner: user, created_at: DateTime.utc_now()}}
    else
      {:error, :invalid_email} -> {:error, "Invalid owner email: #{owner_email}"}
      {:error, :name_taken}    -> {:error, "Workspace name #{name} is already taken"}
      err                      -> {:error, "Unexpected: #{inspect(err)}"}
    end
  end

  defp validate_email(email) do
    if String.contains?(email, "@"),
      do:   {:ok, email},
      else: {:error, :invalid_email}
  end

  defp check_name_available("taken"), do: {:error, :name_taken}
  defp check_name_available(_),       do: {:ok, :available}

  # ── Macros ────────────────────────────────────────────────────────────────────

  defmacro timed(label, do: block) do
    quote do
      start = System.monotonic_time(:microsecond)
      result = unquote(block)
      elapsed = System.monotonic_time(:microsecond) - start
      IO.puts("  [timed] #{unquote(label)}: #{elapsed}μs")
      result
    end
  end

  defmacro assert_match(pattern, value) do
    quote do
      case unquote(value) do
        unquote(pattern) -> :ok
        other -> raise "Expected #{unquote(Macro.to_string(pattern))}, got: #{inspect(other)}"
      end
    end
  end

  # ── Entry point ───────────────────────────────────────────────────────────────

  def main do
    IO.puts("── Config ──")
    cfg = Config.new("localhost", port: 9090, tls: true)
          |> Config.set(:theme, "dark")
          |> Config.set(:lang, "elixir")
    IO.puts("  #{cfg}")
    IO.puts("  theme=#{Config.get(cfg, :theme)}")

    IO.puts("\n── Users & Protocol ──")
    users = [
      User.new("Alice", "alice@nexis.dev", :admin),
      User.new("Bob",   "bob@nexis.dev"),
      User.new("Carol", "carol@nexis.dev", :viewer),
    ]
    Enum.each(users, &IO.puts("  #{Describable.describe(&1)}"))

    IO.puts("\n── Pattern matching ──")
    values = [nil, true, -5, 42, 3.14, "", "hello", [], [1, 2, 3], %{}, %{a: 1}]
    Enum.each(values, fn v ->
      IO.puts("  #{inspect(v, limit: 3)} -> #{inspect(classify(v))}")
    end)

    IO.puts("\n── Fibonacci ──")
    fibs = fibonacci_stream() |> Enum.take(12)
    IO.puts("  #{inspect(fibs)}")

    IO.puts("\n── Process names ──")
    names = ["  alice  ", "bob", "ev", "Dave", "carol"]
    IO.puts(process_names(names))

    IO.puts("\n── Pythagorean triples ≤ 20 ──")
    pythagorean_triples(20) |> Enum.each(&IO.puts("  #{inspect(&1)}"))

    IO.puts("\n── Binary parsing ──")
    {:ok, ip} = parse_ip(<<192, 168, 1, 1>>)
    IO.puts("  IP: #{Tuple.to_list(ip) |> Enum.join(".")}")

    IO.puts("\n── With / error handling ──")
    IO.puts("  #{inspect(create_workspace("nexis", "owner@nexis.dev"))}")
    IO.puts("  #{inspect(create_workspace("taken", "bad_email"))}")

    IO.puts("\n── Macros ──")
    result = timed("fibonacci(30)") do
      fibonacci(30)
    end
    IO.puts("  fib(30) = #{result}")

    IO.puts("\nDone.")
  end
end

NexisPlayground.main()
