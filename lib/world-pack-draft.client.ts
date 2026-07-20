"use client";

import {
  WORLD_PACK_SCHEMA_VERSION,
  orderWorldPack,
  worldPackSchema,
  type RuleType,
  type WorldPack,
} from "@/lib/world-pack";

type IdFactory = () => string;

export type WorldPackDraftBook = {
  bookId: string;
  slug: string;
  title: string;
  sourceLabel: string;
  summary: string;
};

export type WorldPackDraftRule = {
  ruleId: string;
  type: RuleType;
  title: string;
  text: string;
  scopeKind: "world" | "book";
  bookId: string;
};

export type WorldPackDraftSpan = {
  spanId: string;
  bookId: string;
  sourceLabel: string;
  scene: string;
  chapter: string;
  text: string;
};

export type WorldPackDraft = {
  schemaVersion: typeof WORLD_PACK_SCHEMA_VERSION;
  packId: string;
  packVersion: string;
  title: string;
  description: string;
  disclosure: string;
  world: {
    worldId: string;
    slug: string;
    title: string;
    premise: string;
    summary: string;
    tagsText: string;
  };
  books: WorldPackDraftBook[];
  rules: WorldPackDraftRule[];
  spans: WorldPackDraftSpan[];
};

export type EditorValidationIssue = {
  section: "pack" | "world" | "books" | "rules" | "spans";
  path: string;
  message: string;
  itemIndex?: number;
  itemId?: string;
};

export type EditorValidationResult =
  | { ok: true; pack: WorldPack; issues: [] }
  | { ok: false; pack: null; issues: EditorValidationIssue[] };

function defaultIdFactory(): string {
  return crypto.randomUUID();
}

function prefixedId(prefix: string, idFactory: IdFactory): string {
  const suffix = idFactory().replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 84);
  return `${prefix}${suffix}`.slice(0, 96);
}

export function createDraftBook(idFactory: IdFactory = defaultIdFactory): WorldPackDraftBook {
  return {
    bookId: prefixedId("book-", idFactory),
    slug: "",
    title: "",
    sourceLabel: "",
    summary: "",
  };
}

export function createDraftRule(idFactory: IdFactory = defaultIdFactory): WorldPackDraftRule {
  return {
    ruleId: prefixedId("rule-", idFactory),
    type: "fact",
    title: "",
    text: "",
    scopeKind: "world",
    bookId: "",
  };
}

export function createDraftSpan(bookId = "", idFactory: IdFactory = defaultIdFactory): WorldPackDraftSpan {
  return {
    spanId: prefixedId("span-", idFactory),
    bookId,
    sourceLabel: "",
    scene: "",
    chapter: "",
    text: "",
  };
}

export function createBlankWorldPackDraft(idFactory: IdFactory = defaultIdFactory): WorldPackDraft {
  const book = createDraftBook(idFactory);
  return {
    schemaVersion: WORLD_PACK_SCHEMA_VERSION,
    packId: prefixedId("pack-", idFactory),
    packVersion: "",
    title: "",
    description: "",
    disclosure: "",
    world: {
      worldId: prefixedId("world-", idFactory),
      slug: "",
      title: "",
      premise: "",
      summary: "",
      tagsText: "",
    },
    books: [book],
    rules: [createDraftRule(idFactory)],
    spans: [createDraftSpan(book.bookId, idFactory)],
  };
}

