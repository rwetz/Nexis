import { describe, expect, it } from "vitest";
import { orbStateFor } from "./orbState";

describe("orbStateFor", () => {
  it("maps every agent status onto an orb state", () => {
    expect(orbStateFor("idle")).toBe("idle");
    expect(orbStateFor("error")).toBe("idle");
    expect(orbStateFor("thinking")).toBe("thinking");
    expect(orbStateFor("awaiting-approval")).toBe("thinking");
    expect(orbStateFor("streaming")).toBe("speaking");
  });
});
