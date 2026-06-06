// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export type TestFramework = {
  id: string;
  name: string;
  command: string;
  detectFiles: string[];
};

export const FRAMEWORKS: TestFramework[] = [
  {
    id: "vitest",
    name: "Vitest",
    command: "pnpm vitest run",
    detectFiles: ["vitest.config.ts", "vitest.config.js"],
  },
  {
    id: "jest",
    name: "Jest",
    command: "npx jest --no-coverage",
    detectFiles: ["jest.config.js", "jest.config.ts"],
  },
  {
    id: "cargo",
    name: "Cargo Test",
    command: "cargo test",
    detectFiles: ["Cargo.toml"],
  },
  {
    id: "pytest",
    name: "pytest",
    command: "python -m pytest",
    detectFiles: ["pytest.ini", "pyproject.toml", "setup.cfg"],
  },
  {
    id: "go-test",
    name: "Go Test",
    command: "go test ./...",
    detectFiles: ["go.mod"],
  },
  {
    id: "gradle",
    name: "Gradle Test",
    command: "./gradlew test",
    detectFiles: ["build.gradle", "build.gradle.kts"],
  },
];

export type TestStatus = "idle" | "running" | "passed" | "failed" | "error";

export type TestResult = {
  framework: TestFramework;
  status: TestStatus;
  output: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
};
