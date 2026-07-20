import { describe, expect, it } from "vitest";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import {
  createBlankWorldPackDraft,
  draftFromWorldPack,
  draftToWorldPackCandidate,
  validateWorldPackDraft,
} from "@/lib/world-pack-draft.client";
import { worldPackSchema } from "@/lib/world-pack";

const portablePack = worldPackSchema.parse(portable);

function ids() {
  let index = 0;
  return () => {
    index += 1;
    return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  };
}

describe("World Pack editor drafts", () => {
  it("creates stable prefixed IDs and does not regenerate them when titles change", () => {
    const draft = createBlankWorldPackDraft(ids());
    const generated = {
      packId: draft.packId,
      worldId: draft.world.worldId,
      bookId: draft.books[0].bookId,
      ruleId: draft.rules[0].ruleId,
      spanId: draft.spans[0].spanId,
    };

    draft.title = "Changed title";
    draft.world.title = "Changed world";

    expect(generated).toEqual({
      packId: "pack-00000000-0000-4000-8000-000000000002",
      worldId: "world-00000000-0000-4000-8000-000000000003",
      bookId: "book-00000000-0000-4000-8000-000000000001",
      ruleId: "rule-00000000-0000-4000-8000-000000000004",
      spanId: "span-00000000-0000-4000-8000-000000000005",
    });
    expect(draft.packId).toBe(generated.packId);
    expect(draft.world.worldId).toBe(generated.worldId);
  });

  it("derives child world IDs and visible order only during validation", () => {
    const draft = draftFromWorldPack(portablePack);
    draft.books = [draft.books[1], draft.books[0]];
    draft.rules = [draft.rules[1], draft.rules[0]];
    draft.spans = [draft.spans[1], draft.spans[0]];

    const result = validateWorldPackDraft(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.books.map((book) => [book.bookId, book.worldId, book.ordinal])).toEqual([
      ["volume-dusk", "world-hours", 0],
      ["volume-dawn", "world-hours", 1],
    ]);
    expect(result.pack.rules.map((rule) => [rule.ruleId, rule.displayOrder])).toEqual([
      ["LAW-B", 0],
      ["LAW-A", 1],
    ]);
    expect(result.pack.spans.map((span) => [span.spanId, span.displayOrder])).toEqual([
      ["NOTE-B", 0],
      ["NOTE-A", 1],
    ]);
  });

  it("maps canonical validation issues to section, path, index, and item ID", () => {
    const draft = draftFromWorldPack(portablePack);
    draft.rules[1].bookId = "missing-book";
    draft.spans[0].text = "";

    const result = validateWorldPackDraft(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "rules", path: "rules.1.scope.bookId", itemIndex: 1, itemId: "LAW-B" }),
      expect.objectContaining({ section: "spans", path: "spans.0.text", itemIndex: 0, itemId: "NOTE-A" }),
    ]));
  });

  it("does not produce a saveable pack from the blank starter", () => {
    const result = validateWorldPackDraft(createBlankWorldPackDraft(ids()));
    expect(result.ok).toBe(false);
  });

  it("omits empty optional fields but preserves imported valid text", () => {
    const draft = draftFromWorldPack(portablePack);
    draft.disclosure = "";
    draft.books[0].summary = "";
    draft.spans[0].chapter = "";
    const candidate = draftToWorldPackCandidate(draft);
    expect(JSON.stringify(candidate)).not.toContain("disclosure");
    expect(JSON.stringify(candidate)).not.toContain("chapter");
    expect(draft.title).toBe(portablePack.title);
    expect(draft.rules[0].text).toBe(portablePack.rules[0].text);
  });
});
