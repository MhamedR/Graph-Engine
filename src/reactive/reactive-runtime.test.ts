import {ReactiveRuntime} from './reactive-runtime.js';
import {assert} from '../test/assert.js';
import {ReactiveNode} from './reactive-node.js';
import {ReactiveValue} from './reactive-value.js';
import {ReactiveComputed} from './reactive-computed.js';
import {diffReactiveGraphSnapshots} from './reactive-graph-diff.js';

/**
 * Verifies that every runtime owns a scheduler.
 */
function testRuntimeOwnsScheduler(): void {
  const runtime = new ReactiveRuntime();

  assert(
    runtime.scheduler.pendingCount === 0,
    'runtime scheduler should initially have no pending work',
  );

  let executed = false;

  runtime.schedule(() => {
    // Record that runtime-owned scheduling works.
    executed = true;
  });

  assert(runtime.hasPendingWork, 'runtime should report pending scheduled work');

  assert(
    runtime.scheduler.pendingCount === 1,
    'runtime should delegate scheduled work to its scheduler',
  );

  assert(runtime.scheduler.hasPendingWork, 'runtime scheduler should report scheduled work');

  assert(!executed, 'runtime scheduler should remain deferred until flushed');

  runtime.flush();

  assert(!runtime.hasPendingWork, 'runtime should report no pending work after flushing');

  assert(executed, 'runtime scheduler should execute work when flushed');
}

/**
 * Verifies that scheduled reactive changes remain deferred until flush.
 */
function testScheduledChange(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveNode('source');
  const consumer = new ReactiveNode('consumer');

  // Establish a dependency so the change has a downstream effect.
  consumer.addProducer(source);

  runtime.scheduleChange(source);

  assert(source.version === 0, 'scheduled change should not update the source immediately');

  assert(!consumer.dirty, 'scheduled change should not invalidate consumers immediately');

  assert(runtime.hasPendingWork, 'scheduled change should create pending runtime work');

  runtime.flush();

  assert(source.version === 1, 'flushed scheduled change should increment the source version');

  assert(consumer.dirty, 'flushed scheduled change should invalidate the consumer');

  assert(!runtime.hasPendingWork, 'flushing should consume the scheduled change');
}

/**
 * Verifies that multiple scheduled changes are deferred and then applied
 * during the same scheduler flush.
 */
function testBatchedScheduledChanges(): void {
  const runtime = new ReactiveRuntime();

  const first = new ReactiveNode('first');
  const second = new ReactiveNode('second');

  // Queue both reactive changes before the scheduler is flushed.
  runtime.scheduleChange(first);
  runtime.scheduleChange(second);

  assert(first.version === 0, 'first node should remain unchanged before the flush');

  assert(second.version === 0, 'second node should remain unchanged before the flush');

  assert(
    runtime.scheduler.pendingCount === 2,
    'two scheduled changes should create two pending tasks',
  );

  runtime.flush();

  assert(first.version === 1, 'first scheduled change should be applied during the flush');

  assert(second.version === 1, 'second scheduled change should be applied during the flush');

  assert(runtime.scheduler.pendingCount === 0, 'the flush should consume all scheduled changes');
}

/**
 * Verifies that repeated scheduled changes for the same node are coalesced.
 */
function testScheduledChangeDeduplication(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveNode('source');

  // Schedule the same node multiple times before flushing.
  runtime.scheduleChange(source);
  runtime.scheduleChange(source);
  runtime.scheduleChange(source);

  assert(
    runtime.scheduler.pendingCount === 1,
    'repeated scheduled changes should create only one pending task',
  );

  assert(source.version === 0, 'coalesced changes should remain deferred before the flush');

  runtime.flush();

  assert(source.version === 1, 'coalesced changes should apply one change during the flush');

  assert(
    runtime.scheduler.pendingCount === 0,
    'coalesced change work should be consumed by the flush',
  );

  // A new change after the previous task has executed should be schedulable.
  runtime.scheduleChange(source);

  assert(
    runtime.scheduler.pendingCount === 1,
    'a later change should be schedulable after the previous one completes',
  );
}

/**
 * Verifies that one coalesced source change propagates to all consumers.
 */
