# Misrule repository guidance

Misrule is an inspectable fictional-world rule audit: a user-selected structured-output model reconciles author-declared rules with narrative spans, exposes exact contradiction paths, and preserves legitimate ambiguity.

Authority order: Brief 10 for World Pack portability; Brief 09 for the implemented audit trust boundary and Clockwork behavior where Brief 10 does not supersede it; then its D2 amendments, D2 architecture, B3C.1 interface, C2 fixture correction, and frozen Workflow 04 scope.

Trust boundaries:

- Build model input on the server from validated bundled or inline World Packs, projected server-side.
- Keep environment keys, ground truth, captured output, and raw provider output server-only. A browser-supplied BYOK credential may exist only in component memory and the single same-origin request body: never browser storage, logs, evidence, responses, or source.
- Allow server-side provider calls only to exact HTTPS hosts enabled by `MISRULE_ALLOWED_PROVIDER_HOSTS`.
- Validate strict provider shape, citation identity, trace completeness, and kind semantics before normalization.
- Never render raw model output or silently repair an invalid finding.
- Keep reusable logic generic; do not branch on Ashglass IDs or lore.

Required checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

Authorized World Pack scope: bounded structured JSON import/export, browser-local persistence, and later local editing of world metadata, books, rules, and spans. Structured World Pack JSON import is not manuscript or document upload.

Forbidden scope: auth, databases, cloud persistence, manuscript/document uploads or parsing, RAG, embeddings, graph libraries, manuscript-scale claims, or secrets in source.
