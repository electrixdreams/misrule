import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import type { AuditSuccessResponse } from "@/lib/contracts";
import { worldPackSchema } from "@/lib/world-pack";
import { MisruleApp } from "@/components/MisruleApp";

const response: AuditSuccessResponse = {
  ok: true,
  requestId: "browser-test",
  timing: { totalMs: 12 },
  audit: {
    schemaVersion: "audit-api/v2",
    auditId: "audit-test",
    packId: "ashglass-clocktower-v1",
    packVersion: "1.0.0-c2",
    createdAt: "2026-07-20T11:00:00.000Z",
    source: { mode: "mock", requestedModel: "deterministic-mock", model: "deterministic-mock" },
    unresolvedQuestions: ["Was the North Star reflected in the basin?"],
    findings: [
      {
        id: "opaque-closed",
        kind: "contradiction",
        title: "The Dead Captain Returns in the Flesh",
        ruleRefs: [{ id: "RG-R03", label: "Orin’s Death" }, { id: "RG-R04", label: "No Bodily Return" }],
        spanRefs: [{ id: "RG-S01", label: "Council Chronicle" }, { id: "RG-S02", label: "Council Chronicle" }],
        trace: [
          { ordinal: 1, kind: "rule", refId: "RG-R03", text: "Orin died." },
          { ordinal: 2, kind: "span", refId: "RG-S01", text: "The seal verifies Orin." },
          { ordinal: 3, kind: "rule", refId: "RG-R04", text: "No bodily return." },
          { ordinal: 4, kind: "span", refId: "RG-S02", text: "The visitor has a pulse." },
        ],
        explanation: "The route closes.",
        missingFact: null,
        whyUnresolved: null,
        supportedReadings: [],
      },
      {
        id: "opaque-open",
        kind: "ambiguity",
        title: "Was the Red Vision Fixed?",
        ruleRefs: [{ id: "RG-R09", label: "Star-Marked Visions" }],
        spanRefs: [{ id: "RG-S09", label: "Oracle Journal" }, { id: "RG-S10", label: "Dawn Report" }],
        trace: [
          { ordinal: 1, kind: "rule", refId: "RG-R09", text: "The marker fixes a vision." },
          { ordinal: 2, kind: "span", refId: "RG-S09", text: "The reflection is withheld." },
          { ordinal: 3, kind: "span", refId: "RG-S10", text: "The event does not occur." },
        ],
        explanation: "The result depends on a missing fact.",
        missingFact: "Whether the North Star appeared reflected in the seeing basin.",
        whyUnresolved: "The record does not establish the basin reflection.",
        supportedReadings: [
          { label: "Star-marked reading", outcome: "contradiction_supported", explanation: "The fixed vision failed." },
          { label: "Ordinary reading", outcome: "contradiction_not_supported", explanation: "A possible future may fail." },
        ],
      },
    ],
  },
};
const ashglassPack = worldPackSchema.parse(ashglass);
const ashglassSource = { kind: "bundled" as const, packId: ashglassPack.packId };