export function draftFromWorldPack(pack: WorldPack): WorldPackDraft {
  return {
    schemaVersion: pack.schemaVersion,
    packId: pack.packId,
    packVersion: pack.packVersion,
    title: pack.title,
    description: pack.description,
    disclosure: pack.disclosure ?? "",
    world: {
      worldId: pack.world.worldId,
      slug: pack.world.slug,
      title: pack.world.title,
      premise: pack.world.premise,
      summary: pack.world.summary,
      tagsText: pack.world.tags.join(", "),
    },
    books: pack.books.map((book) => ({
      bookId: book.bookId,
      slug: book.slug,
      title: book.title,
      sourceLabel: book.sourceLabel,
      summary: book.summary ?? "",
    })),
    rules: pack.rules.map((rule) => ({
      ruleId: rule.ruleId,
      type: rule.type,
      title: rule.title,
      text: rule.text,
      scopeKind: rule.scope.kind,
      bookId: rule.scope.kind === "book" ? rule.scope.bookId : "",
    })),
    spans: pack.spans.map((span) => ({
      spanId: span.spanId,
      bookId: span.bookId,
      sourceLabel: span.source.label,
      scene: span.source.scene,
      chapter: span.source.chapter ?? "",
      text: span.text,
    })),
  };
}

function optionalNonEmpty(value: string): string | undefined {
  return value === "" ? undefined : value;
}

export function draftToWorldPackCandidate(draft: WorldPackDraft): unknown {
  const worldId = draft.world.worldId;
  return {
    schemaVersion: WORLD_PACK_SCHEMA_VERSION,
    packId: draft.packId,
    packVersion: draft.packVersion,
    title: draft.title,
    description: draft.description,
    ...(optionalNonEmpty(draft.disclosure) ? { disclosure: draft.disclosure } : {}),
    world: {
      worldId,
      slug: draft.world.slug,
      title: draft.world.title,
      premise: draft.world.premise,
      summary: draft.world.summary,
      tags: draft.world.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
    },
    books: draft.books.map((book, index) => ({
      bookId: book.bookId,
      worldId,
      slug: book.slug,
      title: book.title,
      sourceLabel: book.sourceLabel,
      ordinal: index,
      ...(optionalNonEmpty(book.summary) ? { summary: book.summary } : {}),
    })),
    rules: draft.rules.map((rule, index) => ({
      ruleId: rule.ruleId,
      worldId,
      scope: rule.scopeKind === "book" ? { kind: "book", bookId: rule.bookId } : { kind: "world", worldId },
      type: rule.type,
      title: rule.title,
      text: rule.text,
      displayOrder: index,
    })),
    spans: draft.spans.map((span, index) => ({
      spanId: span.spanId,
      worldId,
      bookId: span.bookId,
      source: {
        label: span.sourceLabel,
        scene: span.scene,
        ...(optionalNonEmpty(span.chapter) ? { chapter: span.chapter } : {}),
      },
      text: span.text,
      displayOrder: index,
    })),
  };
}

function pathToString(path: PropertyKey[]): string {
  return path.length ? path.join(".") : "$";
}

function issueSection(path: PropertyKey[]): EditorValidationIssue["section"] {
  const head = path[0];
  if (head === "world" || head === "books" || head === "rules" || head === "spans") return head;
  return "pack";
}

function itemIdForPath(draft: WorldPackDraft, section: EditorValidationIssue["section"], itemIndex?: number): string | undefined {
  if (itemIndex === undefined) return undefined;
  if (section === "books") return draft.books[itemIndex]?.bookId;
  if (section === "rules") return draft.rules[itemIndex]?.ruleId;
  if (section === "spans") return draft.spans[itemIndex]?.spanId;
  return undefined;
}

export function validateWorldPackDraft(draft: WorldPackDraft): EditorValidationResult {
  const parsed = worldPackSchema.safeParse(draftToWorldPackCandidate(draft));
  if (parsed.success) return { ok: true, pack: orderWorldPack(parsed.data), issues: [] };

  const issues = parsed.error.issues.map((issue): EditorValidationIssue => {
    const section = issueSection(issue.path);
    const itemIndex = typeof issue.path[1] === "number" ? issue.path[1] : undefined;
    return {
      section,
      itemIndex,
      itemId: itemIdForPath(draft, section, itemIndex),
      path: pathToString(issue.path),
      message: issue.message,
    };
  });
  return { ok: false, pack: null, issues };
}
