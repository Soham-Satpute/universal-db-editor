import { app } from "./app";

/**
 * Entry point — boots the HTTP server on top of the configured
 * Express `app` (see app.ts for middleware/route wiring).
 */
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
