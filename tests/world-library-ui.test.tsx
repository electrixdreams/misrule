import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import { MisruleProduct } from "@/components/MisruleProduct";
import { WorldLibrary } from "@/components/world-library/WorldLibrary";
import {
  WORLD_LIBRARY_STORAGE_KEY,
  loadWorldLibrary,
  saveLocalWorldPack,
} from "@/lib/world-library.client";
import { exportWorldPackJson } from "@/lib/world-pack-io";
import { MAX_WORLD_PACK_BYTES, worldPackSchema, type WorldPack } from "@/lib/world-pack";

const ashglassPack = worldPackSchema.parse(ashglass);
const portablePack = worldPackSchema.parse(portable);
const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

beforeAll(() => {
  if (!URL.createObjectURL) {
    // jsdom does not implement object URLs; provide test doubles.
  }
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
});

function openImport() {
  fireEvent.click(screen.getByRole("button", { name: "Import World Pack" }));
  return screen.findByRole("dialog", { name: /Import a World Pack/ });
}

async function pasteAndValidate(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));
  const textarea = screen.getByLabelText("World Pack JSON");
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Validate" }));
}

describe("World Library surface", () => {
  it("renders the World Library first with the bundled sample and an empty local state", () => {
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "World Library" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Ashglass Clocktower" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open sample" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export World Pack" })).toBeInTheDocument();
    expect(screen.getByText(/No World Packs saved yet/)).toBeInTheDocument();
  });

  it("lists populated local packs with counts and timestamps", () => {
    saveLocalWorldPack({ ...portablePack, packId: "alpha", title: "Alpha World" }, { now: () => "2026-07-20T01:00:00.000Z" });
    saveLocalWorldPack({ ...portablePack, packId: "beta", title: "Beta World" }, { now: () => "2026-07-20T02:00:00.000Z" });
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Alpha World/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Beta World/ })).toBeInTheDocument();
    expect(screen.queryByText(/No World Packs saved yet/)).not.toBeInTheDocument();

    // Each pack's detail — including its updated timestamp — is revealed by
    // selecting its spine, not shown for every pack simultaneously.
    fireEvent.click(screen.getByRole("button", { name: /Alpha World/ }));
    expect(screen.getByText("Updated 2026-07-20T01:00:00.000Z")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Beta World/ }));
    expect(screen.getByText("Updated 2026-07-20T02:00:00.000Z")).toBeInTheDocument();
  });

  it("opens the bundled sample and returns to the World Library through the product shell", async () => {
    render(<MisruleProduct bundledPacks={[ashglassPack]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sample" }));
    const openArchive = await screen.findByRole("button", { name: /Open the Ashglass archive/ });
    fireEvent.click(openArchive);
    const returnButton = await screen.findByRole("button", { name: "Return to the World Library" });
    fireEvent.click(returnButton);
    expect(screen.getByRole("heading", { name: "World Library" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to the World Library" })).not.toBeInTheDocument();
  });
});

describe("World Pack import", () => {
  it("imports a valid pack from a file and saves only on explicit confirm", async () => {
    const file = new File([JSON.stringify(portablePack)], "portable.json", { type: "application/json" });
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);
    await openImport();
    fireEvent.change(screen.getByLabelText("World Pack file"), { target: { files: [file] } });
    await screen.findByText("Valid world-pack/v1 — ready to save.");

    // Parsing must not save automatically.
    expect(loadWorldLibrary().entries).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Save to World Library" }));
    await waitFor(() => expect(loadWorldLibrary().entries).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(portablePack.title) }));
    expect(screen.getByText("ID portable-world-v1")).toBeInTheDocument();
  });

  it("imports a valid pack pasted as JSON", async () => {
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);
    await openImport();
    await pasteAndValidate(JSON.stringify(portablePack));
    await screen.findByText("Valid world-pack/v1 — ready to save.");
    expect(loadWorldLibrary().entries).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save to World Library" }));
    await waitFor(() => expect(loadWorldLibrary().entries).toHaveLength(1));
  });

  it("renders distinct failures for malformed, unsupported, and invalid packs", async () => {
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);
    await openImport();

    await pasteAndValidate("{ this is not json");
    expect(await screen.findByText("The JSON could not be parsed.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));
    await pasteAndValidate(JSON.stringify({ schemaVersion: "world-pack/v2" }));
    expect(await screen.findByText("This World Pack version is not supported.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));
    await pasteAndValidate(JSON.stringify({ schemaVersion: "world-pack/v1", packId: "x" }));
    const invalid = await screen.findByText("The World Pack is not valid.");
    expect(invalid).toBeInTheDocument();
    expect(screen.getAllByText(/\s—\s/).length).toBeGreaterThan(0);
  });

  it("rejects an oversize file before parsing", async () => {
    const big = new File([new Uint8Array(MAX_WORLD_PACK_BYTES + 16)], "big.json", { type: "application/json" });
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);
    await openImport();
    fireEvent.change(screen.getByLabelText("World Pack file"), { target: { files: [big] } });
    expect(await screen.findByText("The World Pack is too large.")).toBeInTheDocument();
  });

  it("offers Cancel or Replace for a duplicate packId and does not auto-rewrite the ID", async () => {
    saveLocalWorldPack(portablePack, { now: () => "2026-07-20T01:00:00.000Z" });
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);

    await openImport();
    await pasteAndValidate(JSON.stringify(portablePack));
    await screen.findByText("Valid world-pack/v1 — ready to save.");
    fireEvent.click(screen.getByRole("button", { name: "Save to World Library" }));

    await screen.findByRole("button", { name: "Replace existing local pack" });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(loadWorldLibrary().entries).toHaveLength(1);

    // Cancel closes the dialog without writing.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Import a World Pack/ })).not.toBeInTheDocument());
    expect(loadWorldLibrary().entries).toHaveLength(1);

    // Re-open and replace instead.
    await openImport();
    await pasteAndValidate(JSON.stringify(portablePack));
    await screen.findByText("Valid world-pack/v1 — ready to save.");
    fireEvent.click(screen.getByRole("button", { name: "Save to World Library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace existing local pack" }));
    await waitFor(() => expect(loadWorldLibrary().entries).toHaveLength(1));
    expect(loadWorldLibrary().entries[0].pack.title).toBe("Harbor of Hours");
  });
});

