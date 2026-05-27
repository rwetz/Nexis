export type BuildTool = {
  id: string;
  name: string;
  command: string;
  detectFiles: string[];
};

export const BUILD_TOOLS: BuildTool[] = [
  { id: "pnpm", name: "pnpm", command: "pnpm build", detectFiles: ["package.json"] },
  { id: "cargo", name: "Cargo", command: "cargo build --release", detectFiles: ["Cargo.toml"] },
  { id: "make", name: "Make", command: "make", detectFiles: ["Makefile", "makefile"] },
  { id: "gradle", name: "Gradle", command: "./gradlew build", detectFiles: ["build.gradle", "build.gradle.kts"] },
  { id: "maven", name: "Maven", command: "mvn package", detectFiles: ["pom.xml"] },
  { id: "cmake", name: "CMake", command: "cmake --build .", detectFiles: ["CMakeLists.txt"] },
  { id: "go", name: "Go", command: "go build ./...", detectFiles: ["go.mod"] },
  { id: "python", name: "Python", command: "python -m build", detectFiles: ["pyproject.toml"] },
];

export type BuildStatus = "idle" | "running" | "success" | "failed" | "error";

export type BuildResult = {
  tool: BuildTool;
  status: BuildStatus;
  output: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
};
