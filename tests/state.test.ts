import { describe, expect, it } from "vitest";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { publicFixtureSchema } from "@/lib/contracts";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import { MockAuditGateway, executeLiveAudit } from "@/lib/audit-service.server";
import { buildInstrumentViewModel } from "@/lib/presentation";
import { escapeAction, initialMisruleState, misruleReducer, selectFinding, stations } from "@/lib/misrule-state";

describe("Misrule reducer and presentation", () => {
  it("maps exactly five stations to stable alignments", () => {
    expect(stations).toHaveLength(5);
    expect(stations.map((station) => station.id)).toEqual(["world", "rules", "record", "findings", "method"]);
    expect(new Set(stations.map((station) => station.angle)).size).toBe(5);
  });

  it("clears stale source and finding selection on a new audit", () => {
    const selected = { ...initialMisruleState, selectedFindingId: "finding-01", selectedSource: { kind: "rule" as const, id: "RG-R03" }, returnFindingId: "finding-01" };
    const next = misruleReducer(selected, { type: "AUDIT_REQUESTED" });
    expect(next.selectedFindingId).toBeNull();
    expect(next.selectedSource).toBeNull();
    expect(next.returnFindingId).toBeNull();
    expect(next.audit.status).toBe("running");
  });

  it("preserves finding context across a citation jump and return", () => {
    let state = misruleReducer(initialMisruleState, { type: "FINDING_SELECTED", findingId: "finding-01" });
    state = misruleReducer(state, { type: "SOURCE_SELECTED", source: { kind: "span", id: "RG-S01" }, findingId: "finding-01" });
    expect(state.selectedStation).toBe("record");
    expect(escapeAction(state)).toEqual({ type: "SOURCE_RETURNED" });
    state = misruleReducer(state, { type: "SOURCE_RETURNED" });
    expect(state.selectedFindingId).toBe("finding-01");
    expect(state.selectedStation).toBe("findings");
  });

  it("derives closed and open topology from kind, never Ashglass IDs", async () => {
    publicFixtureSchema.parse(ashglass);
    const response = await executeLiveAudit(
      { schemaVersion: "audit-api/v1", fixtureId: "ashglass-clocktower-v1", clientRequestId: "test-request", intent: { mode: "live" } },
      { gateway: new MockAuditGateway() },
    );
    let state = misruleReducer(initialMisruleState, { type: "AUDIT_SUCCEEDED", result: response.audit });
    state = misruleReducer(state, { type: "FINDING_SELECTED", findingId: "finding-01" });
    expect(buildInstrumentViewModel("findings", state.audit, selectFinding(state), true).selectedPath.topology).toBe("closed");
    state = misruleReducer(state, { type: "FINDING_SELECTED", findingId: "finding-02" });
    expect(buildInstrumentViewModel("findings", state.audit, selectFinding(state), true).selectedPath.topology).toBe("open");
    expect(JSON.stringify(deterministicMockOutput)).not.toContain("finding-01");
  });
});
