import { describe, expect, it } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { publicFixtureSchema } from "@/lib/contracts";
import { modelAuditOutputSchema, validateModelOutputSemantics } from "@/lib/model-output.server";

describe("provider output contract", () => {
  const fixture = publicFixtureSchema.parse(ashglass);

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
    expect(validateModelOutputSemantics(parsed, fixture)).toEqual([]);
    expect(parsed.findings.map((finding) => finding.kind)).toEqual(["contradiction", "ambiguity"]);
  });

  it("rejects unknown rules, unknown spans, and missing cited steps", () => {
    const unknownRule = structuredClone(deterministicMockOutput);
    unknownRule.findings[0].rule_ids[0] = "NO-RULE";
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(unknownRule), fixture).map((issue) => issue.code)).toContain("UNKNOWN_RULE");

    const unknownSpan = structuredClone(deterministicMockOutput);
    unknownSpan.findings[0].span_ids[0] = "NO-SPAN";
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(unknownSpan), fixture).map((issue) => issue.code)).toContain("UNKNOWN_SPAN");

    const missingStep = structuredClone(deterministicMockOutput);
    missingStep.findings[0].path_steps = missingStep.findings[0].path_steps.filter((step) => step.ref_id !== "RG-S02");
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(missingStep), fixture).map((issue) => issue.code)).toContain("CITED_SPAN_NOT_TRACED");
  });

  it("rejects a trace reference omitted from its citation array", () => {
    const broken = structuredClone(deterministicMockOutput);
    broken.findings[0].rule_ids = ["RG-R03"];
    expect(validateModelOutputSemantics(modelAuditOutputSchema.parse(broken), fixture).map((issue) => issue.code)).toContain("RULE_STEP_NOT_CITED");
  });
});
