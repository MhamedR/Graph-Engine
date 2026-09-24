import type {ReactiveNodeKind} from './reactive-node.js';
import type {ReactiveRuntime} from './reactive-runtime.js';

/**
 * Version of the runtime event and explanation shapes.
 *
 * Integrations that persist or transmit events should record this value.
 * It changes only when an existing field is removed or changes meaning.
 */
export const REACTIVE_EVENT_SCHEMA_VERSION = 1;

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
 * Node kinds whose user callbacks are evaluated by the runtime.
 */
export type ReactiveComputationKind = Exclude<ReactiveNodeKind, 'value'>;

export interface ReactiveComputationStartedEvent extends ReactiveRuntimeEventBase {
  readonly type: 'computation-started';
  readonly nodeId: string;
  readonly nodeKind: ReactiveComputationKind;
}

export interface ReactiveComputationCompletedEvent extends ReactiveRuntimeEventBase {
  readonly type: 'computation-completed';
  readonly nodeId: string;
  readonly nodeKind: ReactiveComputationKind;
  /** Sequence of the matching `computation-started` event. */
  readonly startedSequence: number;
  readonly durationMs: number;
  readonly status: 'success' | 'error';
  /** Whether a computed produced a new value; undefined for effects and failures. */
  readonly valueChanged: boolean | undefined;
  /** Error message when the callback threw. */
  readonly error: string | undefined;
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
  | ReactiveBatchCompletedEvent
  | ReactiveComputationStartedEvent
  | ReactiveComputationCompletedEvent;

/**
 * Discriminant of every runtime event.
 */
export type ReactiveRuntimeEventType = ReactiveRuntimeEvent['type'];

/**
 * Extension installed into a runtime with `runtime.use()`.
 *
 * `install` may return a cleanup callback. Cleanup runs when the plugin is
 * removed or when the runtime is disposed, in reverse installation order.
 */
export interface ReactiveRuntimePlugin {
  /** Unique plugin name within one runtime. */
  readonly name: string;
  install(runtime: ReactiveRuntime): void | (() => void);
}

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
