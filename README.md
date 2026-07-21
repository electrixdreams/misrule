# Misrule

> Find where the world turns against itself.

## Product

Misrule is an inspectable fictional-world rule audit for writers, lore editors, and narrative systems designers. It compares author-declared World Pack rules with cited narrative spans, asks a structured-output inference model to identify contradictions or legitimate ambiguities, and returns only validated findings with exact rule/span paths.

## Judge Path

1. Open **World Library**.
2. Choose the bundled **Ashglass Clocktower** sample and select **Open sample**.
3. Select **Set the world in motion** to run a real audit when the deployment is configured for live mode.
4. Open a finding, inspect its rule/span/inference route, and jump to exact cited rules or narrative spans.
5. Open an ambiguity to see the missing fact and both supported readings.
6. Create, import, edit, export, and audit structured World Packs from the same library.

## What Is Implemented

- Portable structured World Packs with browser-local create, import, edit, export, and delete flows.
- Bundled Ashglass and inline local World Pack audit sources.
- Exact citation rendering for rules, spans, trace steps, contradiction paths, and ambiguity explanations.
- Two-stage audit reasoning: candidate generation followed by focused adjudication.
- Strict server-side validation before any `audit-api/v2` response reaches the browser.

## Architecture

The browser selects a bundled or saved local World Pack. The server builds model input from validated structured data, then runs candidate generation and focused adjudication using the same resolved provider, endpoint, model, key, temperature, retry setting, and output transport. Provider transport output is parsed, converted to canonical shape, validated for citation identity and semantic consistency, normalized into public `audit-api/v2`, and returned without raw provider output.

## Trust Boundaries And Privacy

Live audits send the selected World Pack content to Misrule's server and then to the configured external inference provider. Server keys stay server-only. In configurable local mode, a browser-entered key exists only in component memory and the same-origin audit request body. In locked hosted mode, the browser cannot send runtime overrides.

Misrule does not render raw model output, expose ground truth to prompts, store browser keys, or silently repair invalid findings. Bundled evidence files are server-only when enabled; public deployments should leave evidence capture unset.

## Run Locally

Requirements: Node.js 20.9 or newer and an API key for an enabled OpenAI-compatible provider.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Validated local defaults:

```text
MISRULE_PROVIDER=openrouter
MISRULE_API_ENDPOINT=https://openrouter.ai/api/v1
MISRULE_MODEL=google/gemini-2.5-flash
MISRULE_OUTPUT_TRANSPORT=json_object
MISRULE_AUDIT_MODE=live
MISRULE_RUNTIME_MODE=configurable
```

Set `OPENROUTER_API_KEY` only in `.env.local` or a deployment secret store. In configurable mode, **Model & privacy** can set provider, endpoint, model, and a session-only key for one browser tab. For deterministic local QA without a provider call, set `MISRULE_AUDIT_MODE=mock`.

## Verification

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Evaluate a saved successful route response against server-only fixture truth:

```bash
npm run evaluate:audit -- /path/to/route-response.json fixtures/ashglass-clocktower-v1/ground-truth.server.json
```

## Build Week: Codex And GPT-5.6

Build harness: Codex
Build model: GPT-5.6 Sol
Primary Codex /feedback session ID: 019f7f29-8bd1-7851-938b-c02abe5d56f8

Codex and GPT-5.6 Sol were used to implement the portable World Library/editor/audit workflow, convert the accepted Clockwork Palimpsest interface into production architecture, harden provider transport and server validation boundaries, build the candidate/adjudication reliability architecture, and develop adversarial tests and evaluator tooling. Operator decisions defined product scope, runtime selection, and submission claims; Codex implemented those decisions rather than inventing unsupported live-provider or hosted-deployment claims.

## Runtime Disclosure

Validated inference provider: OpenRouter
Validated inference model: google/gemini-2.5-flash
Validated output transport: json_object

The inference runtime is not GPT-5.6. The Build Week evidence is the Codex plus GPT-5.6 Sol build process, session history, and commit trail.

## Limitations

Misrule works on structured World Pack JSON, not manuscript upload or document parsing. It does not implement RAG, embeddings, auth, databases, cloud persistence, collaborative editing, or manuscript-scale ingestion. The bundled Ashglass sample is synthetic, and inference quality depends on the configured provider and model.

## License

MIT
