import type {ReactiveNodeKind} from './reactive-node.js';

/**
 * Configuration for runtime event capture.
 */
export interface ReactiveRuntimeOptions {
  /**
   * Maximum number of recent events retained by the runtime.
   *
   * The default is `0`, which disables retention. Subscribers still receive
   * live events when no buffer is configured.
   */
  readonly traceBufferSize?: number;
}

/**
 * Why a reactive node currently or most recently became invalid.
 */
export interface ReactiveInvalidationReason {
  /** Sequence of the matching event, or undefined when tracing was disabled. */
  readonly sequence: number | undefined;
  readonly epoch: number;
  readonly sourceNodeId: string;
  readonly producerNodeId: string;
  readonly path: readonly string[];
}

interface ReactiveRuntimeEventBase {
  readonly sequence: number;
  readonly timestamp: number;
  readonly epoch: number;
}

export interface ReactiveNodeRegisteredEvent extends ReactiveRuntimeEventBase {
  readonly type: 'node-registered';
  readonly nodeId: string;
  readonly nodeKind: ReactiveNodeKind;
}

export interface ReactiveNodeDisposedEvent extends ReactiveRuntimeEventBase {
  readonly type: 'node-disposed';
  readonly nodeId: string;
  readonly nodeKind: ReactiveNodeKind;
}

export interface ReactiveNodeChangedEvent extends ReactiveRuntimeEventBase {
  readonly type: 'node-changed';
  readonly nodeId: string;
  readonly nodeKind: ReactiveNodeKind;
  readonly version: number;
}

export interface ReactiveNodeInvalidatedEvent extends ReactiveRuntimeEventBase {
  readonly type: 'node-invalidated';
  readonly nodeId: string;
  readonly nodeKind: ReactiveNodeKind;
  readonly reason: ReactiveInvalidationReason;
}

export interface ReactiveBatchStartedEvent extends ReactiveRuntimeEventBase {
  readonly type: 'batch-started';
  readonly depth: number;
}

export interface ReactiveBatchCompletedEvent extends ReactiveRuntimeEventBase {
  readonly type: 'batch-completed';
  readonly depth: number;
  readonly changedNodeIds: readonly string[];
  readonly deferredTaskCount: number;
  readonly failed: boolean;
}

/**
 * Structured events emitted by a ReactiveRuntime.
 */
export type ReactiveRuntimeEvent =
  | ReactiveNodeRegisteredEvent
  | ReactiveNodeDisposedEvent
  | ReactiveNodeChangedEvent
  | ReactiveNodeInvalidatedEvent
  | ReactiveBatchStartedEvent
  | ReactiveBatchCompletedEvent;

/**
 * Listener for live runtime events.
 */
export type ReactiveRuntimeEventListener = (event: ReactiveRuntimeEvent) => void;

export interface ReactiveTraceQuery {
  readonly sinceSequence?: number;
  readonly limit?: number;
}

/**
 * Machine-readable explanation of one registered reactive node.
 */
export interface ReactiveNodeExplanation {
  readonly nodeId: string;
  readonly kind: ReactiveNodeKind;
  readonly version: number;
  readonly dirty: boolean;
  readonly computing: boolean;
  readonly producerIds: readonly string[];
  readonly consumerIds: readonly string[];
  readonly invalidation: ReactiveInvalidationReason | undefined;
}
