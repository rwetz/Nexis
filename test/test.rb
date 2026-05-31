# Test Ruby file — Nexis editor playground
# Exercises: classes, modules, blocks, symbols, pattern matching, frozen strings

# frozen_string_literal: true

require "set"
require "json"

# ── Module ────────────────────────────────────────────────────────────────────

module Greetable
  def greet
    "Hello, I am #{name}"
  end

  def farewell(recipient)
    "Goodbye, #{recipient}, from #{name}"
  end
end

# ── Config class ──────────────────────────────────────────────────────────────

class Config
  include Comparable

  attr_reader :host, :port, :settings

  DEFAULT_PORT = 8080

  def initialize(host, port = DEFAULT_PORT)
    @host = host.freeze
    @port = Integer(port)
    @settings = {}
  end

  def set(key, value)
    @settings[key.to_sym] = value
    self
  end

  def get(key, default: nil)
    @settings.fetch(key.to_sym, default)
  end

  def <=>(other)
    port <=> other.port
  end

  def to_s
    "Config(host=#{host.inspect}, port=#{port})"
  end

  def to_h
    { host: host, port: port, settings: settings }
  end

  def to_json(*)
    to_h.to_json
  end
end

# ── Fibonacci ─────────────────────────────────────────────────────────────────

module Math
  def self.fibonacci(n)
    raise ArgumentError, "n must be non-negative" unless n >= 0

    a, b = 0, 1
    n.times { a, b = b, a + b }
    a
  end

  def self.primes_up_to(limit)
    sieve = Array.new(limit + 1, true)
    sieve[0] = sieve[1] = false
    (2..Math.sqrt(limit)).each do |i|
      (i * i..limit).step(i) { |j| sieve[j] = false } if sieve[i]
    end
    (2..limit).select { |i| sieve[i] }
  end
end

# ── Person with mixin ─────────────────────────────────────────────────────────

class Person
  include Greetable
  include Comparable

  attr_accessor :name, :age

  def initialize(name, age)
    @name = name
    @age  = age
  end

  def <=>(other)
    age <=> other.age
  end

  def adult?
    age >= 18
  end

  def to_s
    "#{name} (#{age})"
  end
end

# ── Pattern matching (Ruby 3+) ────────────────────────────────────────────────

def describe_value(val)
  case val
  in Integer => n if n.negative?
    "negative integer: #{n}"
  in Integer => n
    "positive integer: #{n}"
  in String => s if s.empty?
    "empty string"
  in String => s
    "string of length #{s.length}: #{s.inspect}"
  in [Integer, *rest]
    "array starting with integer, #{rest.length} more elements"
  in { name: String => name, age: (18..) => age }
    "adult named #{name}, age #{age}"
  in nil
    "nil"
  else
    "unknown: #{val.class}"
  end
end

# ── Enumerator & lazy chains ──────────────────────────────────────────────────

def lazy_fibonacci
  Enumerator.new do |y|
    a, b = 0, 1
    loop do
      y << a
      a, b = b, a + b
    end
  end.lazy
end

# ── Entry point ───────────────────────────────────────────────────────────────

if __FILE__ == $PROGRAM_NAME
  cfg = Config.new("localhost")
    .set(:theme, "dark")
    .set(:lang, "ruby")

  puts cfg
  puts "Theme: #{cfg.get(:theme, default: "default")}"

  people = [
    Person.new("Alice", 30),
    Person.new("Bob", 17),
    Person.new("Carol", 25),
  ]

  adults = people.select(&:adult?).sort
  puts "\nAdults (sorted by age):"
  adults.each { |p| puts "  #{p.greet}" }

  puts "\nFirst 10 fibonacci numbers:"
  (0...10).each { |i| puts "  fib(#{i}) = #{Math.fibonacci(i)}" }

  puts "\nPattern matching examples:"
  [-5, 42, "", "hello", [1, 2, 3], { name: "Dave", age: 20 }, nil].each do |v|
    puts "  #{describe_value(v)}"
  end

  puts "\nFirst 10 fibonacci (lazy enumerator):"
  puts lazy_fibonacci.first(10).inspect

  puts "\nPrimes up to 50: #{Math.primes_up_to(50).inspect}"
end
