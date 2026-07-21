"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { AuditWorldPackSource, PublicRuntimeDefaults, RuntimeSettings } from "@/lib/contracts";
import type { WorldPack } from "@/lib/world-pack";
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

// Source-change invalidation must run in the commit lifecycle, before passive
// effects, so a request that settles after React commits a new active source
// cannot pass isCurrentRequest() against the now-stale generation/source key.
// On the client this is useLayoutEffect (synchronous, pre-passive-effect);
// during SSR (where effects never run) it downgrades to useEffect to avoid the
// server warning. The mechanism is identical at runtime.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function MisruleApp({
  pack,
  source,
  runtimeDefaults = {
    runtimeMode: "configurable",
    provider: "openrouter",
    apiEndpoint: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.5-flash",
    hasServerApiKey: false,
    allowedEndpointHosts: ["openrouter.ai", "api.openai.com"],
  },
  auditMode = "live",
  onReturnToLibrary,
  onEdit,
}: {
  pack: WorldPack;
  source: AuditWorldPackSource;
  runtimeDefaults?: PublicRuntimeDefaults;
  auditMode?: "live" | "mock";
  onReturnToLibrary?: () => void;
  onEdit?: () => void;
}) {
  const [state, dispatch] = useReducer(misruleReducer, initialMisruleState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>({
    provider: runtimeDefaults.provider,
    apiEndpoint: runtimeDefaults.apiEndpoint,
    model: runtimeDefaults.model,
  });
  const abortRef = useRef<AbortController | null>(null);
  const activeSourceKeyRef = useRef("");
  const requestGenerationRef = useRef(0);
  const auditReturnFocusRef = useRef<HTMLElement | null>(null);
  const entryButtonRef = useRef<HTMLButtonElement | null>(null);
  const result = selectAuditResult(state);
  const finding = selectFinding(state);
  const lockedRuntime = runtimeDefaults.runtimeMode === "locked";
  const displayedRuntime = lockedRuntime ? runtimeDefaults : runtimeSettings;
  const sourceKey = source.kind === "bundled" ? `bundled:${source.packId}` : `inline:${source.pack.packId}:${source.pack.packVersion}`;
  const sourceDisclosure = source.kind === "bundled"
    ? { label: "Bundled sample", shortLabel: "Bundled archive", entry: "bundled synthetic World Pack" }
    : { label: "Local World Pack", shortLabel: "Local archive", entry: "saved local World Pack" };
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
    const myGeneration = ++requestGenerationRef.current;
    const requestSourceKey = sourceKey;
    const requestedPackId = pack.packId;
    const requestedPackVersion = pack.packVersion;
    const isCurrentRequest = () =>
      myGeneration === requestGenerationRef.current && requestSourceKey === activeSourceKeyRef.current;
    dispatch({ type: "AUDIT_REQUESTED" });
    try {
      const response = await requestAudit(source, lockedRuntime ? undefined : runtimeSettings, controller.signal);
      if (!isCurrentRequest()) return;
      if (response.ok) {
        if (response.audit.packId !== requestedPackId || response.audit.packVersion !== requestedPackVersion) {
          dispatch({
            type: "AUDIT_FAILED",
            error: { code: "INTERNAL_ERROR", message: "The audit service returned a result for another World Pack.", retryable: false, fallbackOffer: null },
          });
        } else {
          dispatch({ type: "AUDIT_SUCCEEDED", result: response.audit });
        }
      } else dispatch({ type: "AUDIT_FAILED", error: response.error });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!isCurrentRequest()) return;
      dispatch({
        type: "AUDIT_FAILED",
        error: { code: "UPSTREAM_UNAVAILABLE", message: "The live audit service could not be reached.", retryable: true, fallbackOffer: null },
      });
    }
  }, [lockedRuntime, pack.packId, pack.packVersion, runtimeSettings, source, sourceKey]);

  useEffect(() => () => {
    requestGenerationRef.current++;
    abortRef.current?.abort();
  }, []);

  useIsomorphicLayoutEffect(() => {
    // Source-change order: invalidate the prior request generation, update the
    // authoritative active source key, abort and clear the prior controller,
    // then reset the world via the reducer. Runs before passive effects so a
    // late completion cannot be mistaken for the current source.
    requestGenerationRef.current++;
    activeSourceKeyRef.current = sourceKey;
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "ACTIVE_WORLD_CHANGED", title: pack.title });
  }, [pack.title, sourceKey]);

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
        ? [`${state.audit.result.findings.length} audit findings`, resultSourceStatus!]
        : auditStatus === "no_findings"
          ? ["No audit findings", resultSourceStatus!]
          : auditStatus === "failed"
            ? ["Audit blocked", state.audit.error.code.replaceAll("_", " ").toLowerCase()]
            : ["The world is still", auditMode === "mock" ? `${sourceDisclosure.label} · mock gateway disclosed` : `${sourceDisclosure.label} · access checked on request`];

  function selectStation(station: StationId) {
    dispatch({ type: "STATION_SELECTED", station });
    document.getElementById("leaf-content")?.focus({ preventScroll: true });
  }

  return (
    <main className="misrule-shell" data-quieted={instrument.quieted || undefined}>
      <a className="skip-link" href="#leaf-content">Skip to archive leaf</a>

      <button className="world-seal" type="button" onClick={() => dispatch({ type: "DRAWER_OPENED" })} aria-haspopup="dialog" aria-label={`Open active world controls for ${pack.title}`}>
        <i aria-hidden="true" />
        <span><strong>Misrule</strong><small>{pack.title}<br />{sourceDisclosure.shortLabel}</small></span>
      </button>

      <div className="status-plaque" data-state={instrument.auditStatus} role="status">
        <i aria-hidden="true" /><span><strong>{status[0]}</strong><small>{status[1]}</small></span>
      </div>

      <button className="settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
        <span>Model &amp; privacy</span>
        <small>{displayedRuntime.provider === "openrouter" ? "OpenRouter" : "Compatible API"} · {displayedRuntime.model}</small>
      </button>

      {onReturnToLibrary ? (
        <button className="library-return" type="button" onClick={onReturnToLibrary} aria-label="Return to the World Library">
          <span>World Library</span>
        </button>
      ) : null}

      <div className="workspace">
        <ClockworkInstrument
          selectedStation={state.selectedStation}
          handAngle={instrument.handAngle}
          auditStatus={instrument.auditStatus}
          topology={instrument.selectedPath.topology}
          quieted={instrument.quieted}
          running={auditStatus === "running"}
          auditMode={auditMode}
          pack={pack}
          sourceLabel={sourceDisclosure.label}
          onStation={selectStation}
          onAudit={runAudit}
        />
        <ArchiveLeaf
          pack={pack}
          source={source}
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
            <span>{pack.title} · {sourceDisclosure.entry}</span>
            <h2 id="entry-title">Misrule</h2>
            <p className="entry-tagline">Find where the world turns against itself.</p>
            <p>Enter a literary reasoning instrument: world rules, narrative evidence, closed contradictions, and the facts the record still withholds.</p>
            <button ref={entryButtonRef} autoFocus type="button" onClick={() => dispatch({ type: "ENTRY_DISMISSED" })}>Open the {pack.world.title} archive</button>
            <small>Inspectable fictional-world rule audit</small>
          </div>
        </section>
      ) : null}

      <WorldDrawer
        pack={pack}
        source={source}
        open={state.drawerOpen}
        auditRunning={auditStatus === "running"}
        onClose={() => dispatch({ type: "DRAWER_CLOSED" })}
        onReturnToLibrary={onReturnToLibrary}
        onEdit={onEdit}
      />
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