describe("World Pack export", () => {
  it("exports only the World Pack JSON, excluding library envelope and runtime fields", () => {
    const exported = exportWorldPackJson(ashglassPack);
    const parsed = JSON.parse(exported) as WorldPack;
    expect(parsed.schemaVersion).toBe("world-pack/v1");
    expect(parsed.packId).toBe("ashglass-clocktower-v1");
    expect(worldPackSchema.safeParse(parsed).success).toBe(true);
    // Export must never carry local-library envelope or runtime fields.
    expect(exported).not.toContain("updatedAt");
    expect(exported).not.toContain("createdAt");
    expect(exported).not.toContain("lastOpenedAt");
    expect(exported).not.toContain("world-library/v1");
    expect(exported).not.toContain("apiKey");
  });

  it("exports the bundled sample from the UI without crashing the library", () => {
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Export World Pack" }));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(screen.queryByText(/Could not export/)).not.toBeInTheDocument();
  });
});

describe("delete and reset", () => {
  it("requires confirmation before deleting a local pack and cancels without writing", async () => {
    saveLocalWorldPack({ ...portablePack, packId: "del-1", title: "To Delete" }, { now: () => "2026-07-20T01:00:00.000Z" });
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /To Delete/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Delete local World Pack" });
    expect(within(confirmDialog).getByText(/Delete “To Delete”/)).toBeInTheDocument();

    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Cancel" }));
    expect(loadWorldLibrary().entries).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmAgain = await screen.findByRole("dialog", { name: "Delete local World Pack" });
    fireEvent.click(within(confirmAgain).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(loadWorldLibrary().entries).toHaveLength(0));
    expect(screen.getByText(/No World Packs saved yet/)).toBeInTheDocument();
  });

  it("recovers from a corrupted envelope only after explicit confirmed reset", async () => {
    localStorage.setItem(WORLD_LIBRARY_STORAGE_KEY, "{broken");
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset World Library" }));
    const resetDialog = await screen.findByRole("dialog", { name: "Reset World Library" });
    expect(within(resetDialog).getByText(/Remove local World Packs/)).toBeInTheDocument();

    fireEvent.click(within(resetDialog).getByRole("button", { name: "Remove local World Packs" }));
    await waitFor(() => expect(localStorage.getItem(WORLD_LIBRARY_STORAGE_KEY)).toBeNull());
    expect(screen.getByText(/No World Packs saved yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset World Library" })).not.toBeInTheDocument();
  });
});

describe("dialog focus and keyboard behavior", () => {
  it("traps focus, restores it on Escape, and dismisses the import dialog", async () => {
    render(<WorldLibrary bundledPacks={[ashglassPack]} onOpenBundled={vi.fn()} />);
    const importButton = screen.getByRole("button", { name: "Import World Pack" });
    importButton.focus();
    fireEvent.click(importButton);
    const dialog = await screen.findByRole("dialog", { name: /Import a World Pack/ });

    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const list = focusables();
    list[0].focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(list[list.length - 1]);

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Import a World Pack/ })).not.toBeInTheDocument());
    expect(importButton).toHaveFocus();
  });
});
