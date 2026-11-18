# Canvas Together

A real-time collaborative whiteboard. No accounts, no sign-up: open a canvas, share the link, and everyone draws on the same board with live cursors and chat.

A single Node process serves the built React app, the REST health endpoint, and the Socket.IO collaboration server, and it persists every board to SQLite on disk.

## Features

- Shared canvas with pen, eraser, rectangle, ellipse, and text tools
- Live stroke previews, remote cursors, participant presence, and per-guest undo/redo
- Built-in team chat, invitation dialog, PNG and PDF export
- Boards survive server restarts and redeploys (SQLite, one file per deployment)
- Rate limiting, payload validation, origin allow-listing, and per-room storage limits
- Responsive layout with keyboard shortcuts (`P` `E` `R` `O` `T`, `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`)

## Layout

```
Dockerfile            multi-stage build: Vite build -> Node runtime on port 3500
render.yaml           Render blueprint (single service, builds Dockerfile)
docker-compose.yml    one-command local container
backend/              Express + Socket.IO + node:sqlite (CommonJS, Node >= 22.13)
whiteboard-app/       React 19 + TypeScript + Vite + react-konva
```

## Run locally

Two terminals, no environment variables needed:

```bash
# terminal 1 - collaboration server on :3500
cd backend && npm install && npm run dev

# terminal 2 - Vite dev server on :5173 (proxies /api and /socket.io to :3500)
cd whiteboard-app && npm install && npm start
```

Open http://localhost:5173.

To run the exact production build locally:

```bash
cd whiteboard-app && npm install && npm run build
cd ../backend && npm install && NODE_ENV=production PORT=3500 node server.js
```

Open http://localhost:3500. Or use the container: `docker compose up --build`.

## Deploy

### Option A - one service on Render (recommended)

The app has no external dependencies, so a single container is the whole deployment.

1. Push this repository to GitHub.
2. In Render, choose **New -> Blueprint**, pick the repository, and apply. `render.yaml` at the repository root configures the Docker build, the `/api/health` check, and the environment.
3. Open the generated `https://<name>.onrender.com` URL. Nothing else to configure.

`render.yaml` uses the **free** plan so it deploys without a payment method. Free containers have no persistent disk and sleep after 15 minutes idle, so a board can be lost on restart and the first visit afterwards takes ~50s to wake. For durable boards, switch the plan to `starter` and uncomment the `disk` block in `render.yaml`.

### Option B - Vercel frontend + Render backend

Use this when you want the static site on a CDN and the Socket.IO server on Render.

1. **Backend on Render**: create a Docker web service from this repository (Dockerfile path `./Dockerfile`). Set:
   - `NODE_ENV=production`
   - `TRUST_PROXY=true`
   - `DATA_DIR=/data`
   - `FRONTEND_ORIGINS=https://your-app.vercel.app` (exact origins, comma separated, no trailing slash)
2. **Frontend on Vercel**: import the repository and set **Root Directory** to `whiteboard-app`. Add the build-time variable:
   - `VITE_BACKEND_URL=https://your-service.onrender.com` (no trailing slash)
3. Redeploy the Vercel project after adding the variable - Vite inlines it at build time. `whiteboard-app/vercel.json` handles the SPA rewrite so `/session/<id>` links open directly.

If the browser console reports `403 Forbidden origin`, the backend's `FRONTEND_ORIGINS` does not exactly match the site's origin (`https://` plus host, no path). If the board stays "Reconnecting", the frontend was built without `VITE_BACKEND_URL` and is trying to reach the API on Vercel.

### Environment variables

The backend reads all of these from the process environment; every one has a working default for local development.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | - | `production` serves `whiteboard-app/dist` from the same server |
| `PORT` | `3500` | HTTP and WebSocket port (Render and Railway inject their own) |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `backend/data` | Directory holding `whiteboard.sqlite`; mount a disk here |
| `TRUST_PROXY` | `false` | Set `true` behind a TLS-terminating proxy (Render, Vercel, nginx) |
| `FRONTEND_ORIGINS` | `http://localhost:5173` in dev, empty in prod | Comma-separated exact origins allowed to connect; same-origin is always allowed |
| `MAX_ROOMS` | `100` | Board limit |
| `MAX_OBJECTS` | `2000` | Strokes per board (undo history included) |
| `MAX_ROOM_BYTES` | `4194304` | Persisted size limit per board |
| `MAX_PARTICIPANTS` | `50` | Guests per board |
| `MAX_CONNECTIONS` | `500` | Concurrent sockets |
| `ROOM_TTL_MS` | `604800000` | Delete empty boards untouched for 7 days |
| `MAINTENANCE_MS` | `60000` | Sweep interval for expired boards and rate limits |
| `VITE_BACKEND_URL` | browser origin | **Frontend build-time** only: API origin when it is not same-origin |

### API keys

None. The whiteboard uses no third-party service - no auth provider, database host, email, analytics, or payment account - so there is nothing to sign up for and no key to paste. The only required account is the hosting provider, and both options above work on free plans.

## Tests

```bash
cd backend && npm test                 # 19 protocol, persistence, origin, and validation tests
cd whiteboard-app && npm test          # Vitest component tests
cd whiteboard-app && npm run test:e2e  # Playwright against a production build on :3500
```

`npm run build` in `whiteboard-app` type-checks with `tsc --noEmit` before bundling.
