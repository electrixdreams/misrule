import { afterEach, describe, expect, it, vi } from "vitest";
import { auditRequestSchema } from "@/lib/contracts";
import { getPublicRuntimeDefaults, outputTransportFromEnvironment, resolveRuntimeSettings } from "@/lib/runtime-settings.server";

const request = {
  schemaVersion: "audit-api/v2" as const,
  source: { kind: "bundled" as const, packId: "ashglass-clocktower-v1" },
  clientRequestId: "runtime-test",
  intent: { mode: "live" as const },
};

describe("runtime settings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("exposes safe OpenRouter defaults without exposing the server key", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "server-secret");
    vi.stubEnv("MISRULE_PROVIDER", "openrouter");
    vi.stubEnv("MISRULE_API_ENDPOINT", "https://openrouter.ai/api/v1");
    vi.stubEnv("MISRULE_MODEL", "openai/gpt-oss-120b:free");
    const defaults = getPublicRuntimeDefaults();
    expect(defaults).toEqual(expect.objectContaining({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      model: "openai/gpt-oss-120b:free",
      hasServerApiKey: true,
    }));
    expect(JSON.stringify(defaults)).not.toContain("server-secret");
  });

  it("prefers a session key and keeps only safe endpoint metadata", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "server-secret");
    const resolved = resolveRuntimeSettings({
      ...request,
      runtime: {
        provider: "openrouter",
        apiEndpoint: "https://openrouter.ai/api/v1",
        model: "openai/gpt-oss-120b:free",
        apiKey: "session-secret",
      },
    });
    expect(resolved).toMatchObject({ apiKey: "session-secret", credentialSource: "request", endpointHost: "openrouter.ai", outputTransport: "json_schema" });
  });

  it("defaults output transport to strict JSON schema", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "server-secret");
    expect(outputTransportFromEnvironment()).toBe("json_schema");
    expect(resolveRuntimeSettings(request)).toMatchObject({ outputTransport: "json_schema" });
  });

  it("resolves server-side JSON-object output transport", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "server-secret");
    vi.stubEnv("MISRULE_OUTPUT_TRANSPORT", "json_object");
    expect(outputTransportFromEnvironment()).toBe("json_object");
    expect(resolveRuntimeSettings(request)).toMatchObject({ outputTransport: "json_object" });
  });

  it("rejects invalid output transport values clearly", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "server-secret");
    vi.stubEnv("MISRULE_OUTPUT_TRANSPORT", "json_schema_then_json_object");
    expect(() => resolveRuntimeSettings(request)).toThrow("MISRULE_OUTPUT_TRANSPORT must be json_schema or json_object.");
  });

  it("does not accept browser-supplied output transport settings", () => {
    const parsed = auditRequestSchema.safeParse({
      ...request,
      runtime: {
        provider: "openrouter",
        apiEndpoint: "https://openrouter.ai/api/v1",
        model: "google/gemini-2.5-flash",
        apiKey: "session-secret",
        outputTransport: "json_object",
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects endpoints outside the deployment allowlist", () => {
    vi.stubEnv("MISRULE_ALLOWED_PROVIDER_HOSTS", "openrouter.ai");
    expect(() => resolveRuntimeSettings({
      ...request,
      runtime: {
        provider: "openai-compatible",
        apiEndpoint: "https://example.com/v1",
        model: "example/model",
        apiKey: "session-secret",
      },
    })).toThrow(/not enabled by this deployment/);
  });
});
