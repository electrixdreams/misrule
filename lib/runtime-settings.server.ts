import "server-only";

import { URL } from "node:url";
import type { AuditProvider, AuditRequest, PublicRuntimeDefaults } from "@/lib/contracts";
import { AuditServiceError } from "@/lib/audit-errors";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "google/gemini-2.5-flash";

export type ResolvedRuntimeSettings = {
  provider: AuditProvider;
  apiEndpoint: string;
  endpointHost: string;
  model: string;
  apiKey: string;
  credentialSource: "request" | "server";
  outputTransport: OutputTransport;
};

export type OutputTransport = "json_schema" | "json_object";
export type RuntimeMode = "configurable" | "locked";

export function runtimeModeFromEnvironment(): RuntimeMode {
  const configured = process.env.MISRULE_RUNTIME_MODE?.trim();
  if (!configured) return "configurable";
  if (configured === "configurable" || configured === "locked") return configured;
  throw new AuditServiceError("SERVICE_MISCONFIGURED", "MISRULE_RUNTIME_MODE must be configurable or locked.", 500, false);
}

function providerFromEnvironment(): AuditProvider {
  return process.env.MISRULE_PROVIDER === "openai-compatible" ? "openai-compatible" : "openrouter";
}

function endpointFromEnvironment(provider: AuditProvider) {
  if (process.env.MISRULE_API_ENDPOINT?.trim()) return process.env.MISRULE_API_ENDPOINT.trim();
  return provider === "openrouter" ? OPENROUTER_ENDPOINT : "https://api.openai.com/v1";
}

function modelFromEnvironment(provider: AuditProvider) {
  if (process.env.MISRULE_MODEL?.trim()) return process.env.MISRULE_MODEL.trim();
  return provider === "openrouter" ? OPENROUTER_MODEL : "gpt-4.1-mini";
}

function serverApiKey(provider: AuditProvider) {
  if (provider === "openrouter") return process.env.OPENROUTER_API_KEY?.trim() || "";
  return process.env.OPENAI_COMPATIBLE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
}

export function outputTransportFromEnvironment(): OutputTransport {
  const configured = process.env.MISRULE_OUTPUT_TRANSPORT?.trim();
  if (!configured) return "json_object";
  if (configured === "json_schema" || configured === "json_object") return configured;
  throw new AuditServiceError("SERVICE_MISCONFIGURED", "MISRULE_OUTPUT_TRANSPORT must be json_schema or json_object.", 500, false);
}

export function allowedEndpointHosts() {
  const configured = (process.env.MISRULE_ALLOWED_PROVIDER_HOSTS || "openrouter.ai,api.openai.com")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(configured)];
  return unique.length ? unique : ["openrouter.ai", "api.openai.com"];
}

function validateEndpoint(value: string) {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new AuditServiceError("INVALID_REQUEST", "The provider endpoint is not a valid URL.", 400, false);
  }
  if (endpoint.protocol !== "https:") {
    throw new AuditServiceError("INVALID_REQUEST", "Provider endpoints must use HTTPS.", 400, false);
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new AuditServiceError("INVALID_REQUEST", "The provider endpoint cannot contain credentials, query parameters, or a fragment.", 400, false);
  }
  const host = endpoint.hostname.toLowerCase();
  if (!allowedEndpointHosts().includes(host)) {
    throw new AuditServiceError(
      "INVALID_REQUEST",
      `The provider host ${host} is not enabled by this deployment. Add it to MISRULE_ALLOWED_PROVIDER_HOSTS before using it.`,
      400,
      false,
    );
  }
  return { apiEndpoint: endpoint.toString().replace(/\/$/, ""), endpointHost: host };
}

export function getPublicRuntimeDefaults(): PublicRuntimeDefaults {
  const provider = providerFromEnvironment();
  const endpoint = validateEndpoint(endpointFromEnvironment(provider));
  return {
    runtimeMode: runtimeModeFromEnvironment(),
    provider,
    apiEndpoint: endpoint.apiEndpoint,
    model: modelFromEnvironment(provider),
    hasServerApiKey: Boolean(serverApiKey(provider)),
    allowedEndpointHosts: allowedEndpointHosts(),
  };
}

export function resolveRuntimeSettings(request: AuditRequest): ResolvedRuntimeSettings {
  const runtimeMode = runtimeModeFromEnvironment();
  if (runtimeMode === "locked" && request.runtime) {
    throw new AuditServiceError("INVALID_REQUEST", "This deployment does not accept browser runtime overrides.", 400, false);
  }
  const provider = runtimeMode === "locked" ? providerFromEnvironment() : request.runtime?.provider ?? providerFromEnvironment();
  const endpoint = validateEndpoint(runtimeMode === "locked" ? endpointFromEnvironment(provider) : request.runtime?.apiEndpoint ?? endpointFromEnvironment(provider));
  const apiKey = runtimeMode === "locked" ? serverApiKey(provider) : request.runtime?.apiKey?.trim() || serverApiKey(provider);
  if (!apiKey) {
    throw new AuditServiceError(
      "SERVICE_MISCONFIGURED",
      "No API key is available. Add one in Settings for this browser session or configure the server environment.",
      503,
      false,
    );
  }
  return {
    provider,
    ...endpoint,
    model: runtimeMode === "locked" ? modelFromEnvironment(provider) : request.runtime?.model.trim() || modelFromEnvironment(provider),
    apiKey,
    credentialSource: runtimeMode === "locked" || !request.runtime?.apiKey ? "server" : "request",
    outputTransport: outputTransportFromEnvironment(),
  };
}
