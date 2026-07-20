import { z } from "zod";

const id = z.string().trim().min(1).max(96);
const nonEmpty = z.string().trim().min(1).max(4_000);

export const ruleTypeSchema = z.enum(["fact", "constraint", "temporal", "conditional"]);

const worldMetadataSchema = z
  .object({
    worldId: id,
    slug: id,
    title: nonEmpty,
    premise: nonEmpty,
    summary: nonEmpty,
    tags: z.array(nonEmpty).max(12),
  })
  .strict();

const bookMetadataSchema = z
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

const ruleScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("world"), worldId: id }).strict(),
  z.object({ kind: z.literal("book"), bookId: id }).strict(),
]);

const worldRuleSchema = z
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

const narrativeSourceSchema = z
  .object({
    label: nonEmpty,
    scene: nonEmpty,
    chapter: nonEmpty.optional(),
  })
  .strict();

const narrativeSpanSchema = z
  .object({
    spanId: id,
    worldId: id,
    bookId: id,
    source: narrativeSourceSchema,
    text: nonEmpty,
    displayOrder: z.number().int().nonnegative(),
  })
  .strict();

export const publicFixtureSchema = z
  .object({
    schemaVersion: z.literal("fixture/v1"),
    fixtureId: id,
    fixtureVersion: nonEmpty,
    title: nonEmpty,
    description: nonEmpty,
    synthetic: z.boolean(),
    disclosure: nonEmpty,
    world: worldMetadataSchema,
    books: z.array(bookMetadataSchema).min(1).max(12),
    rules: z.array(worldRuleSchema).min(1).max(100),
    spans: z.array(narrativeSpanSchema).min(1).max(250),
  })
  .strict();

export type PublicFixture = z.infer<typeof publicFixtureSchema>;
export type RuleType = z.infer<typeof ruleTypeSchema>;
export type WorldRule = PublicFixture["rules"][number];
export type NarrativeSpan = PublicFixture["spans"][number];

export type FixtureValidationIssue = { path: string; message: string };

export function validateFixture(fixture: PublicFixture): FixtureValidationIssue[] {
  const issues: FixtureValidationIssue[] = [];
  const worldId = fixture.world.worldId;
  const bookIds = new Set(fixture.books.map((book) => book.bookId));
  const seenBookIds = new Set<string>();
  const ruleIds = new Set<string>();
  const spanIds = new Set<string>();
  const bookOrdinals = new Set<number>();
  const ruleOrders = new Set<number>();
  const spanOrders = new Set<number>();

  for (const book of fixture.books) {
    if (seenBookIds.has(book.bookId)) issues.push({ path: `books.${book.bookId}`, message: "Duplicate book ID." });
    seenBookIds.add(book.bookId);
    if (book.worldId !== worldId) issues.push({ path: `books.${book.bookId}`, message: "Book belongs to another world." });
    if (bookOrdinals.has(book.ordinal)) issues.push({ path: `books.${book.bookId}.ordinal`, message: "Duplicate book ordinal." });
    bookOrdinals.add(book.ordinal);
  }

  for (const rule of fixture.rules) {
    if (ruleIds.has(rule.ruleId)) issues.push({ path: `rules.${rule.ruleId}`, message: "Duplicate rule ID." });
    ruleIds.add(rule.ruleId);
    if (rule.worldId !== worldId) issues.push({ path: `rules.${rule.ruleId}.worldId`, message: "Rule belongs to another world." });
    if (rule.scope.kind === "world" && rule.scope.worldId !== worldId) issues.push({ path: `rules.${rule.ruleId}.scope`, message: "World-scoped rule references another world." });
    if (rule.scope.kind === "book" && !bookIds.has(rule.scope.bookId)) issues.push({ path: `rules.${rule.ruleId}.scope`, message: "Book-scoped rule references an unknown book." });
    if (ruleOrders.has(rule.displayOrder)) issues.push({ path: `rules.${rule.ruleId}.displayOrder`, message: "Duplicate rule display order." });
    ruleOrders.add(rule.displayOrder);
  }

  for (const span of fixture.spans) {
    if (spanIds.has(span.spanId)) issues.push({ path: `spans.${span.spanId}`, message: "Duplicate span ID." });
    spanIds.add(span.spanId);
    if (span.worldId !== worldId) issues.push({ path: `spans.${span.spanId}.worldId`, message: "Span belongs to another world." });
    if (!bookIds.has(span.bookId)) issues.push({ path: `spans.${span.spanId}.bookId`, message: "Span references an unknown book." });
    if (spanOrders.has(span.displayOrder)) issues.push({ path: `spans.${span.spanId}.displayOrder`, message: "Duplicate span display order." });
    spanOrders.add(span.displayOrder);
  }

  return issues;
}

