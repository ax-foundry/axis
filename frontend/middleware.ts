// API key injection is handled in app/api/[...path]/route.ts (Node.js runtime)
// so that headers are reliably forwarded to the Cloud Run backend.
// Middleware is kept minimal — extend here for auth, i18n, etc.
export {};
