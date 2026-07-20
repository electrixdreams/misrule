# Misrule repository guidance

Misrule is an inspectable fictional-world rule audit: GPT-5.6 reconciles author-declared rules with narrative spans, exposes exact contradiction paths, and preserves legitimate ambiguity.

Authority order: Brief 09; its D2 amendments; D2 architecture; B3C.1 interface; C2 fixture correction; frozen Workflow 04 scope.

Trust boundaries:

- Build model input on the server from validated local fixtures.
- Keep OpenAI keys, ground truth, captured output, and raw provider output server-only.
- Validate strict provider shape, citation identity, trace completeness, and kind semantics before normalization.
- Never render raw model output or silently repair an invalid finding.
- Keep reusable logic generic; do not branch on Ashglass IDs or lore.

Required checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

Forbidden scope: auth, databases, uploads, RAG, embeddings, persistence, rule editing, graph libraries, manuscript-scale claims, or secrets in source.
