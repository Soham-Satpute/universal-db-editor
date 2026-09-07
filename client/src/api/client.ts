import axios from "axios";

// Base URL is '/api' — the Vite dev server proxies that to the
// Express backend on :3001 (see vite.config.ts), and in production
// the same path is served from behind the same origin/nginx config
// (see client/Dockerfile, added Day 6).
export const api = axios.create({
  baseURL: "/api",
});
