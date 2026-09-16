/**
 * Public reactive API.
 *
 * Application API:
 * - ReactiveRuntime, ReactiveValue, ReactiveComputed, ReactiveEffect
 * - ReactiveScheduler, ManualEffectScheduler, scheduler types
 * - runtime diagnostics and graph snapshots
 *
 * Advanced API, kept for compatibility:
 * - ReactiveNode, ReactiveLink, ReactiveContext, Epoch
 *   These are the engine's graph primitives. Application code should usually
 *   use values, computeds, and effects rather than mutating nodes directly.
 */

export {
  ReactiveRuntime,
  type ReactiveGraphMetrics,
  type ReactiveNodeInspection,
  type ReactiveRuntimeInspection,
  type ReactiveRuntimeState,
} from './reactive-runtime.js';

export {ReactiveValue} from './reactive-value.js';
export {ReactiveComputed} from './reactive-computed.js';
export {ReactiveEffect} from './reactive-effect.js';

export {ReactiveScheduler} from './scheduler.js';
export {ManualEffectScheduler} from './manual-effect-scheduler.js';
export type {
  ReactiveEffectScheduleHandle,
  ReactiveEffectScheduler,
} from './reactive-scheduler-options.js';

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

export {ReactiveNode} from './reactive-node.js';
export {ReactiveLink} from './reactive-link.js';
export {ReactiveContext} from './reactive-context.js';
export {Epoch} from './epoch.js';
