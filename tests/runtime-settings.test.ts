import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicRuntimeDefaults, resolveRuntimeSettings } from "@/lib/runtime-settings.server";

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
    expect(resolved).toMatchObject({ apiKey: "session-secret", credentialSource: "request", endpointHost: "openrouter.ai" });
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
