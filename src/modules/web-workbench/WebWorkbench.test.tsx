// @vitest-environment jsdom
import "@/test/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import type { PanelContribution } from "@/lib/plugins/types";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useWebWorkbenchStore } from "./store";
import { WebWorkbench } from "./WebWorkbench";

const panel = (legacyView: "ports" | "http-client" | "web-tools", pack: "dev-tools" | "web-dev"): PanelContribution => ({
  id: `test:${legacyView}`,
  legacyView,
  title: legacyView,
  location: "sidebar",
  pack,
  render: () => <p>{legacyView} body</p>,
});

const panels = [panel("ports", "dev-tools"), panel("http-client", "web-dev"), panel("web-tools", "web-dev")];

beforeEach(() => {
  useWebWorkbenchStore.setState({ tool: "ports" });
});

it("switches tools and keeps a visited one mounted", () => {
  usePreferencesStore.setState({ enabledPacks: ["dev-tools", "web-dev"] });
  render(<WebWorkbench panels={panels} />);
  expect(screen.getByText("ports body")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /HTTP Client/ }));
  expect(screen.getByText("http-client body")).toBeInTheDocument();
  expect(screen.getByText("ports body", { selector: "p" })).toBeInTheDocument();
});

it("shows only tools whose pack is on", () => {
  usePreferencesStore.setState({ enabledPacks: ["dev-tools"] });
  render(<WebWorkbench panels={panels} />);
  expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Ports"]);
});
