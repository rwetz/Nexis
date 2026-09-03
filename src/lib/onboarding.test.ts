// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { PACK_IDS, PACKS, PRESETS } from "./packs";
import {
  checklistFor,
  isOnboardingStepId,
  MAX_TOUR_STEPS,
  onboardingProgress,
  stepKeys,
  tourFor,
} from "./onboarding";

describe("onboarding checklist", () => {
  it("is derived from pack config, not from a first-run snapshot", () => {
    // The whole point: changing the preset later must re-derive the list.
    // A Bare-Bones user who switches to Everything should gain steps, not
    // keep an orphaned checklist that never mentions their new panels.
    const bare = checklistFor(PRESETS["bare-bones"].packs);
    const everything = checklistFor(PRESETS.everything.packs);
    expect(everything.length).toBeGreaterThan(bare.length);
    // Bare-Bones is a strict subset, so nothing is lost by turning packs on.
    const everythingIds = new Set(everything.map((s) => s.id));
    for (const step of bare) expect(everythingIds).toContain(step.id);
  });

  it("never offers a step whose pack is disabled", () => {
    for (const step of checklistFor([])) expect(step.pack).toBeUndefined();

    const codeOnly = checklistFor(["code-tools"]);
    expect(codeOnly.some((s) => s.id === "build.run")).toBe(true);
    expect(codeOnly.some((s) => s.pack === "dev-tools")).toBe(false);
  });

  it("leads with the agent surface", () => {
    // People already know what a terminal is; the agent is the differentiator
    // and the least discoverable thing here, so it must not slip down the
    // list as steps are added.
    const first = checklistFor(PACK_IDS)[0];
    expect(first.id).toBe("ai.open");
    expect(checklistFor([])[0].id).toBe("ai.open");
  });

  it("gives every step a distinct id, a why, and an icon", () => {
    const steps = checklistFor(PACK_IDS);
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    for (const step of steps) {
      expect(step.why).toBeTruthy();
      // The why must add something, not restate the label.
      expect(step.why).not.toBe(step.label);
      expect(step.icon).toBeTruthy();
    }
  });

  it("only targets sidebar views their own pack enables", () => {
    // A step that navigates to a gated view while itself being core would
    // land the user on the pack-gate placeholder.
    for (const step of checklistFor(PACK_IDS)) {
      if (step.action.kind !== "sidebar") continue;
      const owner = Object.values(PACKS).find((p) =>
        p.views.includes(step.action.kind === "sidebar" ? step.action.view : "explorer"),
      );
      if (owner) expect(step.pack).toBe(owner.id);
    }
  });
});

describe("onboarding tour", () => {
  it("never exceeds the step cap", () => {
    expect(tourFor(PACK_IDS).length).toBeLessThanOrEqual(MAX_TOUR_STEPS);
    expect(tourFor([]).length).toBeLessThanOrEqual(MAX_TOUR_STEPS);
  });

  it("spotlights only panels the chosen preset enabled", () => {
    // Touring a feature that is switched off is worse than not touring at all.
    for (const step of tourFor([])) expect(step.pack).toBeUndefined();
    expect(tourFor([]).some((s) => s.id === "build.run")).toBe(false);
    expect(tourFor(["code-tools"]).some((s) => s.id === "build.run")).toBe(true);
  });

  it("gives every tour step an anchor to point at", () => {
    for (const step of tourFor(PACK_IDS)) {
      expect(step.tourTarget).toBeTruthy();
    }
  });

  it("is a subset of the checklist", () => {
    const ids = new Set(checklistFor(PACK_IDS).map((s) => s.id));
    for (const step of tourFor(PACK_IDS)) expect(ids).toContain(step.id);
  });
});

describe("onboarding progress", () => {
  it("counts only steps that are currently visible", () => {
    // Progress is over the derived list, so a tick earned in a pack that is
    // now off must not inflate the denominator or the numerator.
    const completed = ["ai.open", "build.run"];
    const bare = onboardingProgress([], completed);
    expect(bare.done).toBe(1);
    expect(bare.total).toBe(checklistFor([]).length);

    const withCode = onboardingProgress(["code-tools"], completed);
    expect(withCode.done).toBe(2);
  });

  it("ignores ids it does not recognise", () => {
    const { done } = onboardingProgress(PACK_IDS, ["nope", "ai.open"]);
    expect(done).toBe(1);
  });

  it("reports nothing done on a fresh install", () => {
    const { done, total } = onboardingProgress(PACK_IDS, []);
    expect(done).toBe(0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("step key hints", () => {
  it("substitutes the platform modifier", () => {
    const step = checklistFor([]).find((s) => s.id === "ai.open");
    expect(step).toBeDefined();
    expect(stepKeys(step!, "Ctrl")).toEqual(["Ctrl", "I"]);
    expect(stepKeys(step!, "Cmd")).toEqual(["Cmd", "I"]);
  });

  it("leaves a step without keys alone", () => {
    const step = checklistFor([]).find((s) => s.id === "ai.turn");
    expect(stepKeys(step!, "Ctrl")).toBeUndefined();
  });
});

describe("step id validation", () => {
  it("accepts known ids and rejects everything else", () => {
    expect(isOnboardingStepId("ai.open")).toBe(true);
    expect(isOnboardingStepId("terminal.run")).toBe(true);
    expect(isOnboardingStepId("nope")).toBe(false);
    expect(isOnboardingStepId(undefined)).toBe(false);
    expect(isOnboardingStepId(42)).toBe(false);
  });
});
