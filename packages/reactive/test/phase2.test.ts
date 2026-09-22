import {
  AsyncReactiveScheduler,
  ManualEffectScheduler,
  ReactiveComputed,
  ReactiveRuntime,
  ReactiveScheduler,
  ReactiveValue,
  diffReactiveGraphSnapshots,
} from '../index.js';
import {assert} from '../../../test/assert.js';

function testCausalRuntimeEvents(): void {
  const runtime = new ReactiveRuntime({traceBufferSize: 32});
  const liveEventTypes: string[] = [];
  runtime.subscribe((event) => liveEventTypes.push(event.type));
  runtime.subscribe(() => {
    throw new Error('observer failures must be isolated');
  });

  const source = new ReactiveValue(runtime, 'source', 2);
  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);
  const quadrupled = new ReactiveComputed(runtime, 'quadrupled', () => doubled.value * 2);

  assert(quadrupled.value === 8, 'the computed chain should establish dependencies');

  source.value = 3;

  const explanation = runtime.explain('quadrupled');
  assert(explanation.kind === 'computed', 'explain should include the node kind');
  assert(explanation.dirty, 'the downstream computed should be dirty');
  assert(
    explanation.invalidation?.sourceNodeId === 'source',
    'the explanation should identify the root invalidation source',
  );
  assert(
    explanation.invalidation?.producerNodeId === 'doubled',
    'the explanation should identify the immediate producer',
  );
  assert(
    explanation.invalidation?.path.join('>') === 'source>doubled>quadrupled',
    'the explanation should retain the complete causal path',
  );

  const events = runtime.getTrace();
  const changeIndex = events.findIndex(
    (event) => event.type === 'node-changed' && event.nodeId === 'source',
  );
  const invalidationIndex = events.findIndex(
    (event) => event.type === 'node-invalidated' && event.nodeId === 'quadrupled',
  );

  assert(changeIndex !== -1, 'the trace should include source changes');
  assert(
    invalidationIndex > changeIndex,
    'change events should precede their downstream invalidation events',
  );
  assert(
    liveEventTypes.length === events.length,
    'live subscribers should observe every retained event',
  );
  assert(
    runtime.state.eventListenerErrorCount === events.length,
    'listener failures should be isolated and counted',
  );
}

function testTraceRetentionAndCursor(): void {
  const runtime = new ReactiveRuntime({traceBufferSize: 2});

  new ReactiveValue(runtime, 'first', 1);
  new ReactiveValue(runtime, 'second', 2);
  new ReactiveValue(runtime, 'third', 3);

  const retained = runtime.getTrace();
  assert(retained.length === 2, 'the trace should enforce its retention limit');
  assert(
    retained[0]?.type === 'node-registered' && retained[0]?.nodeId === 'second',
    'the trace should evict its oldest event',
  );

  const cursor = retained[0]?.sequence ?? 0;
  const afterCursor = runtime.getTrace({sinceSequence: cursor, limit: 1});
  assert(afterCursor.length === 1, 'trace cursors and limits should compose');
  assert((afterCursor[0]?.sequence ?? 0) > cursor, 'cursor results should be strictly newer');
}

function testBatchEvents(): void {
  const runtime = new ReactiveRuntime({traceBufferSize: 16});
  const value = new ReactiveValue(runtime, 'value', 0);

  runtime.batch(() => {
    value.value = 1;
    value.value = 2;
  });

  const completed = runtime.getTrace().find((event) => event.type === 'batch-completed');

  assert(completed?.type === 'batch-completed', 'the trace should include batch completion');
  assert(
    completed?.type === 'batch-completed' &&
      completed.changedNodeIds.length === 1 &&
      completed.changedNodeIds[0] === 'value',
    'batch events should report coalesced changed nodes',
  );
  assert(completed?.failed === false, 'successful batches should be reported as successful');
}

function testChangedEdgeDiffsAndNodeKinds(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 1);
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value + 1);

  assert(computed.value === 2, 'the computed should establish its source edge');
  const previous = runtime.createGraphSnapshot();

  source.value = 2;
  const current = runtime.createGraphSnapshot();
  const diff = diffReactiveGraphSnapshots(previous, current);

  assert(
    current.nodes.find((node) => node.id === 'computed')?.kind === 'computed',
    'snapshots should preserve concrete node kinds',
  );
  assert(diff.addedEdges.length === 0, 'an existing changed edge should not be re-added');
  assert(diff.removedEdges.length === 0, 'an existing changed edge should not be removed');
  assert(diff.changedEdges.length === 1, 'edge version or staleness changes should be reported');
  assert(
    diff.changedEdges[0]?.current.stale === true,
    'the invalidated source edge should be stale',
  );
}

function testSynchronousSchedulersRejectAsyncTasks(): void {
  for (const scheduler of [new ReactiveScheduler(), new ManualEffectScheduler()]) {
    scheduler.schedule(async () => Promise.resolve());

    let thrown: unknown;

    try {
      scheduler.flush();
    } catch (error) {
      thrown = error;
    }

    assert(thrown instanceof TypeError, 'synchronous schedulers should reject promise results');
  }
}

function testDuplicateTaskCancellation(): void {
  const scheduler = new ReactiveScheduler();
  let runs = 0;
  const task = (): void => {
    runs++;
  };

  scheduler.schedule(task);
  const second = scheduler.schedule(task);
  second.cancel();
  scheduler.flush();

  assert(runs === 1, 'cancellation should target the exact scheduled entry');
}

async function testAsyncScheduler(): Promise<void> {
  const scheduler = new AsyncReactiveScheduler();
  const order: string[] = [];
  let recursiveError: unknown;

  scheduler.schedule(async () => {
    assert(scheduler.isFlushing, 'the async scheduler should expose its active flush state');
    order.push('first:start');
    await Promise.resolve();
    order.push('first:end');

    try {
      await scheduler.flush();
    } catch (error) {
      recursiveError = error;
    }

    scheduler.schedule(() => {
      order.push('deferred');
    });
  });
  scheduler.schedule(async () => {
    order.push('second');
    throw new Error('expected');
  });
  scheduler.schedule(() => {
    order.push('third');
  });

  let thrown: unknown;

  try {
    await scheduler.flush();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, 'async flush should report the first task failure');
  assert(
    order.join(',') === 'first:start,first:end,second,third',
    'async tasks should settle sequentially and continue after failures',
  );
  assert(recursiveError instanceof Error, 'recursive async flushes should be rejected');
  assert(scheduler.pendingCount === 1, 'tasks scheduled during async flush should be deferred');

  await scheduler.flushOne();
  assert(order.at(-1) === 'deferred', 'the deferred async task should run next');
  assert(!scheduler.hasPendingWork, 'flushOne should consume exactly one async task');

  const cancelledScheduler = new AsyncReactiveScheduler();
  let cancelledRuns = 0;
  const handle = cancelledScheduler.schedule(() => {
    cancelledRuns++;
  });
  handle.cancel();
  handle.cancel();
  assert(!cancelledScheduler.hasPendingWork, 'async task cancellation should be idempotent');

  cancelledScheduler.schedule(() => {
    cancelledRuns++;
  });
  cancelledScheduler.clear();
  await cancelledScheduler.flush();
  assert(cancelledRuns === 0, 'cleared async tasks should not execute');
}

testCausalRuntimeEvents();
testTraceRetentionAndCursor();
testBatchEvents();
testChangedEdgeDiffsAndNodeKinds();
testSynchronousSchedulersRejectAsyncTasks();
testDuplicateTaskCancellation();
await testAsyncScheduler();
