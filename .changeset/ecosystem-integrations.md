---
'graph-engine': minor
---

Add a runtime plugin contract (`runtime.use()`), computation events for computed
evaluations and effect runs, and a versioned event schema.

Add dependency-free integration subpaths: `graph-engine/opentelemetry` (span
exporter), `graph-engine/inspector` (read-only tools and MCP adapter helpers),
`graph-engine/devtools` (message bridge), and `graph-engine/store`
(`useSyncExternalStore`-compatible stores with Svelte and microtask helpers).

Fix consumers of a failing computed not being invalidated again after the
computed's sources changed.
