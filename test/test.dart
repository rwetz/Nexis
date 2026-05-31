/// Test Dart file — Nexis editor playground
/// Exercises: null safety, sealed classes, mixins, extensions, async, streams,
///            isolates, generics, pattern matching, records.

import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

// ── Sealed classes (Dart 3+) ──────────────────────────────────────────────────

sealed class Result<T> {
  const Result();
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;

  @override
  String toString() => 'Ok($value)';
}

final class Err<T> extends Result<T> {
  const Err(this.error, [this.stackTrace]);
  final Object error;
  final StackTrace? stackTrace;

  @override
  String toString() => 'Err($error)';
}

extension ResultExtension<T> on Result<T> {
  T get unwrap => switch (this) {
    Ok(:final value) => value,
    Err(:final error) => throw error,
  };

  T getOrElse(T defaultValue) => switch (this) {
    Ok(:final value) => value,
    Err() => defaultValue,
  };

  Result<U> map<U>(U Function(T) f) => switch (this) {
    Ok(:final value) => Ok(f(value)),
    Err(:final error, :final stackTrace) => Err(error, stackTrace),
  };

  bool get isOk => this is Ok<T>;
}

// ── Records (Dart 3+) ─────────────────────────────────────────────────────────

typedef Point = ({double x, double y});
typedef Rect  = ({Point topLeft, double width, double height});
typedef Color = ({int r, int g, int b, double a});

extension PointExtension on Point {
  double get magnitude => math.sqrt(x * x + y * y);
  double distanceTo(Point other) =>
      math.sqrt(math.pow(x - other.x, 2) + math.pow(y - other.y, 2));
  Point operator +(Point other) => (x: x + other.x, y: y + other.y);
}

// ── Mixins ────────────────────────────────────────────────────────────────────

mixin Serialisable {
  Map<String, dynamic> toJson();

  String toJsonString() => jsonEncode(toJson());
}

mixin Comparable2<T> {
  int compareTo(T other);
  bool operator <(T other)  => compareTo(other) < 0;
  bool operator >(T other)  => compareTo(other) > 0;
  bool operator <=(T other) => compareTo(other) <= 0;
  bool operator >=(T other) => compareTo(other) >= 0;
}

mixin Loggable {
  String get logTag => runtimeType.toString();

  void log(String message) => print('[$logTag] $message');
  void logError(String message, [Object? error]) =>
      print('[$logTag] ERROR: $message${error != null ? " — $error" : ""}');
}

// ── Class hierarchy ───────────────────────────────────────────────────────────

abstract class Entity with Serialisable, Loggable {
  final String id;
  final DateTime createdAt;

  Entity({required this.id}) : createdAt = DateTime.now();

  @override
  Map<String, dynamic> toJson() => {
    'id': id,
    'createdAt': createdAt.toIso8601String(),
  };
}

class User extends Entity with Comparable2<User> {
  final String name;
  final String email;
  final UserRole role;
  bool isActive;

  User({
    required super.id,
    required this.name,
    required this.email,
    this.role = UserRole.member,
    this.isActive = true,
  });

  bool get isAdmin => role == UserRole.admin;

  User copyWith({
    String? name,
    String? email,
    UserRole? role,
    bool? isActive,
  }) => User(
    id: id,
    name: name ?? this.name,
    email: email ?? this.email,
    role: role ?? this.role,
    isActive: isActive ?? this.isActive,
  );

  @override
  int compareTo(User other) => name.compareTo(other.name);

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'name': name,
    'email': email,
    'role': role.name,
    'isActive': isActive,
  };

  @override
  String toString() => 'User{id: $id, name: $name, role: ${role.name}}';
}

enum UserRole { admin, member, viewer }

// ── Generics ──────────────────────────────────────────────────────────────────

class Stack<T> {
  final List<T> _data = [];

  void push(T item) => _data.add(item);

  T pop() {
    if (_data.isEmpty) throw StateError('Stack is empty');
    return _data.removeLast();
  }

  T get peek {
    if (_data.isEmpty) throw StateError('Stack is empty');
    return _data.last;
  }

  bool get isEmpty => _data.isEmpty;
  int  get length  => _data.length;

  @override
  String toString() => 'Stack($_data)';
}

class Cache<K, V> {
  final int maxSize;
  final Map<K, V> _store  = {};
  final List<K>   _order  = [];   // LRU order

  Cache({this.maxSize = 100});

  V? get(K key) {
    if (!_store.containsKey(key)) return null;
    _order
      ..remove(key)
      ..add(key);
    return _store[key];
  }

  void put(K key, V value) {
    if (_store.containsKey(key)) {
      _order.remove(key);
    } else if (_store.length >= maxSize) {
      final evict = _order.removeAt(0);
      _store.remove(evict);
    }
    _store[key] = value;
    _order.add(key);
  }

  bool containsKey(K key) => _store.containsKey(key);
  int  get size           => _store.length;
}

// ── Extensions ────────────────────────────────────────────────────────────────

