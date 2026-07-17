import { describe, expect, it } from "vitest";
import {
  buildSwitchOrder,
  mruPromote,
  mruPrune,
  nextSwitchIndex,
} from "./mru";

describe("mruPromote", () => {
  it("moves the id to the front", () => {
    expect(mruPromote([1, 2, 3], 3)).toEqual([3, 1, 2]);
  });

  it("adds an unseen id to the front", () => {
    expect(mruPromote([1, 2], 9)).toEqual([9, 1, 2]);
  });

  it("keeps a front id at the front without duplicating", () => {
    expect(mruPromote([4, 1], 4)).toEqual([4, 1]);
  });
});

describe("mruPrune", () => {
  it("drops ids whose tab closed", () => {
    expect(mruPrune([3, 1, 2], [1, 3])).toEqual([3, 1]);
  });
});

describe("buildSwitchOrder", () => {
  it("lists MRU entries first, then never-visited tabs in tab order", () => {
    // MRU knows 3 then 1; tabs 2 and 4 were never activated.
    expect(buildSwitchOrder([3, 1], [1, 2, 3, 4])).toEqual([3, 1, 2, 4]);
  });

  it("ignores MRU entries for closed tabs", () => {
    expect(buildSwitchOrder([9, 2, 1], [1, 2])).toEqual([2, 1]);
  });

  it("dedupes repeated MRU ids", () => {
    expect(buildSwitchOrder([2, 2, 1], [1, 2])).toEqual([2, 1]);
  });
});

describe("nextSwitchIndex", () => {
  it("advances and wraps forward", () => {
    expect(nextSwitchIndex(0, 1, 3)).toBe(1);
    expect(nextSwitchIndex(2, 1, 3)).toBe(0);
  });

  it("wraps backward from the front", () => {
    expect(nextSwitchIndex(0, -1, 3)).toBe(2);
  });
});
