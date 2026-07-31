# Launch notes (locked direction)

**Initial public launch:** Free + Organize ($15/mo). **Agent ($29/mo) is waitlist only** — ship after audience demand (Stage 7).

Positioning: short-film prep done really well. Features/series can still use it — we just don't market them first. No page-upload limit.

**Privacy (launch):** Free and Organize store **scene slugs + scene numbers only** — not dialogue or action. Client-side PDF parse; server never persists script bodies. See Stage 1 in the launch plan.

---

## Tiers at initial launch (Gates 0–6)

| | **Free** | **Organize** | **Agent** (not sold yet) |
|---|----------|--------------|--------------------------|
| Price | $0 | **$15/mo** | **$29/mo** (waitlist) |
| Projects | 1 | Unlimited | Unlimited (reserved) |
| Scripts / project | 1 | Unlimited | Unlimited (reserved) |
| Org (canvas, schedule, export, remap) | Full | Full | Full (reserved) |
| Script storage | Slugs only | Slugs only | Slugs only (reserved) |
| Agent / dramaturg | **Off** | **Off** | On after Stage 7 |
| Agent calls / mo | 0 | 0 | ~180 (reserved) |

### Upgrade story

> Free to organize one film. Organize when you need more projects or episodes. Agent when canvas riff + performance-notes Generate ships — join the waitlist until then.

### Agent waitlist (launch)

- No Stripe Checkout for Agent at go-live.
- Optional **coming soon / waitlist** CTA (email capture only).
- Agent tier unlocks: canvas riff, performance-notes Generate, monthly action quota — **never full uploaded script bodies in AI prompts**.

---

## Pre-launch product work

### Shipped / in progress

- [x] Org-first canvas: shot list, image grid, layout templates, export appendix controls
- [x] Script revision review modal (slug-level diff rework in Stage 1E)
- [x] Performance notes + scene synopsis canvas nodes

### Remaining before go-live (by stage)

- [ ] **Stage 1:** Slug-only ingest, client parse, empty `rawText` on server
- [ ] **Stage 2:** Enforce Free/Organize entitlements (projects, scripts, agent off)
- [ ] **Stage 3:** Upload copy, scene panel (no server screenplay reader), replace-script UX polish
- [ ] **Stage 4:** Stripe Checkout + Portal for Organize $15 only
- [ ] **Stage 5:** Turso/Neon + R2, backups, staging smoke
- [ ] **Stage 6:** Privacy Policy + ToS (Free/Organize claims), waitlist CTA, go-live

---

## Out of scope for initial launch

- **Agent product sale** ($29 Checkout, dramaturg chat, Generate) — waitlist only
- Full-script body storage on any tier
- Full-script dramaturg distill from uploaded PDF text
- OAuth / SSO
- Heavy monitoring / observability stack
- Starter / legacy Prep ($19) or Pro ($35) tiers
- Page-count upload caps

---

## Plan enum (locked)

Stored on `users.plan`:

| Value | Meaning |
|-------|---------|
| `null` or `"free"` | Free tier |
| `"organize"` | Organize $15/mo |
| `"dramaturg"` | Agent $29/mo — **reserved**, not granted at launch |

Legacy `"prep"` in dev DBs should normalize to `"organize"` during Stage 2 migration.

Implementation: [`src/lib/entitlements.ts`](../src/lib/entitlements.ts)
