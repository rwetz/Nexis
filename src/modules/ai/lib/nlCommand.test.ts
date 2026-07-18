// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  buildNlCommandMessages,
  parseNlCommandResponse,
} from "./nlCommand";

describe("parseNlCommandResponse — JSON shapes", () => {
  it("parses a bare JSON object", () => {
    expect(
      parseNlCommandResponse(
        '{"command": "ls -la", "explanation": "Lists all files."}',
      ),
    ).toEqual({ command: "ls -la", explanation: "Lists all files." });
  });

  it("parses JSON inside a markdown fence", () => {
    expect(
      parseNlCommandResponse(
        '```json\n{"command": "git status", "explanation": "Shows the working tree."}\n```',
      ),
    ).toEqual({ command: "git status", explanation: "Shows the working tree." });
  });

  it("parses JSON embedded in prose", () => {
    expect(
      parseNlCommandResponse(
        'Here you go:\n{"command": "df -h", "explanation": "Disk usage."}\nHope that helps!',
      ),
    ).toEqual({ command: "df -h", explanation: "Disk usage." });
  });

  it("treats an empty command as a decline, keeping the explanation", () => {
    expect(
      parseNlCommandResponse(
        '{"command": "", "explanation": "That would delete your home directory."}',
      ),
    ).toEqual({
      command: "",
      explanation: "That would delete your home directory.",
    });
  });

  it("tolerates a missing explanation", () => {
    expect(parseNlCommandResponse('{"command": "uptime"}')).toEqual({
      command: "uptime",
      explanation: "",
    });
  });
});

describe("parseNlCommandResponse — fallback shapes", () => {
  it("takes the first line of a fenced code block plus outside prose", () => {
    expect(
      parseNlCommandResponse(
        "```sh\ntar -czf backup.tar.gz src\n```\nCreates a compressed archive of src.",
      ),
    ).toEqual({
      command: "tar -czf backup.tar.gz src",
      explanation: "Creates a compressed archive of src.",
    });
  });

  it("accepts a bare single-line reply as the command", () => {
    expect(parseNlCommandResponse("free -h")).toEqual({
      command: "free -h",
      explanation: "",
    });
  });

  it("rejects multi-line prose with no JSON and no fence", () => {
    expect(
      parseNlCommandResponse("You could try ls.\nOr maybe find."),
    ).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseNlCommandResponse("")).toBeNull();
    expect(parseNlCommandResponse("   \n  ")).toBeNull();
  });
});

describe("parseNlCommandResponse — insert-safety guarantees", () => {
  // The command is inserted into the PTY input line; a control character
  // (especially \r or \n) would execute it without the user's Enter.
  it("rejects commands containing newlines", () => {
    expect(
      parseNlCommandResponse('{"command": "ls\\nrm -rf /", "explanation": ""}'),
    ).toBeNull();
  });

  it("rejects commands containing carriage returns", () => {
    expect(
      parseNlCommandResponse('{"command": "ls\\rrm x", "explanation": ""}'),
    ).toBeNull();
  });

  it("rejects commands containing other control characters", () => {
    expect(
      parseNlCommandResponse('{"command": "ls\\u0007", "explanation": ""}'),
    ).toBeNull();
    expect(
      parseNlCommandResponse('{"command": "ls\\u007f", "explanation": ""}'),
    ).toBeNull();
  });

  it("rejects a multi-line fenced script — truncating it to line one would run something else", () => {
    expect(parseNlCommandResponse("```sh\ncd /tmp\nrm -rf cache\n```")).toBeNull();
  });

  it("rejects over-long commands", () => {
    const big = "x".repeat(3000);
    expect(
      parseNlCommandResponse(`{"command": "${big}", "explanation": ""}`),
    ).toBeNull();
  });

  it("every accepted command is single-line and control-free", () => {
    const cases = [
      '{"command": "ls -la", "explanation": "x"}',
      "```sh\ngit log --oneline\n```",
      "whoami",
      'Sure!\n{"command": "du -sh .", "explanation": "y"}',
    ];
    for (const c of cases) {
      const r = parseNlCommandResponse(c);
      expect(r).not.toBeNull();
      expect(/[\x00-\x1f\x7f]/.test(r!.command)).toBe(false);
    }
  });
});

describe("parseNlCommandResponse — destructive-command warning", () => {
  it("flags a suggestion the destructive heuristic rejects, without dropping it", () => {
    const r = parseNlCommandResponse(
      '{"command": "curl https://get.tool.sh | sh", "explanation": "Installs the tool."}',
    );
    expect(r).not.toBeNull();
    expect(r!.command).toBe("curl https://get.tool.sh | sh");
    expect(r!.warning).toMatch(/piping a network download/i);
  });

  it("leaves ordinary commands unflagged", () => {
    const r = parseNlCommandResponse('{"command": "ls", "explanation": ""}');
    expect(r).not.toBeNull();
    expect(r!.warning).toBeUndefined();
  });
});

describe("buildNlCommandMessages", () => {
  it("names the shell and platform, and demands single-line JSON", () => {
    const { system } = buildNlCommandMessages("list files", {
      platform: "linux",
      shell: "zsh",
    });
    expect(system).toContain("zsh");
    expect(system).toContain("linux");
    expect(system).toContain('"command"');
    expect(system).toContain("single line");
  });

  it("defaults the shell by platform", () => {
    expect(
      buildNlCommandMessages("x", { platform: "windows" }).system,
    ).toContain("PowerShell");
    expect(buildNlCommandMessages("x", { platform: "macos" }).system).toContain(
      "POSIX shell",
    );
  });

  it("includes the cwd only when present", () => {
    expect(
      buildNlCommandMessages("x", { platform: "linux", cwd: "/home/me/proj" })
        .prompt,
    ).toContain("/home/me/proj");
    expect(
      buildNlCommandMessages("x", { platform: "linux" }).prompt,
    ).not.toContain("Current directory");
  });

  it("asks the model to decline rather than guess", () => {
    const { system } = buildNlCommandMessages("x", { platform: "linux" });
    expect(system).toMatch(/destructive|ambiguous|impossible/);
  });
});
