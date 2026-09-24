---
'graphora': minor
---

Add a runtime plugin contract (`runtime.use()`), computation events for computed
evaluations and effect runs, and a versioned event schema.

Add dependency-free integration subpaths: `graphora/opentelemetry` (span
exporter), `graphora/inspector` (read-only tools and MCP adapter helpers),
`graphora/devtools` (message bridge), and `graphora/store`
(`useSyncExternalStore`-compatible stores with Svelte and microtask helpers).

Fix consumers of a failing computed not being invalidated again after the
computed's sources changed.
