// @vitest-environment jsdom
import "@/test/dom";
import { beforeEach, expect, it } from "vitest";
import { PROBLEMS_TAB, useBottomPanelStore } from "./store";

beforeEach(() => {
  useBottomPanelStore.setState({ open: false, tab: PROBLEMS_TAB, maximized: false, status: {} });
});

it("shows a tab and remembers it across a toggle", () => {
  useBottomPanelStore.getState().show("build");
  expect(useBottomPanelStore.getState()).toMatchObject({ open: true, tab: "build" });
  useBottomPanelStore.getState().toggle();
  expect(useBottomPanelStore.getState().open).toBe(false);
  useBottomPanelStore.getState().toggle();
  expect(useBottomPanelStore.getState()).toMatchObject({ open: true, tab: "build" });
});

it("toggleTab closes only when that tab is already showing", () => {
  const { toggleTab } = useBottomPanelStore.getState();
  toggleTab(PROBLEMS_TAB);
  expect(useBottomPanelStore.getState().open).toBe(true);
  useBottomPanelStore.getState().setTab("tests");
  toggleTab(PROBLEMS_TAB);
  expect(useBottomPanelStore.getState()).toMatchObject({ open: true, tab: PROBLEMS_TAB });
  toggleTab(PROBLEMS_TAB);
  expect(useBottomPanelStore.getState().open).toBe(false);
});

it("closing leaves maximized", () => {
  useBottomPanelStore.getState().toggleMaximized();
  expect(useBottomPanelStore.getState()).toMatchObject({ open: true, maximized: true });
  useBottomPanelStore.getState().close();
  expect(useBottomPanelStore.getState().maximized).toBe(false);
});

it("persists open, tab and height but not maximized", () => {
  useBottomPanelStore.getState().show("repl");
  useBottomPanelStore.getState().setHeight(300);
  useBottomPanelStore.getState().toggleMaximized();
  expect(JSON.parse(localStorage.getItem("nexis.bottom-panel")!)).toEqual({ open: true, tab: "repl", height: 300 });
});

it("ignores heights below the floor", () => {
  useBottomPanelStore.getState().setHeight(300);
  useBottomPanelStore.getState().setHeight(10);
  expect(useBottomPanelStore.getState().height).toBe(300);
});
