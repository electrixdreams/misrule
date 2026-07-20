import type { FindingDto } from "@/lib/contracts";
import { selectHandAngle, selectTopology, type AuditState, type StationId } from "@/lib/misrule-state";

export function buildInstrumentViewModel(station: StationId, audit: AuditState, finding: FindingDto | null, quieted: boolean) {
  const auditStatus: "dormant" | "running" | "accepted" | "blocked" =
    audit.status === "running"
      ? "running"
      : audit.status === "complete" || audit.status === "no_findings"
        ? "accepted"
        : audit.status === "failed"
          ? "blocked"
          : "dormant";
  return {
    handAngle: selectHandAngle(station),
    auditStatus,
    selectedPath: selectTopology(finding),
    quieted,
  };
}
