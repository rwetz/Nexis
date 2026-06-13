// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  collectSamples,
  latestArtifact,
  latestConfusionMatrix,
  parseProtocolLine,
  parseProtocolLines,
  parseServeLine,
  type MlEvent,
} from "./protocol";

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

describe("collectSamples", () => {
  // One epoch's worth of textgen events, in the order the engine emits
  // them: the val metric (carrying the epoch) precedes the sample, which
  // precedes the epoch boundary marker.
  const epochN = (n: number, text: string): MlEvent[] => [
    { ev: "metric", run: "r", step: n, epoch: n, name: "loss/val", value: 2 - n },
    { ev: "sample", run: "r", output: text },
    { ev: "epoch", run: "r", epoch: n, of: 10 },
  ];

  it("attaches each sample to the most recent epoch seen", () => {
    const events = [...epochN(1, "gibberish"), ...epochN(2, "less gibberish")];
    expect(collectSamples(events, 10)).toEqual([
      { epoch: 1, text: "gibberish" },
      { epoch: 2, text: "less gibberish" },
    ]);
  });

  it("coerces a missing/non-string output to a string and tolerates no epoch", () => {
    const events: MlEvent[] = [{ ev: "sample", run: "r", output: undefined }];
    expect(collectSamples(events, 10)).toEqual([{ epoch: null, text: "" }]);
  });

  it("caps at max by dropping the oldest", () => {
    const events: MlEvent[] = Array.from({ length: 5 }, (_, k) => ({
      ev: "sample" as const,
      run: "r",
      output: `s${k}`,
    }));
    const out = collectSamples(events, 3);
    expect(out.map((s) => s.text)).toEqual(["s2", "s3", "s4"]);
  });

  it("folds a new batch onto an existing base, seeded with the prior epoch", () => {
    const base = collectSamples(epochN(1, "first"), 10);
    // Next batch: the engine has already moved to epoch 2 (its metrics
    // carry epoch=2), so startEpoch only matters if a sample arrived
    // before any epoch-bearing event.
    const next = collectSamples(epochN(2, "second"), 10, base, 1);
    expect(next).toEqual([
      { epoch: 1, text: "first" },
      { epoch: 2, text: "second" },
    ]);
  });

  it("uses startEpoch for a sample with no preceding epoch info", () => {
    const events: MlEvent[] = [{ ev: "sample", run: "r", output: "early" }];
    expect(collectSamples(events, 10, [], 4)).toEqual([{ epoch: 4, text: "early" }]);
  });
});

describe("latestConfusionMatrix", () => {
  const cm = (epoch: number, path: string): MlEvent[] => [
    { ev: "metric", run: "r", step: epoch, epoch, name: "acc/val", value: 0.9 },
    { ev: "artifact", run: "r", kind: "confusion-matrix", path },
    { ev: "epoch", run: "r", epoch, of: 10 },
  ];

  it("returns the last confusion matrix, tagged with its epoch", () => {
    const events = [...cm(1, "/runs/x/artifacts/cm-epoch1.json"), ...cm(2, "/runs/x/artifacts/cm-epoch2.json")];
    expect(latestConfusionMatrix(events)).toEqual({
      path: "/runs/x/artifacts/cm-epoch2.json",
      epoch: 2,
    });
  });

  it("ignores other artifact kinds and returns null when none present", () => {
    const events: MlEvent[] = [
      { ev: "artifact", run: "r", kind: "image-grid", path: "/x/grid.png" },
      { ev: "metric", run: "r", step: 1, epoch: 1, name: "loss/train", value: 1 },
    ];
    expect(latestConfusionMatrix(events)).toBeNull();
  });

  it("falls back to startEpoch when the matrix precedes any epoch info", () => {
    const events: MlEvent[] = [
      { ev: "artifact", run: "r", kind: "confusion-matrix", path: "/x/cm.json" },
    ];
    expect(latestConfusionMatrix(events, 7)).toEqual({ path: "/x/cm.json", epoch: 7 });
  });

  it("latestArtifact selects by kind (e.g. image-grid)", () => {
    const events: MlEvent[] = [
      { ev: "metric", run: "r", step: 1, epoch: 2, name: "acc/val", value: 0.5 },
      { ev: "artifact", run: "r", kind: "confusion-matrix", path: "/x/cm.json" },
      { ev: "artifact", run: "r", kind: "image-grid", path: "/x/samples-epoch2.png" },
    ];
    expect(latestArtifact(events, "image-grid")).toEqual({
      path: "/x/samples-epoch2.png",
      epoch: 2,
    });
    expect(latestArtifact(events, "nope")).toBeNull();
  });
});

describe("parseServeLine", () => {
  it("parses ready / prediction / error events", () => {
    expect(
      parseServeLine(
        '{"ev":"ready","template":"textgen","device":"cuda","meta":{"context":128}}',
      ),
    ).toMatchObject({ ev: "ready", template: "textgen", device: "cuda" });
    expect(
      parseServeLine('{"ev":"prediction","input":"a","output":"abc","continuation":"bc"}'),
    ).toMatchObject({ ev: "prediction", output: "abc", continuation: "bc" });
    expect(parseServeLine('{"ev":"error","msg":"bad"}')).toEqual({
      ev: "error",
      msg: "bad",
    });
  });

  it("rejects training events, unknown events, and malformed errors", () => {
    // training events are a disjoint set — must not parse here
    expect(parseServeLine('{"ev":"metric","name":"x","value":1,"step":1,"run":"r"}')).toBeNull();
    expect(parseServeLine('{"ev":"hologram"}')).toBeNull();
    expect(parseServeLine('{"ev":"error"}')).toBeNull(); // msg must be a string
    expect(parseServeLine("not json")).toBeNull();
    expect(parseServeLine("")).toBeNull();
  });

  it("keeps a tabular prediction's structured output", () => {
    const ev = parseServeLine(
      '{"ev":"prediction","input":{"x1":0.5},"output":{"label":"1","probs":{"0":0.2,"1":0.8}}}',
    );
    expect(ev).toMatchObject({
      ev: "prediction",
      output: { label: "1", probs: { "0": 0.2, "1": 0.8 } },
    });
  });
});
