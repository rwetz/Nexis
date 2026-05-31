// Test Scala 3 file — Nexis editor playground
// Exercises: ADTs, type classes, given/using, opaque types, extension methods,
//            for-comprehensions, futures, pattern matching, macros

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}
import scala.annotation.{tailrec, targetName}
import scala.collection.immutable.LazyList

given ExecutionContext = ExecutionContext.global

// ── Opaque types ──────────────────────────────────────────────────────────────

object Types:
  opaque type UserId    = String
  opaque type ProjectId = String
  opaque type Email     = String

  object UserId:
    def apply(s: String): UserId = s
    extension (id: UserId) def value: String = id

  object ProjectId:
    def apply(s: String): ProjectId = s
    extension (id: ProjectId) def value: String = id

  object Email:
    def parse(s: String): Either[String, Email] =
      if s.contains("@") then Right(s)
      else Left(s"Invalid email: $s")

import Types.*

// ── Enums (ADTs) ──────────────────────────────────────────────────────────────

enum Status:
  case Idle, Loading
  case Success[A](value: A)
  case Failure(cause: Throwable)

  def isTerminal: Boolean = this match
    case Idle | Loading => false
    case _              => true

enum Shape:
  case Circle(radius: Double)
  case Rectangle(width: Double, height: Double)
  case Triangle(base: Double, height: Double)
  case Composite(shapes: List[Shape])

  def area: Double = this match
    case Circle(r)           => math.Pi * r * r
    case Rectangle(w, h)     => w * h
    case Triangle(b, h)      => 0.5 * b * h
    case Composite(ss)       => ss.map(_.area).sum

  def perimeter: Double = this match
    case Circle(r)           => 2 * math.Pi * r
    case Rectangle(w, h)     => 2 * (w + h)
    case Triangle(b, h)      => b + h + math.sqrt(b * b + h * h)
    case Composite(ss)       => ss.map(_.perimeter).sum

// ── Type class ────────────────────────────────────────────────────────────────

trait Serialise[A]:
  def serialise(a: A): String
  def deserialise(s: String): Either[String, A]

object Serialise:
  def apply[A](using s: Serialise[A]): Serialise[A] = s

  given Serialise[Int] with
    def serialise(a: Int)         = a.toString
    def deserialise(s: String)    = s.toIntOption.toRight(s"Not an int: $s")

  given Serialise[Boolean] with
    def serialise(a: Boolean)     = a.toString
    def deserialise(s: String)    = s match
      case "true"  => Right(true)
      case "false" => Right(false)
      case _       => Left(s"Not a bool: $s")

  given [A: Serialise]: Serialise[List[A]] with
    def serialise(as: List[A])    = as.map(summon[Serialise[A]].serialise).mkString("[", ",", "]")
    def deserialise(s: String)    = Right(Nil) // simplified

extension [A](a: A)(using s: Serialise[A])
  def serialised: String = s.serialise(a)

// ── Case classes & companions ─────────────────────────────────────────────────

case class User(
  id:    UserId,
  name:  String,
  email: Email,
  role:  String = "member"
):
  def isAdmin: Boolean = role == "admin"

  def withRole(r: String): User = copy(role = r)

object User:
  def create(name: String, rawEmail: String): Either[String, User] =
    Email.parse(rawEmail).map: email =>
      User(UserId(java.util.UUID.randomUUID().toString), name, email)

case class Project(
  id:      ProjectId,
  name:    String,
  ownerId: UserId,
  tags:    Set[String] = Set.empty
):
  def addTag(t: String): Project  = copy(tags = tags + t)
  def hasTag(t: String): Boolean  = tags.contains(t)

// ── Type class derivation (manual) ───────────────────────────────────────────

given Serialise[User] with
  def serialise(u: User): String =
    s"""{"id":"${u.id.value}","name":"${u.name}","role":"${u.role}"}"""
  def deserialise(s: String): Either[String, User] =
    Left("not implemented")

// ── Extension methods ─────────────────────────────────────────────────────────

extension (s: String)
  def toTitleCase: String =
    s.split("\\s+").map(w => w.capitalize).mkString(" ")

  def toCamelCase: String =
    s.split("[_\\-\\s]+").toList match
      case Nil         => ""
      case head :: tail => head.toLowerCase + tail.map(_.capitalize).mkString

  def truncate(n: Int, ellipsis: String = "…"): String =
    if s.length <= n then s else s.take(n - ellipsis.length) + ellipsis

extension (d: Double)
  @targetName("roundTo")
  def ~=(places: Int): Double =
    val factor = math.pow(10, places)
    math.round(d * factor) / factor

// ── Lazy & infinite sequences ─────────────────────────────────────────────────

def fibonacci: LazyList[BigInt] =
  def go(a: BigInt, b: BigInt): LazyList[BigInt] = a #:: go(b, a + b)
  go(0, 1)

