import "server-only";

import { z } from "zod";
import type { WorldPack } from "@/lib/world-pack";

const text = z.string().trim().min(1).max(4_000);
const referenceId = z.string().trim().min(1).max(96);

const ruleTraceStepSchema = z
  .object({ kind: z.literal("rule"), ref_id: referenceId, text })
  .strict();
const spanTraceStepSchema = z
  .object({ kind: z.literal("span"), ref_id: referenceId, text })
  .strict();
const inferenceTraceStepSchema = z
  .object({ kind: z.literal("inference"), ref_id: z.null(), text })
  .strict();

const traceStepSchema = z.discriminatedUnion("kind", [ruleTraceStepSchema, spanTraceStepSchema, inferenceTraceStepSchema]);
const supportedReadingSchema = z
  .object({
    label: text,
    outcome: z.enum(["contradiction_supported", "contradiction_not_supported"]),
    explanation: text,
  })
  .strict();

const findingBase = {
  title: text,
  rule_ids: z.array(referenceId).min(1).max(12),
  span_ids: z.array(referenceId).min(1).max(20),
  path_steps: z.array(traceStepSchema).min(1).max(40),
  explanation: text,
};

const contradictionSchema = z
  .object({
    kind: z.literal("contradiction"),
    ...findingBase,
    missing_fact: z.null(),
    why_unresolved: z.null(),
    supported_readings: z.array(supportedReadingSchema).length(0),
  })
  .strict();

const ambiguitySchema = z
  .object({
    kind: z.literal("ambiguity"),
    ...findingBase,
    missing_fact: text,
    why_unresolved: text,
    supported_readings: z.array(supportedReadingSchema).length(2),
  })
  .strict();

export const modelFindingSchema = z.discriminatedUnion("kind", [contradictionSchema, ambiguitySchema]);

// Some OpenAI-compatible providers reject deeply constrained JSON Schemas even
// though they support strict structured output. Keep the transport schema
// structural and provider-portable; modelAuditOutputSchema remains the
// canonical boundary and is always applied before semantic validation.
const transportPathStepSchema = z
  .object({
    kind: z.enum(["rule", "span", "inference"]),
    ref_id: z.string().nullable(),
    text: z.string(),
  })
  .strict();

const transportSupportedReadingBranchSchema = z
  .object({
    explanation: z.string().nullable(),
  })
  .strict();

const transportSupportedReadingsSchema = z
  .object({
    contradiction_supported: transportSupportedReadingBranchSchema,
    contradiction_not_supported: transportSupportedReadingBranchSchema,
  })
  .strict();

export const modelFindingTransportSchema = z
  .object({
    kind: z.enum(["contradiction", "ambiguity"]),
    title: z.string(),
    rule_ids: z.array(z.string()),
    span_ids: z.array(z.string()),
    path_steps: z.array(transportPathStepSchema),
    explanation: z.string(),
    missing_fact: z.string().nullable(),
    why_unresolved: z.string().nullable(),
    supported_readings: transportSupportedReadingsSchema,
  })
  .strict();

export const modelAuditTransportSchema = z
  .object({
    schema_version: z.literal("model-output/v1"),
    findings: z.array(modelFindingTransportSchema),
    unresolved_questions: z.array(z.string()),
  })
  .strict();

export const modelAuditOutputSchema = z
  .object({
    schema_version: z.literal("model-output/v1"),
    findings: z.array(modelFindingSchema).max(12),
    unresolved_questions: z.array(text).max(20),
  })
  .strict();

export type ModelFinding = z.infer<typeof modelFindingSchema>;
export type ModelAuditOutput = z.infer<typeof modelAuditOutputSchema>;
export type ModelFindingTransport = z.infer<typeof modelFindingTransportSchema>;
export type ModelAuditTransport = z.infer<typeof modelAuditTransportSchema>;

export type TransportConversionIssue = {
  code: "INVALID_TRANSPORT_SEMANTICS";
  path: Array<string | number>;
  message: string;
};

export type SemanticValidationIssue = {
  findingIndex: number;
  code:
    | "DUPLICATE_CITATION"
    | "UNKNOWN_RULE"
    | "UNKNOWN_SPAN"
    | "RULE_STEP_NOT_CITED"
    | "SPAN_STEP_NOT_CITED"
    | "CITED_RULE_NOT_TRACED"
    | "CITED_SPAN_NOT_TRACED"
    | "INVALID_READING_OUTCOMES"
    | "AMBIGUITY_MISSING_FACT_NOT_BINARY"
    | "DUPLICATE_FINDING";
  message: string;
};

