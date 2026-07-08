# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## Environment

Local defaults are in `.env.local`. Keep `.env.example` as the committed template.

```env
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://localhost:3000
VITE_YJS_WS_URL=ws://localhost:3000
```

For server deployment, keep `VITE_API_BASE_URL=/api` and reverse proxy `/api` plus the WebSocket path `/collab1` to the backend service. If `VITE_YJS_WS_URL` is not set during build, production will connect to the current site host with `ws://` or `wss://` automatically.

If the WebSocket backend is on a separate domain, set `VITE_YJS_WS_URL` before building, for example:

```env
VITE_YJS_WS_URL=wss://api.example.com
```
