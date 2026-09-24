# graph-engine

## 2.0.0

### Major Changes

- 2d9038d: Separate low-level reactive primitives into `graph-engine/advanced`.

  Harden runtime disposal, runtime ownership, scheduler and batch error
  semantics, duplicate IDs, queued changes, deep-chain behavior, and dependency
  reconciliation performance.

  Require payloads for non-string `Node<T>` instances and add Node.js 20 support
  metadata, package smoke testing, coverage gates, and release documentation.

  Add opt-in structured runtime tracing, causal invalidation explanations,
  changed-edge snapshot diffs, an explicit asynchronous scheduler, strict sync
  scheduler contracts, and CI performance regression budgets.

### Minor Changes

- cf5744c: Add a runtime plugin contract (`runtime.use()`), computation events for computed
  evaluations and effect runs, and a versioned event schema.

  Add dependency-free integration subpaths: `graph-engine/opentelemetry` (span
  exporter), `graph-engine/inspector` (read-only tools and MCP adapter helpers),
  `graph-engine/devtools` (message bridge), and `graph-engine/store`
  (`useSyncExternalStore`-compatible stores with Svelte and microtask helpers).

  Fix consumers of a failing computed not being invalidated again after the
  computed's sources changed.

## Unreleased

### Changed

- Separated low-level reactive primitives into the `graph-engine/advanced` subpath.
- Hardened runtime disposal, scheduler errors, runtime ownership, and node identity.
- Made deep and wide reactive updates scale predictably with a stable computation-depth limit.
- Added package-level consumer smoke tests and production release checks.
- Added opt-in structured runtime events, bounded trace retention, causal
  invalidation paths, and `runtime.explain()`.
- Added node kinds and changed-edge reporting to reactive graph diagnostics.
- Added an explicit async scheduler and runtime rejection of async work passed
  to synchronous schedulers.
- Added executable performance regression budgets to CI.
- Added `runtime.use()` plugins, computation events, and a versioned event schema.
- Added `graph-engine/opentelemetry`, `graph-engine/inspector` (with MCP
  helpers), `graph-engine/devtools`, and `graph-engine/store` integration
  subpaths with no runtime dependencies.
- Published benchmark results as CI artifacts and job summaries.

### Fixed

- Consumers that observed a failing computed are invalidated again when the
  computed's sources change.
