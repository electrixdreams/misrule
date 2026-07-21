import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import neon from "@/fixtures/neon-reliquary-v1/input.json";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import type { AuditErrorResponse, AuditSuccessResponse } from "@/lib/contracts";
import { saveLocalWorldPack } from "@/lib/world-library.client";
import { worldPackSchema, type WorldPack } from "@/lib/world-pack";
import { MisruleApp } from "@/components/MisruleApp";
import { MisruleProduct } from "@/components/MisruleProduct";

const ashglassPack = worldPackSchema.parse(ashglass);
const neonPack = worldPackSchema.parse(neon);
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

function openMountedArchive(name: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portable Clockwork workflow", () => {
  it("sends bundled Ashglass with bundled provenance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => auditResponse(ashglassPack) });
    vi.stubGlobal("fetch", fetchMock);

    render(<MisruleProduct bundledPacks={[ashglassPack]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open archive" }));
    openMountedArchive(/Open the Ashglass archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    await screen.findByRole("button", { name: /Two Tides After One Bell/ });

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.source).toEqual({ kind: "bundled", packId: "ashglass-clocktower-v1" });
  });

  it("sends a selected non-Ashglass bundled pack with exact bundled provenance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => auditResponse(neonPack) });
    vi.stubGlobal("fetch", fetchMock);

    render(<MisruleProduct bundledPacks={[ashglassPack, neonPack]} />);
    fireEvent.click(screen.getByRole("button", { name: "Neon Reliquary" }));
    fireEvent.click(screen.getByRole("button", { name: "Open archive" }));
    openMountedArchive(/Open the Neon Reliquary archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.source).toEqual({ kind: "bundled", packId: "neon-reliquary-v1" });
  });

  it("opens a saved local pack and audits the exact inline World Pack", async () => {
    saveLocalWorldPack(portablePack, { now: () => "2026-07-21T01:00:00.000Z" });
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => auditResponse(portablePack) });
    vi.stubGlobal("fetch", fetchMock);

    render(<MisruleProduct bundledPacks={[ashglassPack]} />);
    fireEvent.click(screen.getByRole("button", { name: /Harbor of Hours/ }));
    fireEvent.click(screen.getByRole("button", { name: "Audit" }));
    openMountedArchive(/Open the Harbor of Hours archive/);
    expect(screen.getByText("Every bell changes which tide may enter the harbor.")).toBeInTheDocument();
    expect(screen.getByText("Local World Pack · saved in this browser")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    await screen.findByRole("button", { name: /Two Tides After One Bell/ });

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.source).toEqual({ kind: "inline", pack: portablePack });
    expect(request.source.pack.title).toBe("Harbor of Hours");
  });

  it("clears old findings when the active pack changes", async () => {
    const firstPack = portablePack;
    const secondPack = { ...portablePack, packId: "portable-world-v2", packVersion: "2.0.0", title: "Harbor Revised" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => auditResponse(firstPack) }));
    const { rerender } = render(<MisruleApp pack={firstPack} source={{ kind: "inline", pack: firstPack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    await screen.findByRole("button", { name: /Two Tides After One Bell/ });

    rerender(<MisruleApp pack={secondPack} source={{ kind: "inline", pack: secondPack }} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Two Tides After One Bell/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Open the Harbor of Hours archive/ })).toBeInTheDocument();
  });

  it("rejects a result for another pack/version instead of rendering it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => auditResponse(portablePack, { packId: "different-pack", packVersion: "9.9.9" }),
    }));
    render(<MisruleApp pack={portablePack} source={{ kind: "inline", pack: portablePack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));

    expect(await screen.findByRole("dialog", { name: "No partial finding was mounted." })).toBeInTheDocument();
    expect(screen.getAllByText("The audit service returned a result for another World Pack.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Two Tides After One Bell/ })).not.toBeInTheDocument();
  });

  it("navigates local non-RG citations and shows local disclosure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => auditResponse(portablePack) }));
    render(<MisruleApp pack={portablePack} source={{ kind: "inline", pack: portablePack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Two Tides After One Bell/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "NOTE-A" })[0]);
    await waitFor(() => expect(document.activeElement).toHaveAttribute("id", "NOTE-A"));

    fireEvent.click(screen.getByRole("button", { name: /Method Disclosure/ }));
    expect(screen.getByText(/This saved local World Pack is sent only for the selected audit request/)).toBeInTheDocument();
    expect(screen.getByText(/Browser-local library content remains local except when you explicitly audit/)).toBeInTheDocument();
    expect(screen.queryByText(/Controlled evidence/)).not.toBeInTheDocument();
  });

  it("keeps runtime settings secondary and replaces fake drawer slots with active-world actions", async () => {
    saveLocalWorldPack(portablePack);
    render(<MisruleProduct bundledPacks={[ashglassPack]} />);

    fireEvent.click(screen.getByRole("button", { name: /Harbor of Hours/ }));
    fireEvent.click(screen.getByRole("button", { name: "Audit" }));
    openMountedArchive(/Open the Harbor of Hours archive/);
    expect(screen.getByRole("button", { name: /Model & privacy/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Open active world controls for Harbor of Hours/ }));
    expect(await screen.findByRole("dialog", { name: "Harbor of Hours" })).toBeInTheDocument();
    expect(screen.getAllByText(/Saved local World Pack/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/empty position|No additional world mounted/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit local pack" }));
    expect(await screen.findByRole("heading", { name: "Edit World Pack" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save and return" }));
    await screen.findByRole("heading", { name: "World Library" });
  });
});

function deferredAuditMock() {
  type JsonBody = unknown;
  let resolveFetch: (value: { json: () => Promise<JsonBody> }) => void = () => {};
  let rejectFetch: (reason?: unknown) => void = () => {};
  const fetchMock = vi.fn(
    () =>
      new Promise<{ json: () => Promise<JsonBody> }>((resolve, reject) => {
        resolveFetch = resolve;
        rejectFetch = reject;
      }),
  );
  const respondOk = (pack: WorldPack) => resolveFetch({ json: async () => auditResponse(pack) });
  const respondError = (error: AuditErrorResponse) => resolveFetch({ json: async () => error });
  const rejectWith = (error: Error) => rejectFetch(error);
  return { fetchMock, respondOk, respondError, rejectWith };
}

describe("audit request-generation safety", () => {
  it("ignores a late non-abort rejection from a stale source", async () => {
    const store = deferredAuditMock();
    vi.stubGlobal("fetch", store.fetchMock);
    const firstPack = portablePack;
    const secondPack = { ...portablePack, packId: "portable-world-v2", packVersion: "2.0.0", title: "Harbor Revised" };
    const { rerender } = render(<MisruleApp pack={firstPack} source={{ kind: "inline", pack: firstPack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));

    rerender(<MisruleApp pack={secondPack} source={{ kind: "inline", pack: secondPack }} />);
    await act(async () => {
      store.rejectWith(new TypeError("network failed"));
    });

    expect(screen.getByRole("button", { name: /Open the Harbor of Hours archive/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Two Tides After One Bell/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "No partial finding was mounted." })).not.toBeInTheDocument();
    expect(screen.queryByText("The live audit service could not be reached.")).not.toBeInTheDocument();
  });

  it("ignores a late success from a stale source", async () => {
    const store = deferredAuditMock();
    vi.stubGlobal("fetch", store.fetchMock);
    const firstPack = portablePack;
    const secondPack = { ...portablePack, packId: "portable-world-v2", packVersion: "2.0.0", title: "Harbor Revised" };
    const { rerender } = render(<MisruleApp pack={firstPack} source={{ kind: "inline", pack: firstPack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));

    rerender(<MisruleApp pack={secondPack} source={{ kind: "inline", pack: secondPack }} />);
    await act(async () => {
      store.respondOk(firstPack);
    });

    expect(screen.getByRole("button", { name: /Open the Harbor of Hours archive/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Two Tides After One Bell/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "No partial finding was mounted." })).not.toBeInTheDocument();
  });

  it("still shows the sanitized failure for a current-source rejection", async () => {
    const store = deferredAuditMock();
    vi.stubGlobal("fetch", store.fetchMock);
    render(<MisruleApp pack={portablePack} source={{ kind: "inline", pack: portablePack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));

    await act(async () => {
      store.rejectWith(new TypeError("network failed"));
    });

    expect(await screen.findByRole("dialog", { name: "No partial finding was mounted." })).toBeInTheDocument();
    expect(screen.getAllByText("The live audit service could not be reached.").length).toBeGreaterThan(0);
  });

  it("still rejects a result for another pack/version from the current source", async () => {
    const store = deferredAuditMock();
    vi.stubGlobal("fetch", store.fetchMock);
    render(<MisruleApp pack={portablePack} source={{ kind: "inline", pack: portablePack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));

    await act(async () => {
      store.respondOk({ ...portablePack, packId: "different-pack", packVersion: "9.9.9" });
    });

    expect(await screen.findByRole("dialog", { name: "No partial finding was mounted." })).toBeInTheDocument();
    expect(screen.getAllByText("The audit service returned a result for another World Pack.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Two Tides After One Bell/ })).not.toBeInTheDocument();
  });

  it("ignores a stale typed ok:false error response from a superseded source", async () => {
    const store = deferredAuditMock();
    vi.stubGlobal("fetch", store.fetchMock);
    const firstPack = portablePack;
    const secondPack = { ...portablePack, packId: "portable-world-v2", packVersion: "2.0.0", title: "Harbor Revised" };
    const { rerender } = render(<MisruleApp pack={firstPack} source={{ kind: "inline", pack: firstPack }} />);

    openMountedArchive(/Open the Harbor of Hours archive/);
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));

    rerender(<MisruleApp pack={secondPack} source={{ kind: "inline", pack: secondPack }} />);
    await act(async () => {
      store.respondError({
        ok: false,
        requestId: "portable-test-error",
        error: {
          code: "MODEL_REFUSAL",
          message: "The model declined to complete the audit.",
          retryable: true,
          fallbackOffer: null,
        },
      });
    });

    expect(screen.getByRole("button", { name: /Open the Harbor of Hours archive/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Two Tides After One Bell/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "No partial finding was mounted." })).not.toBeInTheDocument();
    expect(screen.queryByText("The model declined to complete the audit.")).not.toBeInTheDocument();
  });
});
