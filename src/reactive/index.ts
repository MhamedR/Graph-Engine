/**
 * Public entry point for the reactive module.
 *
 * Re-exports the core reactive primitives, runtime, scheduler, graph
 * diagnostics, and supporting types from one stable module entry point.
 */

// Runtime and runtime diagnostics.
export {
  ReactiveRuntime,
  type ReactiveGraphMetrics,
  type ReactiveNodeInspection,
  type ReactiveRuntimeInspection,
  type ReactiveRuntimeState,
} from './reactive-runtime.js';

// Core reactive primitives.
export {ReactiveNode} from './reactive-node.js';
export {ReactiveValue} from './reactive-value.js';
export {ReactiveComputed} from './reactive-computed.js';
export {ReactiveEffect} from './reactive-effect.js';

// Reactive scheduling.
export {ReactiveScheduler} from './scheduler.js';

// Reactive dependency links and execution context.
export {ReactiveLink} from './reactive-link.js';
export {ReactiveContext} from './reactive-context.js';
export {Epoch} from './epoch.js';

// Graph snapshots and snapshot comparison.
export {
  type ReactiveGraphSnapshot,
  type ReactiveGraphSnapshotEdge,
  type ReactiveGraphSnapshotNode,
} from './reactive-graph-snapshot.js';

export {
  diffReactiveGraphSnapshots,
  type ReactiveGraphSnapshotDiff,
  type ReactiveGraphSnapshotNodeChange,
} from './reactive-graph-diff.js';
