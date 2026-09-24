/**
 * OpenTelemetry integration.
 *
 * The adapter depends only on the structural shape of an OpenTelemetry
 * tracer, so `graphora` does not install `@opentelemetry/api`. Pass the
 * tracer returned by `trace.getTracer()`.
 */

import type {
  ReactiveRuntime,
  ReactiveRuntimeEvent,
  ReactiveRuntimePlugin,
} from '../reactive/index.js';

export type OpenTelemetryAttributeValue = string | number | boolean;
export type OpenTelemetryAttributes = Record<string, OpenTelemetryAttributeValue>;

/** Subset of the OpenTelemetry `Span` interface used by the adapter. */
export interface OpenTelemetrySpanLike {
  setAttribute(key: string, value: OpenTelemetryAttributeValue): unknown;
  addEvent(name: string, attributes?: OpenTelemetryAttributes): unknown;
  setStatus(status: {code: number; message?: string}): unknown;
  end(): void;
}

/** Subset of the OpenTelemetry `Tracer` interface used by the adapter. */
export interface OpenTelemetryTracerLike<Span extends OpenTelemetrySpanLike, Context> {
  startSpan(
    name: string,
    options?: {attributes?: OpenTelemetryAttributes},
    context?: Context,
  ): Span;
}

export interface OpenTelemetryPluginOptions<Span extends OpenTelemetrySpanLike, Context> {
  readonly tracer: OpenTelemetryTracerLike<Span, Context>;

  /**
   * Returns the context used to parent a child span, usually
   * `(span) => trace.setSpan(context.active(), span)`. Without it, batch and
   * computation spans are recorded as root spans correlated by attributes.
   */
  readonly parentContext?: (parent: Span) => Context;

  /** Record `node-changed` and `node-invalidated` as span events. Defaults to true. */
  readonly recordInvalidations?: boolean;

  /** Plugin name, useful when one runtime exports to several tracers. */
  readonly name?: string;
}

/** OpenTelemetry `SpanStatusCode.ERROR`. */
const SPAN_STATUS_ERROR = 2;

/**
 * Creates a plugin that exports batches and computed/effect evaluations as
 * OpenTelemetry spans.
 *
 * - `graphora.batch` spans cover an outermost `runtime.batch()`.
 * - `graphora.computed` and `graphora.effect` spans cover one callback
 *   evaluation and nest under the active batch or computation.
 * - Source changes and invalidations are attached to the innermost open span.
 */
export function createOpenTelemetryPlugin<Span extends OpenTelemetrySpanLike, Context = never>(
  options: OpenTelemetryPluginOptions<Span, Context>,
): ReactiveRuntimePlugin {
  const {tracer, parentContext} = options;
  const recordInvalidations = options.recordInvalidations ?? true;

  return {
    name: options.name ?? 'graphora:opentelemetry',
    install(runtime: ReactiveRuntime) {
      const openSpans: {readonly sequence: number; readonly span: Span}[] = [];

      const startSpan = (name: string, attributes: OpenTelemetryAttributes): Span => {
        const parent = openSpans.at(-1)?.span;

        if (parent !== undefined && parentContext !== undefined) {
          return tracer.startSpan(name, {attributes}, parentContext(parent));
        }

        return tracer.startSpan(name, {attributes});
      };

      const endSpan = (sequence: number, finish: (span: Span) => void): void => {
        const index = openSpans.findIndex((entry) => entry.sequence === sequence);

        if (index === -1) return;

        // Close anything left open above the matching span so the stack
        // cannot leak after an unexpected event order.
        for (const entry of openSpans.splice(index).reverse()) {
          if (entry.sequence === sequence) finish(entry.span);
          entry.span.end();
        }
      };

      let outermostBatchSequence: number | undefined;

      const onEvent = (event: ReactiveRuntimeEvent): void => {
        switch (event.type) {
          case 'batch-started':
            if (event.depth === 1) {
              outermostBatchSequence = event.sequence;
              openSpans.push({
                sequence: event.sequence,
                span: startSpan('graphora.batch', {'graphora.epoch': event.epoch}),
              });
            }
            break;

          case 'batch-completed':
            if (event.depth === 1 && outermostBatchSequence !== undefined) {
              endSpan(outermostBatchSequence, (span) => {
                span.setAttribute('graphora.batch.changed_nodes', event.changedNodeIds.length);
                span.setAttribute('graphora.batch.deferred_tasks', event.deferredTaskCount);

                if (event.failed) {
                  span.setStatus({code: SPAN_STATUS_ERROR, message: 'Batch failed'});
                }
              });
              outermostBatchSequence = undefined;
            }
            break;

          case 'computation-started':
            openSpans.push({
              sequence: event.sequence,
              span: startSpan(`graphora.${event.nodeKind}`, {
                'graphora.node.id': event.nodeId,
                'graphora.node.kind': event.nodeKind,
                'graphora.epoch': event.epoch,
              }),
            });
            break;

          case 'computation-completed':
            endSpan(event.startedSequence, (span) => {
              span.setAttribute('graphora.duration_ms', event.durationMs);

              if (event.valueChanged !== undefined) {
                span.setAttribute('graphora.value_changed', event.valueChanged);
              }

              if (event.status === 'error') {
                span.setStatus({
                  code: SPAN_STATUS_ERROR,
                  ...(event.error === undefined ? {} : {message: event.error}),
                });
              }
            });
            break;

          case 'node-changed':
            if (recordInvalidations) {
              openSpans.at(-1)?.span.addEvent('graphora.node-changed', {
                'graphora.node.id': event.nodeId,
                'graphora.node.version': event.version,
              });
            }
            break;

          case 'node-invalidated':
            if (recordInvalidations) {
              openSpans.at(-1)?.span.addEvent('graphora.node-invalidated', {
                'graphora.node.id': event.nodeId,
                'graphora.source.id': event.reason.sourceNodeId,
                'graphora.producer.id': event.reason.producerNodeId,
                'graphora.path': event.reason.path.join(' > '),
              });
            }
            break;

          case 'node-registered':
          case 'node-disposed':
            break;
        }
      };

      const unsubscribe = runtime.subscribe(onEvent);

      return () => {
        unsubscribe();

        for (const entry of openSpans.splice(0).reverse()) {
          entry.span.end();
        }
      };
    },
  };
}
