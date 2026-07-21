import { describe, expect, it } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { worldPackSchema } from "@/lib/world-pack";
import {
  modelAuditOutputSchema,
  modelFindingFromTransport,
  modelFindingTransportFromCanonical,
  modelFindingTransportSchema,
  validateModelOutputSemantics,
} from "@/lib/model-output.server";

describe("provider output contract", () => {
  const pack = worldPackSchema.parse(ashglass);

  it("contains no provider-facing application finding ID", () => {
    const keys = Object.keys(modelAuditOutputSchema.parse(deterministicMockOutput).findings[0]);
    expect(keys).not.toContain("finding_id");
    expect(keys).not.toContain("id");
  });

  it("rejects unknown properties and invalid kind semantics", () => {
    expect(modelAuditOutputSchema.safeParse({ ...deterministicMockOutput, surprise: true }).success).toBe(false);
    const broken = structuredClone(deterministicMockOutput);
    broken.findings[0] = { ...broken.findings[0], missing_fact: "Not allowed" } as never;
    expect(modelAuditOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("accepts valid contradiction and ambiguity semantics", () => {
    const parsed = modelAuditOutputSchema.parse(deterministicMockOutput);
    expect(validateModelOutputSemantics(parsed, pack)).toEqual([]);
    expect(parsed.findings.map((finding) => finding.kind)).toEqual(["contradiction", "ambiguity"]);
  });

  it("uses a strict branch-object provider transport before canonical conversion", () => {
    const contradictionTransport = modelFindingTransportFromCanonical(modelAuditOutputSchema.parse(deterministicMockOutput).findings[0]);
    expect(contradictionTransport.supported_readings).toEqual({
      contradiction_supported: { explanation: null },
      contradiction_not_supported: { explanation: null },
    });
    expect(modelFindingFromTransport(contradictionTransport)).toMatchObject({
      ok: true,
      finding: { kind: "contradiction", supported_readings: [] },
    });

    const ambiguityTransport = modelFindingTransportFromCanonical(modelAuditOutputSchema.parse(deterministicMockOutput).findings[1]);
    expect(modelFindingTransportSchema.safeParse(ambiguityTransport).success).toBe(true);
    expect(modelFindingFromTransport(ambiguityTransport)).toMatchObject({
      ok: true,
      finding: {
        kind: "ambiguity",
        supported_readings: [
          { label: "Contradiction", outcome: "contradiction_supported" },
          { label: "No contradiction", outcome: "contradiction_not_supported" },
        ],
      },
    });
  });

  it("rejects legacy reading arrays and model-owned reading labels or outcomes at transport", () => {
    const canonicalAmbiguity = modelAuditOutputSchema.parse(deterministicMockOutput).findings[1];
    expect(modelFindingTransportSchema.safeParse(canonicalAmbiguity).success).toBe(false);
    const transport = modelFindingTransportFromCanonical(canonicalAmbiguity);
    expect(modelFindingTransportSchema.safeParse({
      ...transport,
      supported_readings: {
        ...transport.supported_readings,
        contradiction_supported: { ...transport.supported_readings.contradiction_supported, label: "model label" },
      },
    }).success).toBe(false);
    expect(modelFindingTransportSchema.safeParse({
      ...transport,
      supported_readings: {
        ...transport.supported_readings,
        contradiction_supported: { ...transport.supported_readings.contradiction_supported, outcome: "contradiction_supported" },
      },
    }).success).toBe(false);
    expect(modelFindingTransportSchema.safeParse({
      ...transport,
      supported_readings: { contradiction_supported: transport.supported_readings.contradiction_supported },
    }).success).toBe(false);
    expect(modelFindingTransportSchema.safeParse({ ...transport, surprise: true }).success).toBe(false);
  });

  it("rejects unknown rules, unknown spans, and missing cited steps", () => {
    const unknownRule = structuredClone(deterministicMockOutput);
    unknownRule.findings[0].rule_ids[0] = "NO-RULE";
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(unknownRule), pack).map((issue) => issue.code)).toContain("UNKNOWN_RULE");

    const unknownSpan = structuredClone(deterministicMockOutput);
    unknownSpan.findings[0].span_ids[0] = "NO-SPAN";
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(unknownSpan), pack).map((issue) => issue.code)).toContain("UNKNOWN_SPAN");

    const missingStep = structuredClone(deterministicMockOutput);
    missingStep.findings[0].path_steps = missingStep.findings[0].path_steps.filter((step) => step.ref_id !== "RG-S02");
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(missingStep), pack).map((issue) => issue.code)).toContain("CITED_SPAN_NOT_TRACED");
  });

  it("rejects a trace reference omitted from its citation array", () => {
    const broken = structuredClone(deterministicMockOutput);
    broken.findings[0].rule_ids = ["RG-R03"];
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(broken), pack).map((issue) => issue.code)).toContain("RULE_STEP_NOT_CITED");
  });

  it("rejects duplicate final findings by kind and cited evidence sets", () => {
    const duplicated = structuredClone(deterministicMockOutput);
    duplicated.findings.push(structuredClone(duplicated.findings[0]));
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(duplicated), pack).map((issue) => issue.code)).toContain("DUPLICATE_FINDING");
  });

  it("requires ambiguity missing facts to be a binary Whether predicate", () => {
    const valid = modelAuditOutputSchema.parse(deterministicMockOutput);
    expect(validateModelOutputSemantics(valid, pack).map((issue) => issue.code)).not.toContain("AMBIGUITY_MISSING_FACT_NOT_BINARY");
    for (const missingFact of [
      "How the return happened.",
      "Why the gate opened.",
      "The exact nature and origin of the figure.",
      "What mechanism caused the event.",
    ]) {
      const broken = structuredClone(valid);
      broken.findings[1].missing_fact = missingFact;
      expect(validateModelOutputSemantics(broken, pack).map((issue) => issue.code)).toContain("AMBIGUITY_MISSING_FACT_NOT_BINARY");
    }
  });
});
