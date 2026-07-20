import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import type { AuditSuccessResponse } from "@/lib/contracts";
import { worldPackSchema, type WorldPack } from "@/lib/world-pack";
import { MisruleApp } from "@/components/MisruleApp";

// The production ClockworkInstrument disables its audit button while running,
// so a second onAudit call is impossible through the real UI. Mock it to expose
// onAudit without the running-state lock, letting the test start request 2 for
// the same source while request 1 is still in flight.
vi.mock("@/components/ClockworkInstrument", () => ({
  ClockworkInstrument: function MockClockworkInstrument({ onAudit }: { onAudit: () => void }) {
    return (
      <button type="button" onClick={onAudit}>
        Set the world in motion
      </button>
    );
  },
}));

const portablePack = worldPackSchema.parse(portable);

function auditResponse(pack: WorldPack, overrides: Partial<AuditSuccessResponse["audit"]> = {}): AuditSuccessResponse {
  return {
    ok: true,
    requestId: "portable-test",
    timing: { totalMs: 8 },
    audit: {
      schemaVersion: "audit-api/v2",
      auditId: "audit-portable-test",
      packId: pack.packId,
      packVersion: pack.packVersion,
      createdAt: "2026-07-21T01:00:00.000Z",
      source: { mode: "mock", requestedModel: "deterministic-mock", model: "deterministic-mock" },
      unresolvedQuestions: [],
      findings: [
        {
          id: "finding-local-tides",
          kind: "contradiction",
          title: "Two Tides After One Bell",
          ruleRefs: [{ id: "LAW-A", label: "Bell Tide" }],
          spanRefs: [{ id: "NOTE-A", label: "Dawn Ledger" }, { id: "NOTE-B", label: "Dusk Ledger" }],
          trace: [
            { ordinal: 1, kind: "rule", refId: "LAW-A", text: "Only one tide may enter after each bell." },
            { ordinal: 2, kind: "span", refId: "NOTE-A", text: "The white tide entered after the bell." },
            { ordinal: 3, kind: "span", refId: "NOTE-B", text: "The black tide entered after the same bell." },
          ],
          explanation: "The route closes when both entries are tied to the same bell.",
          missingFact: null,
          whyUnresolved: null,
          supportedReadings: [],
        },
      ],
      ...overrides,
    },
  };
}

// Tracks every in-flight fetch so the test can settle request 1 and request 2
// independently. Each fetch pushes its resolver onto a stack; respondOk(at)
// settles the Nth pending request.
function supersessionAuditMock() {
  type Pending = { resolve: (value: { json: () => Promise<unknown> }) => void };
  const pending: Pending[] = [];
  const fetchMock = vi.fn(
    () =>
      new Promise<{ json: () => Promise<unknown> }>((resolve) => {
        pending.push({ resolve });
      }),
  );
  const respondOk = (pack: WorldPack, at = 0) => pending[at]?.resolve({ json: async () => auditResponse(pack) });
  return { fetchMock, respondOk, count: () => pending.length };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("same-source request supersession", () => {
  it("supersedes an earlier same-source request with a later one", async () => {
    const store = supersessionAuditMock();
    vi.stubGlobal("fetch", store.fetchMock);
    render(<MisruleApp pack={portablePack} source={{ kind: "inline", pack: portablePack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    // Request 1 for the active source.
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    // Request 2 for the same source (mock bypasses the running-state lock).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    });

    expect(store.count()).toBe(2);

    // Settle request 1 first. Its generation is no longer current, so it must
    // not mount a result or failure for the active source.
    await act(async () => {
      store.respondOk(portablePack, 0);
    });
    expect(screen.queryByRole("button", { name: /Two Tides After One Bell/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "No partial finding was mounted." })).not.toBeInTheDocument();

    // Settle request 2. Only it controls the final audit state.
    await act(async () => {
      store.respondOk(portablePack, 1);
    });
    expect(await screen.findByRole("button", { name: /Two Tides After One Bell/ })).toBeInTheDocument();
  });
});

function openMountedArchive(name: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