function duplicates(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function transportIssue(path: Array<string | number>, message: string): TransportConversionIssue {
  return { code: "INVALID_TRANSPORT_SEMANTICS", path, message };
}

function transportIssuePath(path: PropertyKey[]): Array<string | number> {
  return path.filter((part): part is string | number => typeof part === "string" || typeof part === "number");
}

function nonEmptyTransportText(value: string | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export function modelFindingFromTransport(
  finding: ModelFindingTransport,
  findingIndex = 0,
  basePath: Array<string | number> = ["findings", findingIndex],
): { ok: true; finding: ModelFinding } | { ok: false; issues: TransportConversionIssue[] } {
  const issues: TransportConversionIssue[] = [];

  if (finding.kind === "contradiction") {
    if (finding.missing_fact !== null) issues.push(transportIssue([...basePath, "missing_fact"], "Contradictions must use null missing_fact."));
    if (finding.why_unresolved !== null) issues.push(transportIssue([...basePath, "why_unresolved"], "Contradictions must use null why_unresolved."));
    if (finding.supported_readings.contradiction_supported.explanation !== null) {
      issues.push(transportIssue([...basePath, "supported_readings", "contradiction_supported", "explanation"], "Contradictions must use null contradiction_supported explanation."));
    }
    if (finding.supported_readings.contradiction_not_supported.explanation !== null) {
      issues.push(transportIssue([...basePath, "supported_readings", "contradiction_not_supported", "explanation"], "Contradictions must use null contradiction_not_supported explanation."));
    }
    if (issues.length > 0) return { ok: false, issues };
    const canonical = { ...finding, missing_fact: null, why_unresolved: null, supported_readings: [] };
    const parsed = modelFindingSchema.safeParse(canonical);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => transportIssue(transportIssuePath(issue.path), issue.message)) };
    return { ok: true, finding: parsed.data };
  }

  if (!nonEmptyTransportText(finding.missing_fact)) issues.push(transportIssue([...basePath, "missing_fact"], "Ambiguities must use a non-empty missing_fact."));
  if (!nonEmptyTransportText(finding.why_unresolved)) issues.push(transportIssue([...basePath, "why_unresolved"], "Ambiguities must use a non-empty why_unresolved."));
  const supportedExplanation = finding.supported_readings.contradiction_supported.explanation;
  const notSupportedExplanation = finding.supported_readings.contradiction_not_supported.explanation;
  if (!nonEmptyTransportText(supportedExplanation)) {
    issues.push(transportIssue([...basePath, "supported_readings", "contradiction_supported", "explanation"], "Ambiguities must explain the contradiction-supported branch."));
  }
  if (!nonEmptyTransportText(notSupportedExplanation)) {
    issues.push(transportIssue([...basePath, "supported_readings", "contradiction_not_supported", "explanation"], "Ambiguities must explain the contradiction-not-supported branch."));
  }
  if (issues.length > 0) return { ok: false, issues };

  const canonical = {
    ...finding,
    missing_fact: finding.missing_fact,
    why_unresolved: finding.why_unresolved,
    supported_readings: [
      {
        label: "Contradiction",
        outcome: "contradiction_supported" as const,
        explanation: supportedExplanation,
      },
      {
        label: "No contradiction",
        outcome: "contradiction_not_supported" as const,
        explanation: notSupportedExplanation,
      },
    ],
  };
  const parsed = modelFindingSchema.safeParse(canonical);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => transportIssue(transportIssuePath(issue.path), issue.message)) };
  return { ok: true, finding: parsed.data };
}

export function modelAuditOutputFromTransport(output: ModelAuditTransport): { ok: true; output: ModelAuditOutput } | { ok: false; issues: TransportConversionIssue[] } {
  const findings: ModelFinding[] = [];
  const issues: TransportConversionIssue[] = [];
  for (const [index, finding] of output.findings.entries()) {
    const converted = modelFindingFromTransport(finding, index);
    if (converted.ok) findings.push(converted.finding);
    else issues.push(...converted.issues);
  }
  if (issues.length > 0) return { ok: false, issues };
  const canonical = { schema_version: "model-output/v1" as const, findings, unresolved_questions: output.unresolved_questions };
  const parsed = modelAuditOutputSchema.safeParse(canonical);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => transportIssue(transportIssuePath(issue.path), issue.message)) };
  return { ok: true, output: parsed.data };
}

