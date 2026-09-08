import { describe, expect, it } from "vitest";
import { atlasUrl, ATLAS_SCHEME } from "./atlas";

describe("atlasUrl", () => {
  it("defaults to the map view", () => {
    expect(atlasUrl("/home/me/dev/thing")).toBe(
      `${ATLAS_SCHEME}://map?path=%2Fhome%2Fme%2Fdev%2Fthing`,
    );
  });

  it("builds the focus view when asked", () => {
    expect(atlasUrl("/home/me/dev/thing", "focus")).toContain("://focus?path=");
  });

  // The reason the path is encoded rather than interpolated: a Windows path is
  // mostly backslashes, and a space in it would otherwise end the URL early.
  it("encodes a Windows path with a space so it survives the round trip", () => {
    const path = "C:\\Users\\me\\My Repo";
    const url = atlasUrl(path);

    expect(url).not.toContain(" ");
    expect(url).not.toContain("\\");

    const parsed = new URL(url);
    expect(parsed.searchParams.get("path")).toBe(path);
  });

  it("round-trips an ordinary posix path", () => {
    const path = "/home/me/dev/thing";
    expect(new URL(atlasUrl(path)).searchParams.get("path")).toBe(path);
  });

  // A path containing a `&` or `#` would otherwise be read as a second query
  // parameter or a fragment, and Atlas would receive a truncated path.
  it("encodes characters that would otherwise restructure the URL", () => {
    for (const path of ["/dev/a&b", "/dev/a#b", "/dev/a?b"]) {
      expect(new URL(atlasUrl(path)).searchParams.get("path")).toBe(path);
    }
  });
});
