# Misrule

> Find where the world turns against itself.

Misrule is an inspectable fictional-world rule audit. It compares author-declared rules with narrative source spans, asks a user-selected structured-output model to surface multi-hop contradictions, and keeps legitimate ambiguity open when a decisive fact is missing.

The bundled **Ashglass Clocktower** world is synthetic and intentionally small: ten rules and eighteen narrative spans. Misrule does not claim manuscript upload, objective canon adjudication, story-bible generation, or production reliability beyond this fixture.

## Judge path

1. Open the Ashglass archive and read the world, rules, and narrative record.
2. Select **Set the world in motion**.
3. Open a contradiction to inspect its closed rule/span/inference route.
4. Jump to an exact cited rule or span, then return to the finding.
5. Open an ambiguity to see the missing fact and both supported readings.
6. Read Method for the live/captured boundary and validation rules.

## Run locally

Requirements: Node.js 20.9 or newer and an API key for an enabled OpenAI-compatible provider. The default is OpenRouter with `openai/gpt-oss-120b:free`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `OPENROUTER_API_KEY` only in `.env.local` or the deployment secret store. Alternatively, open **Settings** and enter a key for the current browser tab. A browser-entered key is held in React memory, sent only in the same-origin audit request, and is never written to local storage, cookies, source, logs, evidence, or the response.

Settings exposes the provider, API endpoint, model, and masked API key without adding a sixth Clockwork station. Server calls are restricted to HTTPS hosts listed in `MISRULE_ALLOWED_PROVIDER_HOSTS`; deployment owners must explicitly allow any additional trusted OpenAI-compatible host.

For deterministic local QA without an API call, set `MISRULE_AUDIT_MODE=mock`. Mock output exercises the same validation, normalization, reducer, and rendering boundaries, but is never evidence of live provider behavior.

## Verification

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Trust and fallback

- Provider output follows strict JSON Schema generated from the canonical Zod schema.
- The server rejects malformed shapes, unknown citations, incomplete paths, and invalid contradiction/ambiguity semantics.
- Application finding IDs are assigned only after validation; the provider does not generate them.
- Pending UI is indeterminate and does not pretend to observe server phases.
- No captured audit ships in this checkpoint. A future same-build capture can be mounted only after an eligible transient live failure, an explicit user choice, and a short-lived signed server offer.

The live integration uses the official [OpenAI JavaScript SDK](https://github.com/openai/openai-node) against an OpenAI-compatible chat-completions endpoint and [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

## Competition compliance note

The official Build Week rules say to build a project with Codex and GPT-5.6, and the original Misrule Brief 09 made GPT-5.6 the live audit model. On 2026-07-20 the project owner explicitly amended the runtime to be user-configurable and default to OpenRouter `openai/gpt-oss-120b:free`. The core implementation was still built in the required Codex GPT-5.6 Sol session, but this runtime amendment should not be presented as confirmed equivalent to a load-bearing GPT-5.6 product call without organizer clarification.

## License

MIT