const sourceReferenceSchema = z.object({ id, label: nonEmpty }).strict();
const traceStepDtoSchema = z
  .object({
    ordinal: z.number().int().positive(),
    kind: z.enum(["rule", "span", "inference"]),
    refId: id.nullable(),
    text: nonEmpty,
  })
  .strict();
const supportedReadingDtoSchema = z
  .object({
    label: nonEmpty,
    outcome: z.enum(["contradiction_supported", "contradiction_not_supported"]),
    explanation: nonEmpty,
  })
  .strict();

export const findingDtoSchema = z
  .object({
    id,
    kind: z.enum(["contradiction", "ambiguity"]),
    title: nonEmpty,
    ruleRefs: z.array(sourceReferenceSchema).min(1),
    spanRefs: z.array(sourceReferenceSchema).min(1),
    trace: z.array(traceStepDtoSchema).min(1),
    explanation: nonEmpty,
    missingFact: nonEmpty.nullable(),
    whyUnresolved: nonEmpty.nullable(),
    supportedReadings: z.array(supportedReadingDtoSchema).max(2),
  })
  .strict();

export const auditResultDtoSchema = z
  .object({
    schemaVersion: z.literal("audit-api/v1"),
    auditId: id,
    fixtureId: id,
    fixtureVersion: nonEmpty,
    createdAt: z.iso.datetime({ offset: true }),
    source: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("live"), requestedModel: nonEmpty, model: nonEmpty }).strict(),
      z.object({ mode: z.literal("mock"), requestedModel: z.literal("deterministic-mock"), model: z.literal("deterministic-mock") }).strict(),
      z
        .object({
          mode: z.literal("captured"),
          requestedModel: nonEmpty,
          model: nonEmpty,
          capturedAt: z.iso.datetime({ offset: true }),
          fallbackReason: z.enum(["upstream_timeout", "upstream_rate_limit", "upstream_unavailable", "network_failure"]),
        })
        .strict(),
    ]),
    findings: z.array(findingDtoSchema),
    unresolvedQuestions: z.array(nonEmpty).max(20),
  })
  .strict();

export type FindingDto = z.infer<typeof findingDtoSchema>;
export type AuditResultDto = z.infer<typeof auditResultDtoSchema>;

export const auditProviderSchema = z.enum(["openrouter", "openai-compatible"]);

export const runtimeSettingsSchema = z
  .object({
    provider: auditProviderSchema,
    apiEndpoint: z.url().trim().max(500),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict();

export const publicRuntimeDefaultsSchema = z
  .object({
    provider: auditProviderSchema,
    apiEndpoint: z.url().trim().max(500),
    model: z.string().trim().min(1).max(200),
    hasServerApiKey: z.boolean(),
    allowedEndpointHosts: z.array(z.string().trim().min(1).max(253)).min(1).max(24),
  })
  .strict();

export type AuditProvider = z.infer<typeof auditProviderSchema>;
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;
export type PublicRuntimeDefaults = z.infer<typeof publicRuntimeDefaultsSchema>;

export const auditRequestSchema = z
  .object({
    schemaVersion: z.literal("audit-api/v1"),
    fixtureId: id,
    clientRequestId: id,
    intent: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("live") }).strict(),
      z.object({ mode: z.literal("captured"), offerToken: nonEmpty }).strict(),
    ]),
    runtime: runtimeSettingsSchema.optional(),
  })
  .strict();

export type AuditRequest = z.infer<typeof auditRequestSchema>;

export const auditErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "FIXTURE_NOT_FOUND",
  "FIXTURE_INVALID",
  "SERVICE_MISCONFIGURED",
  "UPSTREAM_AUTH_ERROR",
  "UPSTREAM_REQUEST_REJECTED",
  "UPSTREAM_RATE_LIMIT",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "MODEL_REFUSAL",
  "MODEL_OUTPUT_INCOMPLETE",
  "MALFORMED_OUTPUT",
  "INVALID_CITATIONS",
  "FALLBACK_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type AuditErrorCode = z.infer<typeof auditErrorCodeSchema>;

const fallbackOfferSchema = z
  .object({
    token: nonEmpty,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const auditSuccessResponseSchema = z
  .object({
    ok: z.literal(true),
    requestId: id,
    audit: auditResultDtoSchema,
    timing: z.object({ totalMs: z.number().int().nonnegative() }).strict(),
  })
  .strict();

export const auditErrorResponseSchema = z
  .object({
    ok: z.literal(false),
    requestId: id,
    error: z
      .object({
        code: auditErrorCodeSchema,
        message: nonEmpty,
        retryable: z.boolean(),
        fallbackOffer: fallbackOfferSchema.nullable(),
        incidentId: id.optional(),
      })
      .strict(),
  })
  .strict();

export type AuditSuccessResponse = z.infer<typeof auditSuccessResponseSchema>;
export type AuditErrorResponse = z.infer<typeof auditErrorResponseSchema>;
export type AuditResponse = AuditSuccessResponse | AuditErrorResponse;
