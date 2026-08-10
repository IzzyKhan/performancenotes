# Dev notes (addressed)

- **Paid-tier UI:** When `NEXT_PUBLIC_ENABLE_BILLING_CHECKOUT` is off, paid tiers show as greyed / "launching soon" at limit points (scene cap, project cap, series). Live checkout CTAs appear only when the flag is on. Manual comp via `scripts/set-plan.mjs` works regardless.
- **Scripts without slug lines / scene numbers:** PDFs with no INT./EXT. headings fail import with a clear error (no silent single-scene fallback). Headings without production numbers import successfully; a toast explains that scenes use import order (1, 2, 3…).

Logline: practical pre-production workflows for directors across scripted shorts, features and television.