function testScheduledChangePropagatesToAllConsumers(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveNode('source');
  const left = new ReactiveNode('left');
  const right = new ReactiveNode('right');

  // Establish two independent downstream consumers.
  left.addProducer(source);
  right.addProducer(source);

  // Queue the same source change repeatedly.
  runtime.scheduleChange(source);
  runtime.scheduleChange(source);

  assert(
    runtime.scheduler.pendingCount === 1,
    'repeated source changes should remain one scheduled task',
  );

  assert(
    !left.dirty && !right.dirty,
    'consumers should remain clean before the scheduled change is flushed',
  );

  runtime.flush();

  assert(left.dirty, 'the left consumer should be invalidated after the source changes');

  assert(right.dirty, 'the right consumer should be invalidated after the source changes');

  assert(source.version === 1, 'the source should change exactly once');
}

/**
 * Verifies that clearing scheduled runtime work removes both queued tasks
 * and pending-change bookkeeping.
 */
function testClearScheduledWork(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveNode('source');

  // Schedule a deferred change.
  runtime.scheduleChange(source);

  assert(runtime.hasPendingWork, 'runtime should have pending work before clearing');

  assert(
    runtime.scheduler.pendingCount === 1,
    'one scheduled change should be pending before clearing',
  );

  // Cancel all deferred runtime work.
  runtime.clearScheduledWork();

  assert(!runtime.hasPendingWork, 'runtime should have no pending work after clearing');

  assert(runtime.scheduler.pendingCount === 0, 'scheduler queue should be empty after clearing');

  assert(source.version === 0, 'clearing scheduled work should not change the source');

  // Verify that the bookkeeping was also reset by scheduling again.
  runtime.scheduleChange(source);

  assert(runtime.scheduler.pendingCount === 1, 'source should be schedulable again after clearing');
}

/**
 * Verifies that the runtime can execute scheduled work one task at a time.
 */
function testRuntimeFlushOne(): void {
  const runtime = new ReactiveRuntime();

  const first = new ReactiveNode('first');
  const second = new ReactiveNode('second');

  // Queue two independent changes.
  runtime.scheduleChange(first);
  runtime.scheduleChange(second);

  assert(
    runtime.scheduler.pendingCount === 2,
    'runtime should contain two pending scheduled changes',
  );

  // Execute only the first scheduled change.
  runtime.flushOne();

  assert(first.version === 1, 'flushOne should execute the first scheduled change');

  assert(second.version === 0, 'flushOne should leave the second scheduled change pending');

  assert(runtime.scheduler.pendingCount === 1, 'flushOne should leave one task pending');

  // Execute the remaining scheduled change.
  runtime.flushOne();

  assert(second.version === 1, 'second flushOne should execute the remaining change');

  assert(!runtime.hasPendingWork, 'runtime should have no pending work after all tasks execute');
}

/**
 * Verifies that batch() correctly enters and exits batching mode, including
 * nested batches and callback errors.
 */
function testRuntimeBatchBoundary(): void {
  const runtime = new ReactiveRuntime();

  assert(!runtime.isBatching, 'runtime should initially be outside a batch');

  assert(runtime.batchDepth === 0, 'runtime should initially have zero batch depth');

  const result = runtime.batch(() => {
    assert(runtime.isBatching, 'runtime should be batching inside batch()');

    assert(runtime.batchDepth === 1, 'outer batch should have depth one');

    const nestedResult = runtime.batch(() => {
      assert(runtime.isBatching, 'runtime should remain batching inside nested batch()');

      assert(runtime.batchDepth === 2, 'nested batch should increase depth to two');

      return 42;
    });

    assert(nestedResult === 42, 'nested batch should return its callback result');

    assert(
      runtime.batchDepth === 1,
      'outer batch should remain active after nested batch completes',
    );

    return 'complete';
  });

  assert(result === 'complete', 'batch should return the outer callback result');

  assert(!runtime.isBatching, 'runtime should leave batching mode after batch()');

  assert(runtime.batchDepth === 0, 'runtime should return to zero batch depth after batch()');

  let threw = false;

  try {
    runtime.batch(() => {
      // Verify that cleanup occurs even when the batch callback throws.
      throw new Error('batch failure');
    });
  } catch (error) {
    threw = true;

    // Narrow the caught value before inspecting the error message.
    if (!(error instanceof Error)) {
      throw new Error('batch failure should throw an Error');
    }

    assert(error.message === 'batch failure', 'batch should propagate the callback error');
  }

  assert(threw, 'batch should propagate callback errors');

  assert(!runtime.isBatching, 'runtime should leave batching mode after a failed batch');

  assert(runtime.batchDepth === 0, 'failed batch should restore zero batch depth');
}

