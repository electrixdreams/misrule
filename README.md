# Misrule

> Find where the world turns against itself.

Misrule is an inspectable fictional-world rule audit. It compares author-declared rules with narrative source spans, asks GPT-5.6 to surface multi-hop contradictions, and keeps legitimate ambiguity open when a decisive fact is missing.

The bundled **Ashglass Clocktower** world is synthetic and intentionally small: ten rules and eighteen narrative spans. Misrule does not claim manuscript upload, objective canon adjudication, story-bible generation, or production reliability beyond this fixture.

## Judge path

1. Open the Ashglass archive and read the world, rules, and narrative record.
2. Select **Set the world in motion**.
3. Open a contradiction to inspect its closed rule/span/inference route.
4. Jump to an exact cited rule or span, then return to the finding.
5. Open an ambiguity to see the missing fact and both supported readings.
6. Read Method for the live/captured boundary and validation rules.

## Run locally

Requirements: Node.js 20.9 or newer and an OpenAI API key with access to `gpt-5.6-sol`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `OPENAI_API_KEY` only in `.env.local` or the deployment secret store. The browser never receives it. Production defaults to the real server-side Responses API route.

For deterministic local QA without an API call, set `MISRULE_AUDIT_MODE=mock`. Mock output exercises the same validation, normalization, reducer, and rendering boundaries, but is never evidence of live GPT-5.6 behavior.

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
- Application finding IDs are assigned only after validation; GPT-5.6 does not generate them.
- Pending UI is indeterminate and does not pretend to observe server phases.
- No captured audit ships in this checkpoint. A future same-build capture can be mounted only after an eligible transient live failure, an explicit user choice, and a short-lived signed server offer.

The live integration uses the official [OpenAI JavaScript SDK](https://github.com/openai/openai-node), the [Responses API](https://developers.openai.com/api/docs/guides/text), and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## License

MIT
