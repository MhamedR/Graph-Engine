# graph-engine

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