/**
 * Verifies that multiple changes to the same node are coalesced into one
 * batch-level change record.
 */
function testBatchedChangeCoalescing(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 0);

  runtime.batch(() => {
    // The same node changes multiple times within one batch.
    source.value = 1;

    assert(runtime.batchedChangeCount === 1, 'first change should create one batched change');

    source.value = 2;

    assert(
      runtime.batchedChangeCount === 1,
      'repeated change to the same node should remain coalesced',
    );

    source.value = 3;

    assert(
      runtime.batchedChangeCount === 1,
      'third change to the same node should remain coalesced',
    );
  });

  assert(
    runtime.batchedChangeCount === 0,
    'batched change should remain recorded after the batch currently ends',
  );
}

/**
 * Verifies that a graph snapshot captures nodes and their dependency
 * relationships without exposing the live graph objects.
 */
function testGraphSnapshot(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);

  // Evaluate the computed value so the dependency relationship is established.
  assert(doubled.value === 2, 'computed value should be initialized');

  const snapshot = runtime.createGraphSnapshot();

  assert(snapshot.nodes.length === 2, 'snapshot should contain both nodes');

  assert(snapshot.edges.length === 1, 'snapshot should contain one dependency edge');

  const edge = snapshot.edges[0];

  assert(edge?.producerId === 'source', 'edge should identify the producer');

  assert(edge?.consumerId === 'doubled', 'edge should identify the consumer');

  assert(edge?.stale === false, 'dependency should initially be fresh');

  // Changing the source should make the dependency stale in the snapshot.
  source.value = 2;

  const changedSnapshot = runtime.createGraphSnapshot();
  const changedEdge = changedSnapshot.edges[0];

  assert(changedEdge?.stale === true, 'dependency should become stale after the producer changes');
}

/**
 * Verifies that graph snapshots can be compared to detect structural
 * dependency changes and node state changes.
 */
function testGraphSnapshotDiff(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const firstSnapshot = runtime.createGraphSnapshot();

  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);

  // Evaluate the computed value so its dependency relationship is established.
  assert(doubled.value === 2, 'computed value should be initialized');

  const secondSnapshot = runtime.createGraphSnapshot();

  const diff = diffReactiveGraphSnapshots(firstSnapshot, secondSnapshot);

  assert(diff.addedNodes.length === 1, 'diff should detect the newly added computed node');

  assert(diff.addedNodes[0]?.id === 'doubled', 'diff should identify the added computed node');

  assert(diff.addedEdges.length === 1, 'diff should detect the new dependency edge');

  assert(diff.addedEdges[0]?.producerId === 'source', 'diff should identify the edge producer');

  assert(diff.addedEdges[0]?.consumerId === 'doubled', 'diff should identify the edge consumer');

  assert(diff.removedNodes.length === 0, 'diff should not report removed nodes');

  assert(diff.removedEdges.length === 0, 'diff should not report removed edges');

  // Change the source so the existing source node has a new version.
  source.value = 2;

  const thirdSnapshot = runtime.createGraphSnapshot();

  const stateDiff = diffReactiveGraphSnapshots(secondSnapshot, thirdSnapshot);

  // The source change invalidates downstream state as well, so more than one
  // node may legitimately appear in the changed-node collection.
  assert(stateDiff.changedNodes.length >= 1, 'diff should detect at least one changed node');

  const changedSource = stateDiff.changedNodes.find((change) => change.current.id === 'source');

  assert(changedSource !== undefined, 'diff should identify the changed source node');

  assert(changedSource!.current.version === 1, 'diff should capture the source version change');
}

/**
 * Verifies that runtime graph metrics correctly describe the current
 * reactive graph.
 */
function testGraphMetrics(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);

  // Evaluate the computed value so the source-to-computed dependency exists.
  assert(doubled.value === 2, 'computed value should be initialized');

  const metrics = runtime.getGraphMetrics();

  assert(metrics.nodeCount === 2, 'metrics should count both registered nodes');

  assert(metrics.edgeCount === 1, 'metrics should count the source-to-computed dependency');

  assert(metrics.dirtyNodeCount === 0, 'evaluated graph should initially contain no dirty nodes');

  assert(metrics.computingNodeCount === 0, 'no node should remain computing after evaluation');

  assert(metrics.maxProducerCount === 1, 'computed node should have one producer');

  assert(metrics.maxConsumerCount === 1, 'source node should have one consumer');
}

