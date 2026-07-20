# Browser QA — frontend-first vertical slice

- Run: `2026-07-20T19:21:42+08:00` through `2026-07-20T19:40:16+08:00`
- App: local Next.js development server
- Route modes: `MISRULE_AUDIT_MODE=mock`, then the default live route with no key present
- Capture surface: Codex in-app browser
- Target desktop viewport: `1280 × 900` CSS pixels
- Compact viewport: `680 × 900` CSS pixels

The desktop viewport override was verified from DOM geometry at 1280 CSS pixels. The in-app browser's visible screenshot pane captured 908 physical pixels of that desktop viewport; filenames disclose both the target viewport and capture width. The compact capture is a complete 680-pixel frame.

## Verified paths

- Entrance gives focus to `Open the Ashglass archive`.
- Entrance is modal and contains Tab focus until the archive is opened.
- Initial state discloses `Deterministic mock gateway · not live` before any request.
- Clockwork instrument exposes exactly five stations and three semantic SVG rings.
- Desktop document geometry remained `1280` pixels wide with no horizontal overflow.
- Pending state exposed `Auditing paths` and `Indeterminate · awaiting one server response`; no fabricated phases or percentage appeared.
- Accepted result disclosed `2 findings accepted` and `Deterministic mock · not live`.
- Contradiction detail showed a closed route for `finding-01` and exact citations `RG-R03`, `RG-R04`, `RG-S01`, and `RG-S02`.
- Citation jump from the finding to `RG-S01` moved to Record, selected the exact source element, and placed focus on `#RG-S01`; Return restored the finding.
- Ambiguity detail showed two supported readings, the missing basin-reflection fact, and exact citations `RG-R09`, `RG-S09`, and `RG-S10`.
- Escape returned from finding detail to the findings list.
- `Alt+2` selected Rules. ArrowRight from Rules selected Record and retained focus on the Record station.
- The world drawer focused its only control, trapped Tab, closed on Escape, and restored focus to the world seal.
- Default live-route copy states that access is checked on request instead of claiming readiness.
- With no API key present, the live route returned `SERVICE_MISCONFIGURED`; a focus-contained dialog accepted no partial finding, trapped Tab, closed on Escape, and restored focus to the audit control.
- Compact geometry remained `680` pixels wide with no horizontal overflow; the instrument and archive leaf stacked into a readable document flow.
- Browser console produced no warnings or errors during the verified paths.

## Captures

- `02-clockwork-overview-target-1280-capture-908.jpg` — overview composition at the target desktop layout.
- `03-closed-contradiction-target-1280-capture-908.jpg` — closed contradiction trace.
- `04-open-ambiguity-target-1280-capture-908.jpg` — unresolved ambiguity and missing-fact topology.
- `05-compact-overview-680.jpg` — complete compact layout.
- `06-live-route-missing-key-dialog.jpg` — truthful, focus-contained missing-access failure.

## Boundary

This QA proves the deterministic mock path through the real route, validator, normalizer, reducer, and UI boundaries. It is not a live GPT-5.6 proof. `OPENAI_API_KEY` was unavailable in the execution environment, so no live provider response or captured fallback was produced.
