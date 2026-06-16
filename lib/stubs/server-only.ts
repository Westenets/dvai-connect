// Empty stub. The real `server-only` package throws at client-import
// time to keep server-only modules from leaking into client bundles.
// In vitest we always run in node, so the safety isn't needed.
export {};
