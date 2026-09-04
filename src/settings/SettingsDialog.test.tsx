// @vitest-environment jsdom
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import "@/test/dom";
import { installTauriStub } from "@/test/tauri-stub";
import { useSettingsDialogStore } from "@/modules/settings/settingsDialogStore";
import { ThemeProvider } from "@/modules/theme/ThemeProvider";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

/** The sidebar, as opposed to the content pane — both contain the word "General". */
const nav = () => screen.getByRole("navigation");

/** Section titles render as the `<h1>` inside SectionHeader. */
const activeSectionTitle = () =>
  screen.getByRole("heading", { level: 1 }).textContent;

const navItem = (name: string) =>
  within(nav()).getByRole("button", { name });

const navItemNames = () =>
  within(nav())
    .getAllByRole("button")
    .map((b) => b.textContent?.trim());

async function renderOpen() {
  useSettingsDialogStore.setState({ isOpen: true, activeTab: "general" });
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <SettingsDialog />
    </ThemeProvider>,
  );
  // The dialog portals in asynchronously; wait for the search field to exist.
  const search = await screen.findByLabelText("Search settings");
  return { user, search };
}

beforeEach(() => {
  installTauriStub();
  useSettingsDialogStore.setState({ isOpen: false, activeTab: "general" });
});

describe("navigation", () => {
  test("renders every section, grouped", async () => {
    await renderOpen();
    expect(navItemNames()).toEqual([
      "General",
      "Features",
      "Themes",
      "Privacy",
      "Shortcuts",
      "Models",
      "Agents",
      "Environment",
      "Formatters",
      "About",
    ]);
    for (const group of ["Application", "AI", "Developer"]) {
      expect(within(nav()).getByText(group)).toBeInTheDocument();
    }
  });

  test("clicking a nav item swaps the content pane", async () => {
    const { user } = await renderOpen();
    expect(activeSectionTitle()).toBe("General");

    await user.click(navItem("Models"));
    expect(activeSectionTitle()).toBe("Models");
    expect(navItem("Models")).toHaveAttribute("aria-current", "page");
    expect(navItem("General")).not.toHaveAttribute("aria-current");
  });
});

describe("search", () => {
  test("filters by section name", async () => {
    const { user, search } = await renderOpen();
    await user.type(search, "theme");
    expect(navItemNames()).toEqual(["Themes"]);
  });

  // The point of the keyword index: General alone owns ~20 settings, so a
  // label-only filter would make every one of them unreachable by name.
  test.each([
    ["scrollback", "General"],
    ["word wrap", "General"],
    ["osc 52", "General"],
    ["api key", "Models"],
    ["format on save", "Formatters"],
    ["license", "About"],
    ["command ledger", "Privacy"],
    ["retention", "Privacy"],
  ])("%s finds the section that owns it (%s)", async (query, expected) => {
    const { user, search } = await renderOpen();
    await user.type(search, query);
    expect(navItemNames()).toContain(expected);
  });

  test("is case-insensitive and ignores surrounding whitespace", async () => {
    const { user, search } = await renderOpen();
    await user.type(search, "  SCROLLBACK  ");
    expect(navItemNames()).toEqual(["General"]);
  });

  test("Enter jumps to the top hit", async () => {
    const { user, search } = await renderOpen();
    await user.type(search, "api key");
    expect(activeSectionTitle()).toBe("General"); // not yet moved
    await user.keyboard("{Enter}");
    expect(activeSectionTitle()).toBe("Models");
  });

  test("Enter keeps the query so a near-miss can be re-entered", async () => {
    const { user, search } = await renderOpen();
    await user.type(search, "agent");
    await user.keyboard("{Enter}");
    expect(search).toHaveValue("agent");
    expect(navItemNames()).toEqual(["Agents"]);
  });

  test("shows an empty state when nothing matches", async () => {
    const { user, search } = await renderOpen();
    await user.type(search, "zzzznotasetting");
    expect(within(nav()).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/No settings match/)).toBeInTheDocument();
  });

  // A filter that hid the active section used to blank the whole right-hand
  // pane, which reads as the dialog breaking rather than as a narrow search.
  test("never blanks the content pane, even when the active item is filtered out", async () => {
    const { user, search } = await renderOpen();
    await user.type(search, "formatters");
    expect(navItemNames()).toEqual(["Formatters"]);
    expect(activeSectionTitle()).toBe("General");
  });
});

describe("escape handling", () => {
  test("first Escape clears a non-empty filter and leaves the dialog open", async () => {
    const { user, search } = await renderOpen();
    await user.type(search, "themes");
    await user.keyboard("{Escape}");

    expect(search).toHaveValue("");
    expect(useSettingsDialogStore.getState().isOpen).toBe(true);
    expect(navItemNames()).toHaveLength(10);
  });

  test("Escape on an empty filter closes the dialog", async () => {
    const { user, search } = await renderOpen();
    await user.click(search);
    await user.keyboard("{Escape}");
    expect(useSettingsDialogStore.getState().isOpen).toBe(false);
  });
});

// Regression: the query used to survive a close, so reopening on a tab the
// stale filter excluded showed that tab's content next to a sidebar that did
// not list it.
test("reopening starts from a cleared query", async () => {
  const { user, search } = await renderOpen();
  await user.type(search, "formatters");
  expect(navItemNames()).toEqual(["Formatters"]);

  act(() => useSettingsDialogStore.getState().hide());
  act(() => useSettingsDialogStore.getState().show("models"));

  const reopened = await screen.findByLabelText("Search settings");
  expect(reopened).toHaveValue("");
  expect(navItemNames()).toHaveLength(10);
  expect(activeSectionTitle()).toBe("Models");
});
