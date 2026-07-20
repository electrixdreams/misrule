"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { PublicFixture, PublicRuntimeDefaults, RuntimeSettings } from "@/lib/contracts";
import { requestAudit } from "@/lib/audit-client";
import { ArchiveLeaf } from "@/components/ArchiveLeaf";
import { AuditFailureDialog } from "@/components/AuditFailureDialog";
import { AuditCurtain } from "@/components/AuditCurtain";
import { ClockworkInstrument } from "@/components/ClockworkInstrument";
import { WorldDrawer } from "@/components/WorldDrawer";
import { RuntimeSettingsDialog } from "@/components/RuntimeSettingsDialog";
import { buildInstrumentViewModel } from "@/lib/presentation";
import {
  escapeAction,
  initialMisruleState,
  isQuietedForReading,
  misruleReducer,
  selectAuditResult,
  selectFinding,
  stations,
  type StationId,
} from "@/lib/misrule-state";

export function MisruleApp({
  fixture,
  runtimeDefaults = {
    provider: "openrouter",
    apiEndpoint: "https://openrouter.ai/api/v1",
    model: "openai/gpt-oss-120b:free",
    hasServerApiKey: false,
    allowedEndpointHosts: ["openrouter.ai", "api.openai.com"],
  },
  auditMode = "live",
}: {
  fixture: PublicFixture;
  runtimeDefaults?: PublicRuntimeDefaults;
  auditMode?: "live" | "mock";
}) {
  const [state, dispatch] = useReducer(misruleReducer, initialMisruleState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>({
    provider: runtimeDefaults.provider,
    apiEndpoint: runtimeDefaults.apiEndpoint,
    model: runtimeDefaults.model,
  });
  const abortRef = useRef<AbortController | null>(null);
  const auditReturnFocusRef = useRef<HTMLElement | null>(null);
  const entryButtonRef = useRef<HTMLButtonElement | null>(null);
  const result = selectAuditResult(state);
  const finding = selectFinding(state);
  const instrument = useMemo(
    () => buildInstrumentViewModel(state.selectedStation, state.audit, finding, isQuietedForReading(state)),
    [state, finding],
  );

  const runAudit = useCallback(async () => {
    abortRef.current?.abort();
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest(".audit-failure-dialog")) {
      auditReturnFocusRef.current = document.activeElement;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "AUDIT_REQUESTED" });
    try {
      const response = await requestAudit(fixture.fixtureId, runtimeSettings, controller.signal);
      if (response.ok) dispatch({ type: "AUDIT_SUCCEEDED", result: response.audit });
      else dispatch({ type: "AUDIT_FAILED", error: response.error });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({
        type: "AUDIT_FAILED",
        error: { code: "UPSTREAM_UNAVAILABLE", message: "The live audit service could not be reached.", retryable: true, fallbackOffer: null },
      });
    }
  }, [fixture.fixtureId, runtimeSettings]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const action = escapeAction(state);
        if (action) {
          event.preventDefault();
          dispatch(action);
        }
      }
      if (event.altKey && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        dispatch({ type: "STATION_SELECTED", station: stations[Number(event.key) - 1].id });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [state]);

  useEffect(() => {
    if (!state.selectedSource) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(state.selectedSource!.id);
      target?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      target?.focus({ preventScroll: true });
    });
  }, [state.selectedSource]);

  const auditStatus = state.audit.status;
  const resultSourceStatus = result
    ? result.source.mode === "live"
      ? "Validated live response"
      : result.source.mode === "mock"
        ? "Deterministic mock · not live"
        : "Captured fallback disclosed"
    : null;
  const status =
    auditStatus === "running"
      ? ["Auditing paths", "Indeterminate · awaiting a real response"]
      : auditStatus === "complete"
        ? [`${state.audit.result.findings.length} findings accepted`, resultSourceStatus!]
        : auditStatus === "no_findings"
          ? ["No findings accepted", resultSourceStatus!]
          : auditStatus === "failed"
            ? ["Audit blocked", state.audit.error.code.replaceAll("_", " ").toLowerCase()]
            : ["The world is still", auditMode === "mock" ? "Synthetic fixture · mock gateway disclosed" : "Live server route selected · access checked on request"];

  function selectStation(station: StationId) {
    dispatch({ type: "STATION_SELECTED", station });
    document.getElementById("leaf-content")?.focus({ preventScroll: true });
  }

  return (
    <main className="misrule-shell" data-quieted={instrument.quieted || undefined}>
      <a className="skip-link" href="#leaf-content">Skip to archive leaf</a>

      <button className="world-seal" type="button" onClick={() => dispatch({ type: "DRAWER_OPENED" })} aria-haspopup="dialog">
        <i aria-hidden="true" />
        <span><strong>Misrule</strong><small>Ashglass Clocktower<br />World archive I</small></span>
      </button>

      <div className="status-plaque" data-state={instrument.auditStatus} role="status">
        <i aria-hidden="true" /><span><strong>{status[0]}</strong><small>{status[1]}</small></span>
      </div>

      <button className="settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
        <span>Settings</span>
        <small>{runtimeSettings.provider === "openrouter" ? "OpenRouter" : "Compatible API"} · {runtimeSettings.model}</small>
      </button>

      <div className="workspace">
        <ClockworkInstrument
          selectedStation={state.selectedStation}
          handAngle={instrument.handAngle}
          auditStatus={instrument.auditStatus}
          topology={instrument.selectedPath.topology}
          quieted={instrument.quieted}
          running={auditStatus === "running"}
          auditMode={auditMode}
          onStation={selectStation}
          onAudit={runAudit}
        />
        <ArchiveLeaf
          fixture={fixture}
          station={state.selectedStation}
          selectedSource={state.selectedSource}
          finding={finding}
          result={result}
          auditStatus={auditStatus}
          onFinding={(findingId) => dispatch({ type: "FINDING_SELECTED", findingId })}
          onFindingBack={() => dispatch({ type: "FINDING_CLEARED" })}
          onCitation={(kind, id) => dispatch({ type: "SOURCE_SELECTED", source: { kind, id }, findingId: finding?.id ?? null })}
          onSourceReturn={() => dispatch({ type: "SOURCE_RETURNED" })}
        />
      </div>

      {state.entryOpen ? (
        <section
          className="entry-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="entry-title"
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              entryButtonRef.current?.focus();
            }
          }}
        >
          <div className="entry-tower" aria-hidden="true" />
          <div>
            <span>The Ashglass Clocktower · synthetic fixture</span>
            <h2 id="entry-title">Misrule</h2>
            <p className="entry-tagline">Find where the world turns against itself.</p>
            <p>Enter a literary reasoning instrument: world rules, narrative evidence, closed contradictions, and the facts the record still withholds.</p>
            <button ref={entryButtonRef} autoFocus type="button" onClick={() => dispatch({ type: "ENTRY_DISMISSED" })}>Open the Ashglass archive</button>
            <small>Inspectable fictional-world rule audit</small>
          </div>
        </section>
      ) : null}

      <WorldDrawer fixture={fixture} open={state.drawerOpen} onClose={() => dispatch({ type: "DRAWER_CLOSED" })} />
      <RuntimeSettingsDialog
        open={settingsOpen}
        settings={runtimeSettings}
        defaults={runtimeDefaults}
        onClose={() => setSettingsOpen(false)}
        onSave={(settings) => {
          setRuntimeSettings(settings);
          setSettingsOpen(false);
        }}
      />
      <AuditCurtain open={auditStatus === "running"} auditMode={auditMode} />
      <AuditFailureDialog
        error={auditStatus === "failed" ? state.audit.error : null}
        returnFocusRef={auditReturnFocusRef}
        onClose={() => dispatch({ type: "AUDIT_FAILURE_DISMISSED" })}
        onRetry={runAudit}
      />
      <div className="sr-only" aria-live="polite">{state.announcement}</div>
    </main>
  );
}
