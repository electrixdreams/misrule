import { z } from "zod";

export const WORLD_PACK_SCHEMA_VERSION = "world-pack/v1" as const;
export const MAX_WORLD_PACK_BYTES = 768 * 1024;

const id = z.string().min(1).max(96).refine((value) => value === value.trim(), "IDs must not have leading or trailing whitespace.");
const nonEmpty = z.string().min(1).max(4_000).refine((value) => value === value.trim(), "Text must not have leading or trailing whitespace.");

export const ruleTypeSchema = z.enum(["fact", "constraint", "temporal", "conditional"]);

export const worldMetadataSchema = z
  .object({
    worldId: id,
    slug: id,
    title: nonEmpty,
    premise: nonEmpty,
    summary: nonEmpty,
    tags: z.array(nonEmpty).max(12),
  })
  .strict();

export const bookMetadataSchema = z
  .object({
    bookId: id,
    worldId: id,
    slug: id,
    title: nonEmpty,
    sourceLabel: nonEmpty,
    ordinal: z.number().int().nonnegative(),
    summary: nonEmpty.optional(),
  })
  .strict();

export const ruleScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("world"), worldId: id }).strict(),
  z.object({ kind: z.literal("book"), bookId: id }).strict(),
]);

export const worldRuleSchema = z
  .object({
    ruleId: id,
    worldId: id,
    scope: ruleScopeSchema,
    type: ruleTypeSchema,
    title: nonEmpty,
    text: nonEmpty,
    displayOrder: z.number().int().nonnegative(),
  })
  .strict();

export const narrativeSourceSchema = z
  .object({
    label: nonEmpty,
    scene: nonEmpty,
    chapter: nonEmpty.optional(),
  })
  .strict();

export const narrativeSpanSchema = z
  .object({
    spanId: id,
    worldId: id,
    bookId: id,
    source: narrativeSourceSchema,
    text: nonEmpty,
    displayOrder: z.number().int().nonnegative(),
  })
  .strict();

const worldPackShapeSchema = z
  .object({
    schemaVersion: z.literal(WORLD_PACK_SCHEMA_VERSION),
    packId: id,
    packVersion: nonEmpty,
    title: nonEmpty,
    description: nonEmpty,
    disclosure: nonEmpty.optional(),
    world: worldMetadataSchema,
    books: z.array(bookMetadataSchema).min(1).max(12),
    rules: z.array(worldRuleSchema).min(1).max(100),
    spans: z.array(narrativeSpanSchema).min(1).max(250),
  })
  .strict();

export type WorldPackShape = z.infer<typeof worldPackShapeSchema>;
export type WorldPackValidationIssue = { path: string; message: string };

function duplicateIssue(path: string, message: string): WorldPackValidationIssue {
  return { path, message };
}

export function validateWorldPackRelationships(pack: WorldPackShape): WorldPackValidationIssue[] {
  const issues: WorldPackValidationIssue[] = [];
  const worldId = pack.world.worldId;
  const bookIds = new Set(pack.books.map((book) => book.bookId));
  const seenBookIds = new Set<string>();
  const ruleIds = new Set<string>();
  const spanIds = new Set<string>();
  const bookOrdinals = new Set<number>();
  const ruleOrders = new Set<number>();
  const spanOrders = new Set<number>();

  pack.books.forEach((book, index) => {
    if (seenBookIds.has(book.bookId)) issues.push(duplicateIssue(`books.${index}.bookId`, "Duplicate book ID."));
    seenBookIds.add(book.bookId);
    if (book.worldId !== worldId) issues.push({ path: `books.${index}.worldId`, message: "Book belongs to another world." });
    if (bookOrdinals.has(book.ordinal)) issues.push(duplicateIssue(`books.${index}.ordinal`, "Duplicate book ordinal."));
    bookOrdinals.add(book.ordinal);
  });

  pack.rules.forEach((rule, index) => {
    if (ruleIds.has(rule.ruleId)) issues.push(duplicateIssue(`rules.${index}.ruleId`, "Duplicate rule ID."));
    ruleIds.add(rule.ruleId);
    if (rule.worldId !== worldId) issues.push({ path: `rules.${index}.worldId`, message: "Rule belongs to another world." });
    if (rule.scope.kind === "world" && rule.scope.worldId !== worldId) {
      issues.push({ path: `rules.${index}.scope.worldId`, message: "World-scoped rule references another world." });
    }
    if (rule.scope.kind === "book" && !bookIds.has(rule.scope.bookId)) {
      issues.push({ path: `rules.${index}.scope.bookId`, message: "Book-scoped rule references an unknown book." });
    }
    if (ruleOrders.has(rule.displayOrder)) issues.push(duplicateIssue(`rules.${index}.displayOrder`, "Duplicate rule display order."));
    ruleOrders.add(rule.displayOrder);
  });

  pack.spans.forEach((span, index) => {
    if (spanIds.has(span.spanId)) issues.push(duplicateIssue(`spans.${index}.spanId`, "Duplicate span ID."));
    spanIds.add(span.spanId);
    if (span.worldId !== worldId) issues.push({ path: `spans.${index}.worldId`, message: "Span belongs to another world." });
    if (!bookIds.has(span.bookId)) issues.push({ path: `spans.${index}.bookId`, message: "Span references an unknown book." });
    if (spanOrders.has(span.displayOrder)) issues.push(duplicateIssue(`spans.${index}.displayOrder`, "Duplicate span display order."));
    spanOrders.add(span.displayOrder);
  });

  return issues;
}

export const worldPackSchema = worldPackShapeSchema.superRefine((pack, context) => {
  for (const issue of validateWorldPackRelationships(pack)) {
    context.addIssue({
      code: "custom",
      path: issue.path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
      message: issue.message,
    });
  }
});

export type WorldPack = z.infer<typeof worldPackSchema>;
export type WorldMetadata = WorldPack["world"];
export type BookMetadata = WorldPack["books"][number];
export type RuleType = z.infer<typeof ruleTypeSchema>;
export type WorldRule = WorldPack["rules"][number];
export type NarrativeSpan = WorldPack["spans"][number];

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function serializedWorldPackByteLength(pack: WorldPack): number {
  return utf8ByteLength(JSON.stringify(pack));
}

export function orderWorldPack(pack: WorldPack): WorldPack {
  return {
    ...pack,
    books: [...pack.books].sort((left, right) => left.ordinal - right.ordinal),
    rules: [...pack.rules].sort((left, right) => left.displayOrder - right.displayOrder),
    spans: [...pack.spans].sort((left, right) => left.displayOrder - right.displayOrder),
  };
}
