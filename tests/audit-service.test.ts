import { describe, expect, it } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import { publicFixtureSchema } from "@/lib/contracts";
import { AuditServiceError, MockAuditGateway, buildModelInput, executeLiveAudit, type AuditModelGateway } from "@/lib/audit-service.server";

const request = { schemaVersion: "audit-api/v1" as const, fixtureId: "ashglass-clocktower-v1", clientRequestId: "service-test", intent: { mode: "live" as const } };

describe("audit service", () => {
  it("projects only public model input", () => {
    const projected = buildModelInput(publicFixtureSchema.parse(ashglass));
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("RG-C01");
    expect(serialized).not.toContain("expected");
    expect(serialized).not.toContain("ground");
    expect(projected.rules).toHaveLength(10);
    expect(projected.spans).toHaveLength(18);
  });

  it("runs the deterministic gateway through validation and assigns server IDs", async () => {
    const response = await executeLiveAudit(request, { gateway: new MockAuditGateway() });
    expect(response.ok).toBe(true);
    expect(response.audit.source.mode).toBe("mock");
    expect(response.audit.findings.map((finding) => finding.id)).toEqual(["finding-01", "finding-02"]);
    expect(response.audit.findings.map((finding) => finding.kind)).toEqual(["contradiction", "ambiguity"]);
  });

  it("types malformed output before it reaches a client DTO", async () => {
    const gateway: AuditModelGateway = { generate: async () => ({ output: { wrong: true }, requestedModel: "broken", returnedModel: "broken", rawResponse: {} }) };
    await expect(executeLiveAudit(request, { gateway })).rejects.toMatchObject({ code: "MALFORMED_OUTPUT", status: 422 });
  });

  it("types invalid citations before normalization", async () => {
    const valid = await new MockAuditGateway().generate();
    const output = structuredClone(valid.output) as { findings: Array<{ rule_ids: string[] }> };
    output.findings[0].rule_ids[0] = "UNKNOWN-RULE";
    const gateway: AuditModelGateway = { generate: async () => ({ ...valid, output }) };
    await expect(executeLiveAudit(request, { gateway })).rejects.toMatchObject({ code: "INVALID_CITATIONS", status: 422 });
  });

  it("rejects captured intent because no truthful capture exists", async () => {
    await expect(executeLiveAudit({ ...request, intent: { mode: "captured", offerToken: "signed-but-no-capture" } }, { gateway: new MockAuditGateway() })).rejects.toEqual(expect.any(AuditServiceError));
  });
});
