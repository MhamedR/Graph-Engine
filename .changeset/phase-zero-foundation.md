---
'graph-engine': major
---

Separate low-level reactive primitives into `graph-engine/advanced`.

Harden runtime disposal, runtime ownership, scheduler and batch error
semantics, duplicate IDs, queued changes, deep-chain behavior, and dependency
reconciliation performance.

Require payloads for non-string `Node<T>` instances and add Node.js 20 support
metadata, package smoke testing, coverage gates, and release documentation.

Add opt-in structured runtime tracing, causal invalidation explanations,
changed-edge snapshot diffs, an explicit asynchronous scheduler, strict sync
scheduler contracts, and CI performance regression budgets.
