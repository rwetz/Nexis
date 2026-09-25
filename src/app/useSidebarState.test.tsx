// @vitest-environment jsdom
import "@/test/dom";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, expect, it } from "vitest";
import type { FileExplorerHandle } from "@/modules/explorer";
import { useBottomPanelStore } from "@/modules/bottom-panel";
import { useSidebarState } from "./useSidebarState";

beforeEach(() => {
  localStorage.clear();
  useBottomPanelStore.setState({
    open: false,
    everOpened: false,
    tab: "problems",
    maximized: false,
    status: {},
  });
});

it("migrates a legacy saved session view into the bottom panel and restores Files", () => {
  localStorage.setItem("nexis.sidebar.view", "build");

  const { result } = renderHook(() => useSidebarState(useRef<FileExplorerHandle | null>(null)));

  expect(result.current.sidebarView).toBe("explorer");
  expect(useBottomPanelStore.getState()).toMatchObject({ open: true, tab: "build" });
  expect(localStorage.getItem("nexis.sidebar.view")).toBe("explorer");
});

it("routes later session selections to the bottom panel without changing the sidebar", () => {
  const { result } = renderHook(() => useSidebarState(useRef<FileExplorerHandle | null>(null)));

  result.current.persistSidebarView("tests");

  expect(result.current.sidebarView).toBe("explorer");
  expect(useBottomPanelStore.getState()).toMatchObject({ open: true, tab: "tests" });
  expect(localStorage.getItem("nexis.sidebar.view")).toBeNull();
});
