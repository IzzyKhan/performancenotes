# Performance Notes

AI-native performance notes for directors. Upload a scene, riff on an infinite **instinct canvas**, and collaborate with a Claude-powered dramaturg agent that distills everything into a structured, on-set-ready **cheat sheet** of objectives and action verbs.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- React Flow (`@xyflow/react`) for the instinct canvas
- Anthropic Claude for the agent
- SQLite via Drizzle + `better-sqlite3` (local / Railway volume persistence)
- `unpdf` for screenplay PDF text extraction
- `@react-pdf/renderer` for cheat sheet PDF export

## Setup (local)

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` with your Anthropic API key:

```bash
cp .env.example .env.local
# then edit .env.local
```

```
ANTHROPIC_API_KEY=sk-ant-...
```

Optional shared-password gate (same as production pilot):

```
BASIC_AUTH_USER=director
BASIC_AUTH_PASSWORD=change-me
```

When `BASIC_AUTH_PASSWORD` is unset, the app stays open (normal local dev).

3. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first load, a demo project (**Kitchen Midnight**) is seeded automatically so you can explore the canvas and agent immediately.

## How to use

1. **Create a project** — paste scene text or upload a screenplay PDF.
2. **Instinct layer** — drop images, audio, reference links, mood tags, and text notes onto the infinite canvas. Annotate each node with *why* it matters.
3. **Agent** — riff with the dramaturg. It sees the scene and every canvas node (images via vision).
4. **Distill** — hit **Distill cheat sheet** to generate beat-by-beat, character-by-character notes (objective, obstacle, action verbs, adjustments, pitfalls).
5. **Edit & export** — hand-edit any cell, then **Export PDF** or print for set.

## Data

Everything lives under `data/`:

- `data/performancenotes.db` — SQLite database
- `data/uploads/` — uploaded images and audio

On Railway, mount a **volume** at `/app/data` so this directory survives redeploys.

## Deploy on Railway (Phase 1 pilot)

Share a password-gated HTTPS link with directors. Everyone with the password shares one workspace until Phase 2 accounts land (see [docs/ROADMAP.md](docs/ROADMAP.md)).

### 1. Push to GitHub

Commit and push this repo to a GitHub remote.

### 2. Create the Railway service

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → select this repo.
2. Railway will build with Nixpacks using [`nixpacks.toml`](nixpacks.toml) / [`railway.toml`](railway.toml) (`better-sqlite3` needs python/gcc/make).

### 3. Persistent volume

1. Service → **Volumes** → **Add Volume**
2. **Mount path:** `/app/data`  
   (must match `process.cwd()/data` — Railway’s app root is `/app`)

Without this volume, SQLite and uploads reset on every deploy.

### 4. Environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `ANTHROPIC_API_KEY` | Yes | Agent + distill |
| `BASIC_AUTH_USER` | Optional | Default `director` if password set |
| `BASIC_AUTH_PASSWORD` | Optional | Enables HTTP Basic Auth for the whole app |
| `AUTH_SECRET` | Recommended | Enables Auth.js accounts; generate with `openssl rand -base64 32` |
| `AUTH_URL` | Prod | Public Railway URL, e.g. `https://….up.railway.app` |
| `ALLOW_SIGNUP` | Optional | Default allow; set `false` for invite-only |
| `NODE_ENV` | Auto | `production` on Railway |
| `PORT` | Auto | Set by Railway; start command binds to it |

Without `AUTH_SECRET`, the app stays open (Phase 1-style shared workspace). With `AUTH_SECRET`, directors sign up / sign in and only see their own projects.

### 5. Domain + health check

1. **Networking** → **Generate domain** (or add a custom domain).
2. Set `AUTH_URL` to that domain when using accounts.
3. Optional health check path: `/api/health` (unauthenticated liveness probe).

### 6. Share with directors

**Phase 1 (Basic Auth only):** send URL + username + password.

**Phase 2 (accounts):** send URL (+ optional Basic Auth password). Directors create accounts at `/signup`, then sign in at `/login`.

### Pilot caveats

- With **Basic Auth only**: one shared workspace.
- With **AUTH_SECRET**: per-director projects; your Anthropic key still pays for everyone’s agent usage until Phase 4 quotas/billing.
- Orphan projects created before accounts (no `user_id`) won’t appear in any user’s list.
### Verify after deploy

1. Open the URL → browser asks for username/password.
2. Create a project, upload a PDF, drop an image on the canvas, open Schedule, export a PDF.
3. Redeploy the service → confirm projects and uploads are still there (volume OK).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run db:studio` | Open Drizzle Studio (optional) |

## Roadmap

Phases 2–4 (accounts → cloud DB/blob → public SaaS) are spelled out in [docs/ROADMAP.md](docs/ROADMAP.md).
