// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { parseProtocolLine, parseProtocolLines } from "./protocol";

describe("parseProtocolLine", () => {
  it("parses a metric event", () => {
    const ev = parseProtocolLine(
      '{"ev":"metric","run":"r","step":3,"epoch":1,"name":"loss/train","value":0.5}',
    );
    expect(ev).toEqual({
      ev: "metric",
      run: "r",
      step: 3,
      epoch: 1,
      name: "loss/train",
      value: 0.5,
    });
  });

  it("parses run lifecycle events", () => {
    expect(
      parseProtocolLine('{"ev":"run.started","run":"r","totalEpochs":10}')?.ev,
    ).toBe("run.started");
    expect(
      parseProtocolLine('{"ev":"run.finished","run":"r","status":"ok"}')?.ev,
    ).toBe("run.finished");
  });

  it("returns null for invalid JSON, blanks, and non-objects", () => {
    expect(parseProtocolLine("")).toBeNull();
    expect(parseProtocolLine("   ")).toBeNull();
    expect(parseProtocolLine("not json {")).toBeNull();
    expect(parseProtocolLine('"just a string"')).toBeNull();
    expect(parseProtocolLine("42")).toBeNull();
    expect(parseProtocolLine("null")).toBeNull();
  });

  it("ignores unknown event types (forward compatibility)", () => {
    expect(
      parseProtocolLine('{"ev":"hologram","run":"r","data":123}'),
    ).toBeNull();
    expect(parseProtocolLine('{"run":"r"}')).toBeNull();
  });

  it("rejects malformed metric events instead of letting NaN into charts", () => {
    expect(
      parseProtocolLine('{"ev":"metric","run":"r","step":1,"name":"x"}'),
    ).toBeNull();
    expect(
      parseProtocolLine(
        '{"ev":"metric","run":"r","step":1,"name":"x","value":"high"}',
      ),
    ).toBeNull();
  });

  it("keeps unknown extra fields on known events", () => {
    const ev = parseProtocolLine(
      '{"ev":"epoch","run":"r","epoch":2,"of":10,"futureField":true}',
    );
    expect(ev).toMatchObject({ ev: "epoch", epoch: 2 });
  });
});

describe("parseProtocolLines", () => {
  it("filters unparseable lines and keeps order", () => {
    const events = parseProtocolLines([
      '{"ev":"run.started","run":"r"}',
      "garbage",
      '{"ev":"metric","run":"r","step":1,"name":"a","value":1}',
      '{"ev":"unknown-thing"}',
      '{"ev":"run.finished","run":"r","status":"ok"}',
    ]);
    expect(events.map((e) => e.ev)).toEqual([
      "run.started",
      "metric",
      "run.finished",
    ]);
  });
});