extension StringExtensions on String {
  String toTitleCase() => split(' ')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
      .join(' ');

  String truncate(int max, {String ellipsis = '…'}) =>
      length <= max ? this : '${substring(0, max - ellipsis.length)}$ellipsis';

  bool get isValidEmail => RegExp(r'^[^@]+@[^@]+\.[^@]+$').hasMatch(this);
}

extension ListExtensions<T> on List<T> {
  List<List<T>> chunked(int size) {
    final result = <List<T>>[];
    for (var i = 0; i < length; i += size) {
      result.add(sublist(i, math.min(i + size, length)));
    }
    return result;
  }

  T? firstWhereOrNull(bool Function(T) test) {
    for (final element in this) {
      if (test(element)) return element;
    }
    return null;
  }
}

extension IntExtensions on int {
  bool get isEven    => this % 2 == 0;
  bool get isPrime {
    if (this < 2) return false;
    for (var i = 2; i <= math.sqrt(this.toDouble()).toInt(); i++) {
      if (this % i == 0) return false;
    }
    return true;
  }
}

// ── Pattern matching ──────────────────────────────────────────────────────────

String describeResult<T>(Result<T> result) => switch (result) {
  Ok(value: final v) => 'success: $v',
  Err(error: final e) => 'failure: $e',
};

String describeShape(Object shape) => switch (shape) {
  ({'type': 'circle', 'r': double r}) => 'circle r=$r, area=${(math.pi * r * r).toStringAsFixed(2)}',
  ({'type': 'rect', 'w': double w, 'h': double h}) => 'rect ${w}x$h, area=${(w * h).toStringAsFixed(2)}',
  [int x, int y] => 'point ($x, $y)',
  _ => 'unknown: ${shape.runtimeType}',
};

// ── Async / Streams ───────────────────────────────────────────────────────────

Stream<int> fibonacci() async* {
  var a = 0;
  var b = 1;
  while (true) {
    yield a;
    final next = a + b;
    a = b;
    b = next;
  }
}

Stream<T> rateLimit<T>(Stream<T> input, Duration interval) async* {
  await for (final item in input) {
    yield item;
    await Future.delayed(interval);
  }
}

Future<Result<T>> safely<T>(Future<T> Function() fn) async {
  try {
    return Ok(await fn());
  } catch (e, st) {
    return Err(e, st);
  }
}

Future<List<Result<T>>> allSettled<T>(List<Future<T>> futures) =>
    Future.wait(futures.map((f) => safely(() => f)));

// ── Entry point ───────────────────────────────────────────────────────────────

Future<void> main() async {
  print('── Records ──');
  final p1 = (x: 3.0, y: 4.0);
  final p2 = (x: 6.0, y: 8.0);
  print('  p1=$p1  magnitude=${p1.magnitude.toStringAsFixed(2)}');
  print('  dist(p1, p2)=${p1.distanceTo(p2).toStringAsFixed(2)}');
  print('  p1+p2=${p1 + p2}');

  print('\n── Sealed Result ──');
  final results = [
    Ok(42),
    Err<int>('network error'),
    Ok('hello'),
  ];
  for (final r in results) {
    print('  ${describeResult(r)}');
  }

  print('\n── Users ──');
  final users = [
    User(id: '1', name: 'Alice', email: 'alice@nexis.dev', role: UserRole.admin),
    User(id: '2', name: 'Bob',   email: 'bob@nexis.dev'),
    User(id: '3', name: 'Carol', email: 'carol@nexis.dev', role: UserRole.viewer),
  ];
  users.sort();   // uses Comparable2 mixin
  for (final u in users) {
    print('  ${u.name} (${u.role.name}) — ${u.toJsonString()}');
  }

  print('\n── Generic Stack ──');
  final stack = Stack<String>();
  for (final s in ['alpha', 'beta', 'gamma']) {
    stack.push(s);
  }
  while (!stack.isEmpty) {
    print('  pop: ${stack.pop()}');
  }

  print('\n── Extensions ──');
  print('  "${"hello world dart".toTitleCase()}"');
  print('  "${("A very long string that needs to be truncated").truncate(20)}"');
  print('  17 is prime: ${17.isPrime}');
  print('  [1..10] chunked(3): ${[1,2,3,4,5,6,7,8,9,10].chunked(3)}');

  print('\n── Pattern matching (shapes) ──');
  for (final shape in [
    {'type': 'circle', 'r': 5.0},
    {'type': 'rect', 'w': 4.0, 'h': 6.0},
    [3, 4],
    'unknown',
  ]) {
    print('  ${describeShape(shape)}');
  }

  print('\n── Async fibonacci stream ──');
  final fibs = await fibonacci().take(12).toList();
  print('  $fibs');

  print('\n── allSettled ──');
  final settled = await allSettled([
    Future.value(1),
    Future.error('oops'),
    Future.delayed(const Duration(milliseconds: 10), () => 42),
  ]);
  for (final r in settled) {
    print('  ${describeResult(r)}');
  }

  print('\nDone.');
}