export function modelFindingTransportFromCanonical(finding: ModelFinding): ModelFindingTransport {
  if (finding.kind === "contradiction") {
    return {
      ...finding,
      supported_readings: {
        contradiction_supported: { explanation: null },
        contradiction_not_supported: { explanation: null },
      },
    };
  }
  const supported = finding.supported_readings.find((reading) => reading.outcome === "contradiction_supported");
  const notSupported = finding.supported_readings.find((reading) => reading.outcome === "contradiction_not_supported");
  return {
    ...finding,
    supported_readings: {
      contradiction_supported: { explanation: supported?.explanation ?? "" },
      contradiction_not_supported: { explanation: notSupported?.explanation ?? "" },
    },
  };
}

export function modelAuditTransportFromCanonical(output: ModelAuditOutput): ModelAuditTransport {
  return {
    schema_version: "model-output/v1",
    findings: output.findings.map(modelFindingTransportFromCanonical),
    unresolved_questions: output.unresolved_questions,
  };
}

export function validateModelOutputSemantics(output: ModelAuditOutput, pack: WorldPack): SemanticValidationIssue[] {
  const issues: SemanticValidationIssue[] = [];
  const knownRules = new Set(pack.rules.map((rule) => rule.ruleId));
  const knownSpans = new Set(pack.spans.map((span) => span.spanId));
  const seenFindings = new Map<string, number>();

  output.findings.forEach((finding, findingIndex) => {
    const identity = `${finding.kind}|${[...finding.rule_ids].sort().join(",")}|${[...finding.span_ids].sort().join(",")}`;
    const firstIndex = seenFindings.get(identity);
    if (firstIndex !== undefined) {
      issues.push({
        findingIndex,
        code: "DUPLICATE_FINDING",
        message: `Finding duplicates finding ${firstIndex + 1} by kind and cited evidence sets.`,
      });
    } else {
      seenFindings.set(identity, findingIndex);
    }

    for (const duplicate of [...duplicates(finding.rule_ids), ...duplicates(finding.span_ids)]) {
      issues.push({ findingIndex, code: "DUPLICATE_CITATION", message: `Citation ${duplicate} is duplicated.` });
    }
    for (const ruleId of finding.rule_ids) {
      if (!knownRules.has(ruleId)) issues.push({ findingIndex, code: "UNKNOWN_RULE", message: `Rule ${ruleId} does not exist.` });
    }
    for (const spanId of finding.span_ids) {
      if (!knownSpans.has(spanId)) issues.push({ findingIndex, code: "UNKNOWN_SPAN", message: `Span ${spanId} does not exist.` });
    }

    const tracedRules = new Set<string>();
    const tracedSpans = new Set<string>();
    for (const step of finding.path_steps) {
      if (step.kind === "rule") {
        tracedRules.add(step.ref_id);
        if (!finding.rule_ids.includes(step.ref_id)) issues.push({ findingIndex, code: "RULE_STEP_NOT_CITED", message: `Rule step ${step.ref_id} is absent from rule_ids.` });
      }
      if (step.kind === "span") {
        tracedSpans.add(step.ref_id);
        if (!finding.span_ids.includes(step.ref_id)) issues.push({ findingIndex, code: "SPAN_STEP_NOT_CITED", message: `Span step ${step.ref_id} is absent from span_ids.` });
      }
    }
    for (const ruleId of finding.rule_ids) {
      if (!tracedRules.has(ruleId)) issues.push({ findingIndex, code: "CITED_RULE_NOT_TRACED", message: `Cited rule ${ruleId} is absent from the path.` });
    }
    for (const spanId of finding.span_ids) {
      if (!tracedSpans.has(spanId)) issues.push({ findingIndex, code: "CITED_SPAN_NOT_TRACED", message: `Cited span ${spanId} is absent from the path.` });
    }

    if (finding.kind === "ambiguity") {
      if (!finding.missing_fact.trim().startsWith("Whether ")) {
        issues.push({
          findingIndex,
          code: "AMBIGUITY_MISSING_FACT_NOT_BINARY",
          message: "Ambiguity missing_fact must be one binary predicate beginning with Whether .",
        });
      }
      const outcomes = new Set(finding.supported_readings.map((reading) => reading.outcome));
      if (!outcomes.has("contradiction_supported") || !outcomes.has("contradiction_not_supported")) {
        issues.push({ findingIndex, code: "INVALID_READING_OUTCOMES", message: "Ambiguity must include one supported and one unsupported contradiction reading." });
      }
    }
  });

  return issues;
}