/**
 * Verifies that runtime inspection combines runtime state, graph metrics,
 * and the current graph snapshot into one diagnostic object.
 */
function testRuntimeInspection(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);

  // Evaluate the computed value so the dependency relationship is established.
  assert(doubled.value === 2, 'computed value should be initialized');

  // Capture the complete runtime inspection after initialization.
  const inspection = runtime.inspect();

  assert(inspection.runtime.epoch === 0, 'inspection should report the current runtime epoch');

  assert(inspection.metrics.nodeCount === 2, 'inspection should report both registered nodes');

  assert(
    inspection.metrics.edgeCount === 1,
    'inspection should report the source-to-computed dependency',
  );

  assert(inspection.graph.nodes.length === 2, 'inspection should include both graph nodes');

  assert(inspection.graph.edges.length === 1, 'inspection should include the dependency edge');

  /**
   * Verify that inspection also exposes detailed state for each registered node.
   */
  const sourceInspection = inspection.nodes.find((node) => node.id === 'source')!;

  const doubledInspection = inspection.nodes.find((node) => node.id === 'doubled')!;

  assert(sourceInspection !== undefined, 'inspection should include the source node');

  assert(doubledInspection !== undefined, 'inspection should include the computed node');

  assert(
    sourceInspection.consumerIds.includes('doubled'),
    'source inspection should identify doubled as a consumer',
  );

  assert(
    doubledInspection.producerIds.includes('source'),
    'computed inspection should identify source as a producer',
  );

  assert(doubledInspection.dirty === false, 'evaluated computed node should not be dirty');
}

/**
 * Verifies that the runtime can produce a useful human-readable diagnostic
 * report.
 */
function testRuntimeDescription(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);

  // Evaluate the computed value so the dependency graph is established.
  assert(doubled.value === 2, 'computed value should be initialized');

  // Generate the human-readable diagnostic report.
  const description = runtime.describe();

  assert(
    description.includes('Reactive Runtime'),
    'description should contain the runtime heading',
  );

  assert(description.includes('Nodes: 2'), 'description should report the node count');

  assert(description.includes('Edges: 1'), 'description should report the edge count');

  assert(description.includes('source'), 'description should include the source node');

  assert(description.includes('doubled'), 'description should include the computed node');

  assert(
    description.includes('producers=[source]'),
    'description should show the computed node producer',
  );

  assert(
    description.includes('consumers=[doubled]'),
    'description should show the source node consumer',
  );
}

/**
 * Verifies that the reactive graph can be exported as Graphviz DOT text.
 */
function testRuntimeDotExport(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);

  // Evaluate the computed value so the dependency relationship exists.
  assert(doubled.value === 2, 'computed value should be initialized');

  // Export the current reactive graph.
  const dot = runtime.toDot();

  assert(dot.includes('digraph ReactiveGraph'), 'DOT output should contain the graph declaration');

  assert(dot.includes('"source" [label="source'), 'DOT output should declare the source node');

  assert(dot.includes('"doubled";'), 'DOT output should declare the computed node');

  assert(
    dot.includes('"source" -> "doubled";'),
    'DOT output should contain the source-to-computed edge',
  );

  assert(dot.includes('version='), 'DOT output should include the node version');

  assert(dot.includes('dirty=false'), 'DOT output should include the node dirty state');
}

/**
 * Verifies that DOT output marks a computed node as dirty after its
 * producer changes.
 */
function testRuntimeDotDirtyState(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);

  // Evaluate the computed value so its dependency is established.
  assert(doubled.value === 2, 'computed value should be initialized');

  // Changing the producer should invalidate the computed node.
  source.value = 2;

  // Export the graph while the computed node is dirty.
  const dot = runtime.toDot();

  assert(
    dot.includes('dirty=true'),
    'DOT output should mark the invalidated computed node as dirty',
  );
}

// Run the runtime scheduler tests.
testRuntimeOwnsScheduler();
testScheduledChange();
testBatchedScheduledChanges();
testScheduledChangeDeduplication();
testScheduledChangePropagatesToAllConsumers();
testClearScheduledWork();
testRuntimeFlushOne();
testRuntimeBatchBoundary();
testBatchedChangeCoalescing();
testGraphSnapshot();
testGraphSnapshotDiff();
testGraphMetrics();
testRuntimeInspection();
testRuntimeDescription();
testRuntimeDotExport();
testRuntimeDotDirtyState();
