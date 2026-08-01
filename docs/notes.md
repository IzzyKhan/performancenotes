# Dev notes (addressed)

- **Organize UI before Stripe:** Free-tier controls for multi-project / multi-script are hidden until `NEXT_PUBLIC_ENABLE_ORGANIZE_CHECKOUT=true` (Stage 4). When enabled, greyed upgrade buttons + toasts return.
- **Scripts without slug lines / scene numbers:** PDFs with no INT./EXT. headings fail import with a clear error (no silent single-scene fallback). Headings without production numbers import successfully; a toast explains that scenes use import order (1, 2, 3…).
