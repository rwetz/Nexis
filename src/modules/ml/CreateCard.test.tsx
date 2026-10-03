// @vitest-environment jsdom
import "@/test/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

import { CreateCard } from "./MlPanel";
import type { EngineKind } from "./lib/engine-bridge";

function setup(engineKind: EngineKind | null) {
  const onCreate = vi.fn();
  render(<CreateCard creating={false} createError={null} engineKind={engineKind} onCreate={onCreate} />);
  return onCreate;
}

describe("CreateCard stock network gallery", () => {
  it("opens on the starters, each with its data", () => {
    setup("python");
    expect(screen.getByRole("tab", { name: "Starters" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /Basketball GOAT/ })).toHaveTextContent("data included");
    expect(screen.getAllByText("data included")).toHaveLength(12);
  });

  it("creates the picked stock network with its id", () => {
    const onCreate = setup("python");
    fireEvent.click(screen.getByRole("button", { name: /Basketball GOAT/ }));
    expect(screen.getByLabelText("New project name")).toHaveValue("goat-ranker");
    expect(screen.getByText(/Writes synthetic starter data to data\/players.csv/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Basketball GOAT" }));
    expect(onCreate).toHaveBeenCalledWith(
      "tabular",
      "goat-ranker",
      false,
      expect.stringContaining("all-time great"),
      "starter",
      "goat-ranker",
    );
  });

  it("clears the stock network when a bare family is picked", () => {
    const onCreate = setup("python");
    fireEvent.click(screen.getByRole("button", { name: /Churn risk/ }));
    fireEvent.click(screen.getByRole("button", { name: /Image classifier/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    expect(onCreate.mock.calls[0][0]).toBe("image");
    expect(onCreate.mock.calls[0][5]).toBeNull();
  });

  it("lists architectures per family tab", () => {
    setup("python");
    fireEvent.click(screen.getByRole("tab", { name: "Text nets" }));
    expect(screen.getByRole("button", { name: /Nano GPT/ })).toHaveTextContent("GPT · 1×2h · width 32 · ctx 32");
    expect(screen.queryByRole("button", { name: /Basketball GOAT/ })).toBeNull();
  });

  it("falls back when the engine turns out not to support the pick", () => {
    const onCreate = vi.fn();
    const props = { creating: false, createError: null, onCreate };
    const { rerender } = render(<CreateCard {...props} engineKind={null} />);
    fireEvent.click(screen.getByRole("tab", { name: "Text nets" }));
    fireEvent.click(screen.getByRole("button", { name: /Nano GPT/ }));
    rerender(<CreateCard {...props} engineKind="rust" />);
    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    expect(onCreate.mock.calls[0][0]).toBe("tabular");
    expect(onCreate.mock.calls[0][5]).toBeNull();
  });

  it("hides text networks on the standalone engine", () => {
    setup("rust");
    expect(screen.queryByRole("tab", { name: "Text nets" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Image nets" })).toBeInTheDocument();
  });
});
