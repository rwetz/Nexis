// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Test React TSX file — Nexis editor playground
// Exercises: typed hooks, generics, discriminated unions, forwardRef, utility types

import React, {
  ComponentPropsWithoutRef,
  ElementType,
  FC,
  forwardRef,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// ── Polymorphic component ("as" prop) ─────────────────────────────────────────

type PolymorphicProps<C extends ElementType, P = object> = P &
  Omit<ComponentPropsWithoutRef<C>, keyof P> & { as?: C };

function Box<C extends ElementType = "div">({
  as,
  children,
  ...rest
}: PolymorphicProps<C, { children?: ReactNode }>): JSX.Element {
  const Component = as ?? "div";
  return <Component {...rest}>{children}</Component>;
}

// ── Discriminated union state ─────────────────────────────────────────────────

type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function useAsync<T>(fn: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ status: "idle" });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const run = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await fn();
      if (mountedRef.current) setState({ status: "success", data });
    } catch (e) {
      if (mountedRef.current)
        setState({ status: "error", error: e instanceof Error ? e : new Error(String(e)) });
    }
  }, [fn]);

  return { state, run };
}

function AsyncView<T>({
  state,
  render,
  renderError,
  renderLoading,
}: {
  state: AsyncState<T>;
  render: (data: T) => ReactNode;
  renderError?: (error: Error) => ReactNode;
  renderLoading?: () => ReactNode;
}) {
  switch (state.status) {
    case "idle":    return null;
    case "loading": return <>{renderLoading?.() ?? <span>Loading…</span>}</>;
    case "error":   return <>{renderError?.(state.error) ?? <span>Error: {state.error.message}</span>}</>;
    case "success": return <>{render(state.data)}</>;
  }
}

// ── Generic table ─────────────────────────────────────────────────────────────

type Column<T> = {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
  sortable?: boolean;
};

function DataTable<T extends { id: string | number }>({
  data,
  columns,
  onRowClick,
}: {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
}) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  const handleHeaderClick = (col: Column<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={String(col.key)}
              onClick={() => handleHeaderClick(col)}
              style={{ cursor: col.sortable ? "pointer" : "default" }}
            >
              {col.header}
              {col.sortable && sortKey === col.key && (sortDir === "asc" ? " ↑" : " ↓")}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.id} onClick={() => onRowClick?.(row)}>
            {columns.map((col) => (
              <td key={String(col.key)}>
                {col.render ? col.render(row[col.key], row) : String(row[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── forwardRef + useImperativeHandle ─────────────────────────────────────────

type InputHandle = {
  focus: () => void;
  clear: () => void;
  getValue: () => string;
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

const Input = forwardRef<InputHandle, InputProps>(function Input(
  { label, error, id: idProp, ...rest },
  ref
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => {
      if (inputRef.current) inputRef.current.value = "";
    },
    getValue: () => inputRef.current?.value ?? "",
  }));

  return (
    <div className={`field ${error ? "field--error" : ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input ref={inputRef} id={id} aria-describedby={error ? `${id}-error` : undefined} {...rest} />
      {error && <span id={`${id}-error`} role="alert" className="field-error">{error}</span>}
    </div>
  );
});

// ── Utility type gymnastics ───────────────────────────────────────────────────

type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

type Nullable<T> = { [K in keyof T]: T[K] | null };

type PickByValue<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K];
};

interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  admin: boolean;
}

type StringFields = PickByValue<User, string>;
// => { name: string; email: string }

type ReadonlyUser = DeepReadonly<User>;

// ── App ───────────────────────────────────────────────────────────────────────

const USERS: User[] = [
  { id: 1, name: "Alice",   email: "alice@example.com",   age: 30, admin: true  },
  { id: 2, name: "Bob",     email: "bob@example.com",     age: 24, admin: false },
  { id: 3, name: "Carol",   email: "carol@example.com",   age: 28, admin: false },
  { id: 4, name: "Dave",    email: "dave@example.com",    age: 35, admin: true  },
];

const USER_COLUMNS: Column<User>[] = [
  { key: "id",    header: "ID",    sortable: true },
  { key: "name",  header: "Name",  sortable: true },
  { key: "email", header: "Email" },
  { key: "age",   header: "Age",   sortable: true },
  {
    key: "admin",
    header: "Role",
    render: (v) => <span className={`badge badge--${v ? "admin" : "user"}`}>{v ? "Admin" : "User"}</span>,
  },
];

const App: FC = () => {
  const inputRef = useRef<InputHandle>(null);
  const [selected, setSelected] = useState<User | null>(null);

  const fakeFetch = useCallback(
    () => new Promise<User[]>((resolve) => setTimeout(() => resolve(USERS), 800)),
    []
  );
  const { state, run } = useAsync(fakeFetch);

  return (
    <div className="app">
      <h1>TSX Playground</h1>

      <Box as="section" className="section">
        <h2>Polymorphic Box</h2>
        <Box as="p">I am a paragraph.</Box>
        <Box as="a" href="#top">I am a link.</Box>
      </Box>

      <Box as="section" className="section">
        <h2>Input with forwardRef</h2>
        <Input ref={inputRef} label="Username" placeholder="Enter username" />
        <Input label="Email" type="email" error="Invalid email address" />
        <button onClick={() => inputRef.current?.focus()}>Focus input</button>
        <button onClick={() => inputRef.current?.clear()}>Clear</button>
      </Box>

      <Box as="section" className="section">
        <h2>Async Data</h2>
        <button onClick={run}>Load users</button>
        <AsyncView
          state={state}
          render={(users) => (
            <DataTable
              data={users}
              columns={USER_COLUMNS}
              onRowClick={setSelected}
            />
          )}
          renderLoading={() => <p>Loading users…</p>}
        />
        {selected && <p>Selected: {selected.name} ({selected.email})</p>}
      </Box>
    </div>
  );
};

export default App;