describe("judge-visible vertical slice", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the actual World Pack, validated findings, citation jump/return, and ambiguity refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => response }));
    render(<MisruleApp pack={ashglassPack} source={ashglassSource} />);

    expect(screen.getAllByText("Find where the world turns against itself.")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Open the Ashglass archive" }));
    expect(screen.getByText(/Ashglass is a rain-dark civic world/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    expect(screen.getByText("Auditing rule-to-evidence paths")).toBeInTheDocument();
    await screen.findByRole("button", { name: /The Dead Captain Returns in the Flesh/ });

    fireEvent.click(screen.getByRole("button", { name: /The Dead Captain Returns in the Flesh/ }));
    expect(screen.getByText("Route closed")).toBeInTheDocument();
    const citationButtons = screen.getAllByRole("button", { name: "RG-S01" });
    fireEvent.click(citationButtons[0]);
    await waitFor(() => expect(document.activeElement).toHaveAttribute("id", "RG-S01"));
    fireEvent.click(screen.getByRole("button", { name: /Return to selected finding/ }));
    expect(screen.getByText("Route closed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Return to findings/ }));
    fireEvent.click(screen.getByRole("button", { name: /Was the Red Vision Fixed/ }));
    expect(screen.getByText("Whether the North Star appeared reflected in the seeing basin.")).toBeInTheDocument();
    expect(screen.getByText("Star-marked reading")).toBeInTheDocument();
    expect(screen.getByText("Ordinary reading")).toBeInTheDocument();
    expect(screen.queryByText(/schema_version|rawResponse/)).not.toBeInTheDocument();
  });

  it("supports station shortcuts and arrow navigation", () => {
    render(<MisruleApp pack={ashglassPack} source={ashglassSource} />);
    fireEvent.click(screen.getByRole("button", { name: "Open the Ashglass archive" }));
    fireEvent.keyDown(document, { key: "2", altKey: true });
    expect(screen.getByRole("heading", { name: "World Rules" })).toBeInTheDocument();
    const rulesButton = screen.getByRole("button", { name: /Rules Axioms/ });
    rulesButton.focus();
    fireEvent.keyDown(rulesButton.parentElement!, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: /Record Evidence/ })).toHaveFocus();
  });

  it("keeps provider settings focus-contained and sends a session-only key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => response });
    vi.stubGlobal("fetch", fetchMock);
    render(<MisruleApp pack={ashglassPack} source={ashglassSource} />);
    fireEvent.click(screen.getByRole("button", { name: "Open the Ashglass archive" }));

    const settingsButton = screen.getByRole("button", { name: /Model & privacyOpenRouter/ });
    settingsButton.focus();
    fireEvent.click(settingsButton);
    const dialog = screen.getByRole("dialog", { name: "Choose the reasoning provider." });
    const provider = screen.getByLabelText("Provider");
    await waitFor(() => expect(provider).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "openai/gpt-oss-120b:free" } });
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: "session-secret" } });
    provider.focus();
    fireEvent.keyDown(provider, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Use these settings" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Use these settings" }));
    expect(dialog).not.toBeInTheDocument();
    await waitFor(() => expect(settingsButton).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    await screen.findByRole("button", { name: /The Dead Captain Returns in the Flesh/ });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      schemaVersion: "audit-api/v2",
      source: { kind: "bundled", packId: "ashglass-clocktower-v1" },
      intent: { mode: "live" },
    });
    expect(request.runtime).toEqual({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      model: "openai/gpt-oss-120b:free",
      apiKey: "session-secret",
    });
    expect(localStorage.length).toBe(0);
  });

  it("contains a failed audit in a focus-restoring dialog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        ok: false,
        requestId: "failure-test",
        error: {
          code: "SERVICE_MISCONFIGURED",
          message: "The live audit service is not configured.",
          retryable: false,
          fallbackOffer: null,
        },
      }),
    }));
    render(<MisruleApp pack={ashglassPack} source={ashglassSource} />);
    fireEvent.click(screen.getByRole("button", { name: "Open the Ashglass archive" }));
    const auditButton = screen.getByRole("button", { name: /Set the world in motion/ });
    auditButton.focus();
    fireEvent.click(auditButton);

    const dialog = await screen.findByRole("dialog", { name: "No partial finding was mounted." });
    const returnButton = screen.getByRole("button", { name: "Return to archive" });
    expect(dialog).toBeInTheDocument();
    expect(returnButton).toHaveFocus();
    fireEvent.keyDown(returnButton, { key: "Tab" });
    expect(returnButton).toHaveFocus();
    fireEvent.keyDown(returnButton, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(auditButton).toHaveFocus();
  });

  it("never labels an empty mock result as live", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ...response, audit: { ...response.audit, findings: [] } }),
    }));
    render(<MisruleApp pack={ashglassPack} source={ashglassSource} auditMode="mock" />);
    fireEvent.click(screen.getByRole("button", { name: "Open the Ashglass archive" }));
    fireEvent.click(screen.getByRole("button", { name: /Set the world in motion/ }));
    await screen.findByText("No audit findings");
    expect(screen.getByText("Deterministic mock · not live")).toBeInTheDocument();
    expect(screen.queryByText("Validated live response")).not.toBeInTheDocument();
  });

  it("exposes a return-to-library control that fires the handler", () => {
    const onReturn = vi.fn();
    render(<MisruleApp pack={ashglassPack} source={ashglassSource} onReturnToLibrary={onReturn} />);
    fireEvent.click(screen.getByRole("button", { name: /Open the Ashglass archive/ }));
    const returnButton = screen.getByRole("button", { name: "Return to the World Library" });
    returnButton.focus();
    fireEvent.click(returnButton);
    expect(onReturn).toHaveBeenCalled();
  });
});
