// Test React JSX file — Nexis editor playground
// Exercises: hooks, context, memo, portals, error boundaries, render props

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

// ── Theme context ─────────────────────────────────────────────────────────────

const ThemeContext = createContext({ mode: "light", toggle: () => {} });

function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() =>
    typeof localStorage !== "undefined"
      ? (localStorage.getItem("theme") ?? "light")
      : "light"
  );

  const toggle = useCallback(() => {
    setMode((m) => {
      const next = m === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);

  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={mode}>{children}</div>
    </ThemeContext.Provider>
  );
}

function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// ── Counter with useReducer ───────────────────────────────────────────────────

const counterReducer = (state, action) => {
  switch (action.type) {
    case "increment": return { ...state, count: state.count + (action.by ?? 1) };
    case "decrement": return { ...state, count: state.count - (action.by ?? 1) };
    case "reset":     return { ...state, count: action.initial ?? 0 };
    default: throw new Error(`Unknown action: ${action.type}`);
  }
};

function Counter({ initial = 0 }) {
  const [state, dispatch] = useReducer(counterReducer, { count: initial });
  const { mode } = useTheme();

  return (
    <div className={`counter counter--${mode}`}>
      <button onClick={() => dispatch({ type: "decrement" })}>−</button>
      <span className="count">{state.count}</span>
      <button onClick={() => dispatch({ type: "increment" })}>+</button>
      <button onClick={() => dispatch({ type: "reset", initial })}>Reset</button>
    </div>
  );
}

// ── Custom hooks ──────────────────────────────────────────────────────────────

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function useLocalStorage(key, initialValue) {
  const [stored, setStored] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value) => {
      const toStore = value instanceof Function ? value(stored) : value;
      setStored(toStore);
      try {
        window.localStorage.setItem(key, JSON.stringify(toStore));
      } catch {
        // ignore write errors
      }
    },
    [key, stored]
  );

  return [stored, setValue];
}

function useIntersectionObserver(ref, options = {}) {
  const [entry, setEntry] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([e]) => setEntry(e),
      options
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, options]);
  return entry;
}

// ── Search box with debounce ──────────────────────────────────────────────────

const SearchBox = React.memo(function SearchBox({ onSearch }) {
  const [value, setValue] = useState("");
  const debounced = useDebounce(value, 400);

  useEffect(() => {
    onSearch(debounced);
  }, [debounced, onSearch]);

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search…"
      className="search-box"
    />
  );
});

// ── Error boundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="error-boundary">
            <strong>Something went wrong</strong>
            <pre>{this.state.error?.message}</pre>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ── Modal via Portal ──────────────────────────────────────────────────────────

function Modal({ isOpen, onClose, title, children }) {
  const elRef = useRef(null);

  if (!elRef.current) {
    elRef.current = document.createElement("div");
    elRef.current.id = "modal-root";
  }

  useEffect(() => {
    document.body.appendChild(elRef.current);
    return () => document.body.removeChild(elRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    elRef.current
  );
}

// ── Render prop / compound component ─────────────────────────────────────────

function Accordion({ children }) {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = useCallback((index) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className="accordion">
      {React.Children.map(children, (child, index) =>
        React.cloneElement(child, {
          isOpen: openIndex === index,
          onToggle: () => toggle(index),
          index,
        })
      )}
    </div>
  );
}

Accordion.Item = function AccordionItem({ title, children, isOpen, onToggle }) {
  const bodyRef = useRef(null);

  return (
    <div className={`accordion-item ${isOpen ? "open" : ""}`}>
      <button className="accordion-trigger" onClick={onToggle} aria-expanded={isOpen}>
        {title}
        <span className="chevron">{isOpen ? "▲" : "▼"}</span>
      </button>
      <div
        ref={bodyRef}
        className="accordion-body"
        style={{ maxHeight: isOpen ? bodyRef.current?.scrollHeight : 0 }}
      >
        {children}
      </div>
    </div>
  );
};

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [notes, setNotes] = useLocalStorage("nexis-notes", []);

  const filteredNotes = useMemo(
    () => notes.filter((n) => n.toLowerCase().includes(query.toLowerCase())),
    [notes, query]
  );

  const addNote = () => setNotes((prev) => [...prev, `Note ${prev.length + 1}`]);

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <main className="app">
          <h1>Nexis JSX Playground</h1>
          <Counter initial={5} />

          <SearchBox onSearch={setQuery} />

          <ul>
            {filteredNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>

          <button onClick={addNote}>Add note</button>
          <button onClick={() => setModalOpen(true)}>Open modal</button>

          <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Test Modal">
            <p>This is rendered in a Portal.</p>
            <Counter />
          </Modal>

          <Accordion>
            <Accordion.Item title="Section one">
              <p>Content for section one</p>
            </Accordion.Item>
            <Accordion.Item title="Section two">
              <p>Content for section two</p>
            </Accordion.Item>
            <Accordion.Item title="Section three">
              <p>Content for section three</p>
            </Accordion.Item>
          </Accordion>
        </main>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