def primes: LazyList[Int] =
  def sieve(s: LazyList[Int]): LazyList[Int] =
    s.head #:: sieve(s.tail.filter(_ % s.head != 0))
  sieve(LazyList.from(2))

// ── Tail-recursive functions ──────────────────────────────────────────────────

@tailrec
def gcd(a: Long, b: Long): Long =
  if b == 0 then a else gcd(b, a % b)

def lcm(a: Long, b: Long): Long = a / gcd(a, b) * b

@tailrec
def foldLeft[A, B](list: List[A], acc: B)(f: (B, A) => B): B =
  list match
    case Nil     => acc
    case h :: t  => foldLeft(t, f(acc, h))(f)

// ── For-comprehensions ────────────────────────────────────────────────────────

def pythagoreanTriples(limit: Int): List[(Int, Int, Int)] =
  for
    c <- (1 to limit).toList
    b <- 1 to c
    a <- 1 to b
    if a * a + b * b == c * c
  yield (a, b, c)

// ── Futures ───────────────────────────────────────────────────────────────────

def fetchUser(id: UserId): Future[User] =
  Future:
    Thread.sleep(50) // simulate I/O
    User(id, "Alice", "alice@nexis.dev".asInstanceOf[Email], "admin")

def fetchProject(id: ProjectId): Future[Project] =
  Future:
    Thread.sleep(30)
    Project(id, "nexis", "u_1".asInstanceOf[UserId], Set("ide", "rust"))

def loadWorkspace(userId: UserId, projectId: ProjectId): Future[String] =
  for
    user    <- fetchUser(userId)
    project <- fetchProject(projectId)
    if project.ownerId == userId || user.isAdmin
  yield s"Workspace: ${project.name} owned by ${user.name}"

// ── Partial functions ─────────────────────────────────────────────────────────

val describeInt: PartialFunction[Int, String] =
  case 0           => "zero"
  case n if n < 0  => s"negative: $n"
  case n if n > 0  => s"positive: $n"

val safeHead: PartialFunction[List[_], Any] = { case h :: _ => h }

// ── Context functions ─────────────────────────────────────────────────────────

trait Logger:
  def log(msg: String): Unit

def withLogging[A](logger: Logger)(body: Logger ?=> A): A =
  given Logger = logger
  body

def doWork()(using Logger): String =
  summon[Logger].log("doing work")
  "result"

// ── Inline / transparent ──────────────────────────────────────────────────────

inline def assertInline(condition: Boolean, msg: => String): Unit =
  if !condition then throw new AssertionError(msg)

transparent inline def typeOf[A]: String =
  inline scala.compiletime.erasedValue[A] match
    case _: Int    => "Int"
    case _: String => "String"
    case _: Double => "Double"
    case _         => "unknown"

// ── Main ──────────────────────────────────────────────────────────────────────

@main def run(): Unit =
  println("── Opaque types & case classes ──")
  User.create("Alice", "alice@nexis.dev") match
    case Right(u)  => println(s"  Created: ${u.serialised}")
    case Left(err) => println(s"  Error: $err")

  println("\n── Shape ADT ──")
  val shapes = List(
    Shape.Circle(5),
    Shape.Rectangle(4, 6),
    Shape.Triangle(3, 4),
    Shape.Composite(List(Shape.Circle(2), Shape.Rectangle(1, 3)))
  )
  shapes.foreach: s =>
    println(f"  ${s.toString.take(30)}%-35s area=${s.area ~= 2}  perim=${s.perimeter ~= 2}")

  println("\n── Extension methods ──")
  println(s"  ${"hello world scala".toTitleCase}")
  println(s"  ${"hello_world_scala".toCamelCase}")
  println(s"  ${"A very long string that needs truncating".truncate(20)}")

  println("\n── Fibonacci (lazy) ──")
  println(s"  ${fibonacci.take(12).toList}")

  println("\n── Primes ──")
  println(s"  ${primes.take(15).toList}")

  println("\n── Pythagorean triples up to 20 ──")
  pythagoreanTriples(20).foreach: (a, b, c) =>
    println(s"  ($a, $b, $c)")

  println("\n── GCD / LCM ──")
  println(s"  gcd(48, 18) = ${gcd(48, 18)}")
  println(s"  lcm(12, 18) = ${lcm(12, 18)}")

  println("\n── Futures ──")
  val uid = UserId("u_1")
  val pid = ProjectId("p_1")
  val result = loadWorkspace(uid, pid)
  result.onComplete:
    case Success(ws) => println(s"  $ws")
    case Failure(e)  => println(s"  Failed: ${e.getMessage}")
  Thread.sleep(200)

  println("\n── Context functions ──")
  val logger = new Logger { def log(msg: String) = println(s"  [log] $msg") }
  val r = withLogging(logger)(doWork())
  println(s"  result: $r")

  println("\nDone.")
