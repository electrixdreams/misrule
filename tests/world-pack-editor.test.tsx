import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import { MisruleProduct } from "@/components/MisruleProduct";
import {
  getLocalWorldPack,
  listLocalWorldPacks,
  saveLocalWorldPack,
} from "@/lib/world-library.client";
import { worldPackSchema } from "@/lib/world-pack";

const ashglassPack = worldPackSchema.parse(ashglass);
const portablePack = worldPackSchema.parse(portable);

beforeEach(() => {
  localStorage.clear();
});

function renderProduct() {
  render(<MisruleProduct bundledPacks={[ashglassPack]} />);
}

function createPack() {
  fireEvent.click(screen.getByRole("button", { name: "Create World Pack" }));
  expect(screen.getByRole("heading", { name: "Create World Pack" })).toBeInTheDocument();
}

function fillValidStarter() {
  fireEvent.change(screen.getByLabelText(/Pack title/), { target: { value: "Trial World" } });
  fireEvent.change(screen.getByLabelText(/Pack version/), { target: { value: "1.0.0" } });
  fireEvent.change(screen.getByLabelText(/Pack description/), { target: { value: "A browser-authored test world." } });
  fireEvent.change(screen.getByLabelText(/World title/), { target: { value: "Trial World" } });
  fireEvent.change(screen.getByLabelText(/World slug/), { target: { value: "trial-world" } });
  fireEvent.change(screen.getByLabelText(/Premise/), { target: { value: "Every oath has a visible cost." } });
  fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: "A small world for editor tests." } });
  fireEvent.change(screen.getByLabelText(/Tags/), { target: { value: "test, editor" } });

  const book = screen.getByRole("group", { name: /Book 1:/ });
  fireEvent.change(within(book).getByLabelText(/Title/), { target: { value: "First Book" } });
  fireEvent.change(within(book).getByLabelText(/Slug/), { target: { value: "first-book" } });
  fireEvent.change(within(book).getByLabelText(/Source label/), { target: { value: "First Book" } });

  const rule = screen.getByRole("group", { name: /Rule 1:/ });
  fireEvent.change(within(rule).getByLabelText(/Title/), { target: { value: "Oath Cost" } });
  fireEvent.change(within(rule).getByLabelText(/Exact rule text/), { target: { value: "Every oath requires a visible cost." } });

  const span = screen.getByRole("group", { name: /Span 1:/ });
  fireEvent.change(within(span).getByLabelText(/Source label/), { target: { value: "First Book" } });
  fireEvent.change(within(span).getByLabelText(/Scene/), { target: { value: "Market gate" } });
  fireEvent.change(within(span).getByLabelText(/Exact narrative text/), { target: { value: "The oath-mark flared as the promise was made." } });
}

describe("World Pack editor product flow", () => {
  it("offers Create for local packs, Edit for local packs, and no editor action for bundled Ashglass", () => {
    saveLocalWorldPack(portablePack);
    renderProduct();

    expect(screen.getByRole("button", { name: "Create World Pack" })).toBeInTheDocument();

    // Bundled sample is selected by default and must not offer Edit.
    expect(screen.getByRole("heading", { name: "The Ashglass Clocktower" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    // Selecting the local pack's spine reveals its Edit action.
    fireEvent.click(screen.getByRole("button", { name: /Harbor of Hours/ }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("rejects invalid blank drafts and saves a valid new local pack", async () => {
    renderProduct();
    createPack();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: /validation problem/ })).toBeInTheDocument();
    expect(listLocalWorldPacks()).toHaveLength(0);

    fillValidStarter();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(listLocalWorldPacks()).toHaveLength(1));
    expect(screen.getByText("Saved to the local World Library.")).toBeInTheDocument();

    const saved = listLocalWorldPacks()[0].pack;
    expect(saved.title).toBe("Trial World");
    expect(saved.books[0].ordinal).toBe(0);
    expect(saved.rules[0].displayOrder).toBe(0);
    expect(saved.spans[0].displayOrder).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Return to library" }));
    fireEvent.click(await screen.findByRole("button", { name: /Trial World/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findAllByDisplayValue("Trial World")).toHaveLength(2);
  });

  it("edits only the selected local pack and preserves its creation timestamp", async () => {
    saveLocalWorldPack(portablePack, { now: () => "2026-07-20T01:00:00.000Z" });
    renderProduct();

    fireEvent.click(screen.getByRole("button", { name: /Harbor of Hours/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText("Pack title"), { target: { value: "Harbor Revised" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(getLocalWorldPack("portable-world-v1")?.pack.title).toBe("Harbor Revised"));
    const entry = getLocalWorldPack("portable-world-v1");
    expect(entry?.createdAt).toBe("2026-07-20T01:00:00.000Z");
    expect(entry?.updatedAt).not.toBe("2026-07-20T01:00:00.000Z");
  });

  it("blocks deleting referenced books, then permits deletion after deliberate reassignment", async () => {
    saveLocalWorldPack(portablePack);
    renderProduct();
    fireEvent.click(screen.getByRole("button", { name: /Harbor of Hours/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const bookTwo = await screen.findByRole("group", { name: /Book 2: Dusk Ledger/ });
    fireEvent.click(within(bookTwo).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Book volume-dusk cannot be deleted while referenced by rules: LAW-B; spans: NOTE-B.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Delete book" })).not.toBeInTheDocument();

    const ruleTwo = screen.getByRole("group", { name: /Rule 2: Dusk Bell/ });
    fireEvent.change(within(ruleTwo).getByLabelText("Scope"), { target: { value: "world" } });
    const spanTwo = screen.getByRole("group", { name: /Span 2: Dusk Ledger/ });
    fireEvent.change(within(spanTwo).getByLabelText("Book"), { target: { value: "volume-dawn" } });

    fireEvent.click(within(bookTwo).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete book" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(getLocalWorldPack("portable-world-v1")?.pack.books).toHaveLength(1));
    expect(getLocalWorldPack("portable-world-v1")?.pack.rules[1].scope).toEqual({ kind: "world", worldId: "world-hours" });
    expect(getLocalWorldPack("portable-world-v1")?.pack.spans[1].bookId).toBe("volume-dawn");
  });

  it("protects unsaved in-app navigation and clears beforeunload after save", async () => {
    saveLocalWorldPack(portablePack);
    renderProduct();
    fireEvent.click(screen.getByRole("button", { name: /Harbor of Hours/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText("Pack title"), { target: { value: "Dirty Harbor" } });

    const dirtyUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Return to library" }));
    const prompt = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    expect(within(prompt).getByRole("button", { name: "Continue editing" })).toBeInTheDocument();
    fireEvent.click(within(prompt).getByRole("button", { name: "Continue editing" }));
    expect(screen.getByRole("heading", { name: "Edit World Pack" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Saved to the local World Library.")).toBeInTheDocument());
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  });

  it("does not recreate an edit target that disappears before save", async () => {
    saveLocalWorldPack(portablePack);
    renderProduct();
    fireEvent.click(screen.getByRole("button", { name: /Harbor of Hours/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText("Pack title"), { target: { value: "Vanished Harbor" } });
    localStorage.clear();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/was not recreated/)).toBeInTheDocument();
    expect(listLocalWorldPacks()).toHaveLength(0);
  });
});
