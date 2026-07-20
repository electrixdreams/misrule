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

const transportSupportedReadingSchema = z
  .object({
    label: z.string(),
    outcome: z.enum(["contradiction_supported", "contradiction_not_supported"]),
    explanation: z.string(),
  })
  .strict();

const transportFindingSchema = z
  .object({
    kind: z.enum(["contradiction", "ambiguity"]),
    title: z.string(),
    rule_ids: z.array(z.string()),
    span_ids: z.array(z.string()),
    path_steps: z.array(transportPathStepSchema),
    explanation: z.string(),
    missing_fact: z.string().nullable(),
    why_unresolved: z.string().nullable(),
    supported_readings: z.array(transportSupportedReadingSchema),
  })
  .strict();

export const modelAuditTransportSchema = z
  .object({
    schema_version: z.literal("model-output/v1"),
    findings: z.array(transportFindingSchema),
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
    | "INVALID_READING_OUTCOMES";
  message: string;
};

function duplicates(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export function validateModelOutputSemantics(output: ModelAuditOutput, pack: WorldPack): SemanticValidationIssue[] {
  const issues: SemanticValidationIssue[] = [];
  const knownRules = new Set(pack.rules.map((rule) => rule.ruleId));
  const knownSpans = new Set(pack.spans.map((span) => span.spanId));

  output.findings.forEach((finding, findingIndex) => {
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
      const outcomes = new Set(finding.supported_readings.map((reading) => reading.outcome));
      if (!outcomes.has("contradiction_supported") || !outcomes.has("contradiction_not_supported")) {
        issues.push({ findingIndex, code: "INVALID_READING_OUTCOMES", message: "Ambiguity must include one supported and one unsupported contradiction reading." });
      }
    }
  });

  return issues;
}
