# Canvas Together - frontend

React 19 + TypeScript + Vite client for the collaborative whiteboard. See the [repository README](../README.md) for the architecture, deployment, and environment variables.

```bash
npm install
npm start          # dev server on :5173, proxies /api and /socket.io to :3500
npm run build      # tsc --noEmit, then a production bundle in dist/
npm test           # Vitest
npm run test:e2e   # Playwright, expects a running server on :3500
```

The backend serves the contents of `dist/` when started with `NODE_ENV=production`.
