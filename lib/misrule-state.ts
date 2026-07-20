import type { AuditErrorResponse, AuditResultDto, FindingDto } from "@/lib/contracts";

export const stations = [
  { id: "world", primary: "World", secondary: "Overview", shortcut: "Alt+1", angle: -8 },
  { id: "rules", primary: "Rules", secondary: "Axioms", shortcut: "Alt+2", angle: -72 },
  { id: "record", primary: "Record", secondary: "Evidence", shortcut: "Alt+3", angle: 68 },
  { id: "findings", primary: "Findings", secondary: "Traces", shortcut: "Alt+4", angle: -138 },
  { id: "method", primary: "Method", secondary: "Disclosure", shortcut: "Alt+5", angle: 132 },
] as const;

export type StationId = (typeof stations)[number]["id"];
export type SelectedSource = { kind: "rule" | "span"; id: string };

export type AuditState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "complete"; result: AuditResultDto }
  | { status: "no_findings"; result: AuditResultDto }
  | { status: "failed"; error: AuditErrorResponse["error"] };

export type MisruleState = {
  entryOpen: boolean;
  selectedStation: StationId;
  selectedSource: SelectedSource | null;
  selectedFindingId: string | null;
  returnFindingId: string | null;
  drawerOpen: boolean;
  audit: AuditState;
  announcement: string;
};

export type MisruleAction =
  | { type: "ENTRY_DISMISSED" }
  | { type: "DRAWER_OPENED" }
  | { type: "DRAWER_CLOSED" }
  | { type: "STATION_SELECTED"; station: StationId }
  | { type: "FINDING_SELECTED"; findingId: string }
  | { type: "FINDING_CLEARED" }
  | { type: "SOURCE_SELECTED"; source: SelectedSource; findingId: string | null }
  | { type: "SOURCE_RETURNED" }
  | { type: "AUDIT_REQUESTED" }
  | { type: "AUDIT_SUCCEEDED"; result: AuditResultDto }
  | { type: "AUDIT_FAILED"; error: AuditErrorResponse["error"] }
  | { type: "AUDIT_FAILURE_DISMISSED" }
  | { type: "ACTIVE_WORLD_CHANGED"; title: string };

export const initialMisruleState: MisruleState = {
  entryOpen: true,
  selectedStation: "world",
  selectedSource: null,
  selectedFindingId: null,
  returnFindingId: null,
  drawerOpen: false,
  audit: { status: "idle" },
  announcement: "Misrule is ready.",
};

export function misruleReducer(state: MisruleState, action: MisruleAction): MisruleState {
  switch (action.type) {
    case "ENTRY_DISMISSED":
      return { ...state, entryOpen: false, announcement: "Misrule opened. World overview active." };
    case "DRAWER_OPENED":
      return { ...state, drawerOpen: true, announcement: "World archive opened." };
    case "DRAWER_CLOSED":
      return { ...state, drawerOpen: false, announcement: "World archive closed." };
    case "STATION_SELECTED":
      return {
        ...state,
        selectedStation: action.station,
        selectedSource: null,
        selectedFindingId: action.station === "findings" ? state.selectedFindingId : null,
        returnFindingId: action.station === "findings" ? state.returnFindingId : null,
        announcement: `${stations.find((station) => station.id === action.station)!.primary} opened.`,
      };
    case "FINDING_SELECTED":
      return { ...state, selectedStation: "findings", selectedSource: null, selectedFindingId: action.findingId, returnFindingId: null, announcement: "Finding trace opened." };
    case "FINDING_CLEARED":
      return { ...state, selectedStation: "findings", selectedSource: null, selectedFindingId: null, returnFindingId: null, announcement: "Findings index opened." };
    case "SOURCE_SELECTED":
      return {
        ...state,
        selectedStation: action.source.kind === "rule" ? "rules" : "record",
        selectedSource: action.source,
        selectedFindingId: null,
        returnFindingId: action.findingId,
        announcement: `Exact cited ${action.source.kind} ${action.source.id} opened.`,
      };
    case "SOURCE_RETURNED":
      return state.returnFindingId
        ? { ...state, selectedStation: "findings", selectedSource: null, selectedFindingId: state.returnFindingId, returnFindingId: null, announcement: "Returned to finding trace." }
        : state;
    case "AUDIT_REQUESTED":
      return { ...state, selectedSource: null, selectedFindingId: null, returnFindingId: null, audit: { status: "running" }, announcement: "Auditing rule-to-evidence paths." };
    case "AUDIT_SUCCEEDED":
      return {
        ...state,
        selectedStation: "findings",
        selectedSource: null,
        selectedFindingId: null,
        returnFindingId: null,
        audit: action.result.findings.length ? { status: "complete", result: action.result } : { status: "no_findings", result: action.result },
        announcement: action.result.findings.length ? `Audit complete. ${action.result.findings.length} audit findings.` : "Audit complete. No audit findings.",
      };
    case "AUDIT_FAILED":
      return { ...state, audit: { status: "failed", error: action.error }, announcement: action.error.message };
    case "AUDIT_FAILURE_DISMISSED":
      return { ...state, audit: { status: "idle" }, announcement: "Audit failure dismissed. No audit finding was returned." };
    case "ACTIVE_WORLD_CHANGED":
      return {
        ...state,
        entryOpen: true,
        selectedStation: "world",
        selectedSource: null,
        selectedFindingId: null,
        returnFindingId: null,
        drawerOpen: false,
        audit: { status: "idle" },
        announcement: `${action.title} mounted. World overview active.`,
      };
  }
}

export function selectAuditResult(state: MisruleState) {
  return state.audit.status === "complete" || state.audit.status === "no_findings" ? state.audit.result : null;
}

export function selectFinding(state: MisruleState): FindingDto | null {
  const result = selectAuditResult(state);
  return result?.findings.find((finding) => finding.id === state.selectedFindingId) ?? null;
}

export function selectTopology(finding: FindingDto | null) {
  if (!finding) return { topology: "none" as const };
  if (finding.kind === "contradiction") return { topology: "closed" as const, pathLength: finding.trace.length };
  return { topology: "open" as const, pathLength: finding.trace.length, missingFact: finding.missingFact! };
}

export function selectHandAngle(station: StationId) {
  return stations.find((candidate) => candidate.id === station)!.angle;
}

export function isQuietedForReading(state: MisruleState) {
  return Boolean(state.selectedFindingId) || ["rules", "record", "method"].includes(state.selectedStation);
}

export function escapeAction(state: MisruleState): MisruleAction | null {
  if (state.drawerOpen) return { type: "DRAWER_CLOSED" };
  if (state.selectedSource && state.returnFindingId) return { type: "SOURCE_RETURNED" };
  if (state.selectedFindingId) return { type: "FINDING_CLEARED" };
  return null;
}
