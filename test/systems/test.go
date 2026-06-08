// Test Go file — Nexis editor playground
// Exercises: interfaces, generics, goroutines, channels, errors, embedding,
//            io, slog, iter (range-over-func), atomics, functional options

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ── Custom errors ─────────────────────────────────────────────────────────────

type NotFoundError struct {
	Resource string
	ID       string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("%s %q not found", e.Resource, e.ID)
}

var ErrUnauthorized = errors.New("unauthorized")

func withContext(err error, msg string) error {
	return fmt.Errorf("%s: %w", msg, err)
}

// ── Generics ──────────────────────────────────────────────────────────────────

type Ordered interface {
	~int | ~int8 | ~int16 | ~int32 | ~int64 |
		~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 |
		~float32 | ~float64 | ~string
}

func MapSlice[T, U any](s []T, f func(T) U) []U {
	result := make([]U, len(s))
	for i, v := range s {
		result[i] = f(v)
	}
	return result
}

func FilterSlice[T any](s []T, f func(T) bool) []T {
	var result []T
	for _, v := range s {
		if f(v) {
			result = append(result, v)
		}
	}
	return result
}

func Reduce[T, U any](s []T, init U, f func(U, T) U) U {
	acc := init
	for _, v := range s {
		acc = f(acc, v)
	}
	return acc
}

// Generic thread-safe stack
type Stack[T any] struct {
	data []T
	mu   sync.Mutex
}

func (s *Stack[T]) Push(v T) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data = append(s.data, v)
}

func (s *Stack[T]) Pop() (T, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.data) == 0 {
		var zero T
		return zero, false
	}
	n := len(s.data) - 1
	v := s.data[n]
	s.data = s.data[:n]
	return v, true
}

func (s *Stack[T]) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.data)
}

// ── Interfaces & embedding ────────────────────────────────────────────────────

type Stringer interface {
	String() string
}

type Validator interface {
	Validate() error
}

type Entity interface {
	Stringer
	Validator
	ID() string
}

type Base struct {
	id        string
	createdAt time.Time
}

func (b *Base) ID() string { return b.id }

type User struct {
	Base
	Name  string
	Email string
	Role  string
}

func NewUser(name, email, role string) *User {
	return &User{
		Base:  Base{id: fmt.Sprintf("u_%d", time.Now().UnixNano()), createdAt: time.Now()},
		Name:  name,
		Email: email,
		Role:  role,
	}
}

func (u *User) String() string {
	return fmt.Sprintf("User{id=%s, name=%q, email=%q}", u.id, u.Name, u.Email)
}

func (u *User) Validate() error {
	if u.Name == "" {
		return fmt.Errorf("name is required")
	}
	if !strings.Contains(u.Email, "@") {
		return fmt.Errorf("invalid email: %q", u.Email)
	}
	return nil
}

// ── Functional options ────────────────────────────────────────────────────────

type ServerConfig struct {
	host     string
	port     int
	timeout  time.Duration
	maxConns int
	tls      bool
}

type ServerOption func(*ServerConfig)

func WithHost(host string) ServerOption    { return func(c *ServerConfig) { c.host = host } }
func WithPort(port int) ServerOption       { return func(c *ServerConfig) { c.port = port } }
func WithTimeout(d time.Duration) ServerOption { return func(c *ServerConfig) { c.timeout = d } }
func WithTLS() ServerOption                { return func(c *ServerConfig) { c.tls = true } }

func NewServerConfig(opts ...ServerOption) *ServerConfig {
	cfg := &ServerConfig{host: "0.0.0.0", port: 8080, timeout: 30 * time.Second, maxConns: 1000}
	for _, o := range opts {
		o(cfg)
	}
	return cfg
}

// ── Goroutines / channels ─────────────────────────────────────────────────────

func generate(ctx context.Context, nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, n := range nums {
			select {
			case out <- n:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

func squareChan(ctx context.Context, in <-chan int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for {
			select {
			case v, ok := <-in:
				if !ok {
					return
				}
				select {
				case out <- v * v:
				case <-ctx.Done():
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

// ── Atomic counter ────────────────────────────────────────────────────────────

type Counter struct{ n atomic.Int64 }

func (c *Counter) Inc()        { c.n.Add(1) }
func (c *Counter) Add(d int64) { c.n.Add(d) }
func (c *Counter) Load() int64 { return c.n.Load() }

// ── io.Writer custom type: ROT13 ──────────────────────────────────────────────

type rot13Writer struct{ w io.Writer }

func NewROT13Writer(w io.Writer) io.Writer { return &rot13Writer{w} }

func (r *rot13Writer) Write(p []byte) (int, error) {
	buf := make([]byte, len(p))
	for i, b := range p {
		switch {
		case b >= 'A' && b <= 'Z':
			buf[i] = 'A' + (b-'A'+13)%26
		case b >= 'a' && b <= 'z':
			buf[i] = 'a' + (b-'a'+13)%26
		default:
			buf[i] = b
		}
	}
	return r.w.Write(buf)
}

// ── Fibonacci generator (iterator style) ─────────────────────────────────────

func fibSequence(limit int) []int {
	var result []int
	a, b := 0, 1
	for a <= limit {
		result = append(result, a)
		a, b = b, a+b
	}
	return result
}

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	log.Info("nexis go playground", "version", "1.3.0")

	// Generics
	nums := []int{5, 1, 8, 3, 9, 2, 7, 4, 6}
	squared := MapSlice(nums, func(n int) int { return n * n })
	evens := FilterSlice(nums, func(n int) bool { return n%2 == 0 })
	sum := Reduce(nums, 0, func(acc, n int) int { return acc + n })
	log.Info("generics", "squared", squared, "evens", evens, "sum", sum)

	sorted := slices.Sorted(slices.Values(nums))
	log.Info("sorted", "values", sorted)

	// Stack
	st := &Stack[string]{}
	for _, s := range []string{"alpha", "beta", "gamma"} {
		st.Push(s)
	}
	for st.Len() > 0 {
		v, _ := st.Pop()
		fmt.Printf("  popped: %s\n", v)
	}

	// User & interface satisfaction
	u := NewUser("Alice", "alice@nexis.dev", "admin")
	if err := u.Validate(); err != nil {
		log.Error("invalid user", "err", err)
	} else {
		log.Info("user ok", "str", u.String())
	}

	// Functional options
	cfg := NewServerConfig(
		WithHost("localhost"),
		WithPort(9090),
		WithTimeout(10*time.Second),
		WithTLS(),
	)
	log.Info("server", "host", cfg.host, "port", cfg.port, "tls", cfg.tls)

	// Goroutine pipeline
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ch := generate(ctx, 1, 2, 3, 4, 5)
	sq := squareChan(ctx, ch)
	fmt.Print("pipeline squares: ")
	for v := range sq {
		fmt.Printf("%d ", v)
	}
	fmt.Println()

	// ROT13
	rot := NewROT13Writer(os.Stdout)
	fmt.Fprintln(rot, "Hello, World!") // Uryyb, Jbeyq!

	// Fibonacci
	fibs := fibSequence(100)
	log.Info("fibonacci", "values", fibs)

	// Error wrapping
	err := withContext(&NotFoundError{Resource: "project", ID: "abc123"}, "loading workspace")
	var nfe *NotFoundError
	if errors.As(err, &nfe) {
		log.Warn("resource missing", "resource", nfe.Resource, "id", nfe.ID)
	}

	// Atomic counter from multiple goroutines
	var cnt Counter
	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cnt.Inc()
		}()
	}
	wg.Wait()
	log.Info("counter", "value", cnt.Load())

	log.Info("done")
}
