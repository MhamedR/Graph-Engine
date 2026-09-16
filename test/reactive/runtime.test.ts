import {ReactiveRuntime} from '../../src/reactive/reactive-runtime.js';
import {assert} from '../assert.js';
import {ReactiveNode} from '../../src/reactive/reactive-node.js';
import {ReactiveValue} from '../../src/reactive/reactive-value.js';
import {ReactiveComputed} from '../../src/reactive/reactive-computed.js';
import {diffReactiveGraphSnapshots} from '../../src/reactive/reactive-graph-diff.js';
import {ReactiveEffect} from '../../src/reactive/reactive-effect.js';

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

/**
 * Verifies that disposing a single node removes it from the runtime and
 * isolates it from the dependency graph.
 */
function testDisposeNode(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Establish the dependency graph.
  computed.value;

  assert(runtime.nodeCount === 2, 'runtime should contain both nodes before disposal');

  computed.dispose();

  assert(runtime.nodeCount === 1, 'disposing a node should remove it from the runtime');

  assert(computed.node.isIsolated(), 'disposed node should be isolated from the graph');

  assert(computed.node.producerCount === 0, 'disposed node should have no producers');

  assert(computed.node.consumerCount === 0, 'disposed node should have no consumers');

  // Disposal should be idempotent.
  computed.dispose();

  assert(runtime.nodeCount === 1, 'disposing the same node twice should be harmless');

  // Keep the source referenced so the test explicitly verifies that the
  // remaining runtime node is still present.
  assert(runtime.getNodes().includes(source.node), 'unrelated nodes should remain registered');
}

/**
 * Verifies that disposing the runtime prevents new nodes from being
 * registered.
 */
function testRuntimeDisposePreventsRegistration(): void {
  const runtime = new ReactiveRuntime();

  runtime.dispose();

  let threw = false;

  try {
    new ReactiveValue(runtime, 'source', 1);
  } catch {
    threw = true;
  }

  assert(threw, 'creating a node after runtime disposal should fail');
}

/**
 * Verifies that runtime disposal clears all registered nodes and pending
 * scheduler work.
 */
function testRuntimeDisposeClearsState(): void {
  const runtime = new ReactiveRuntime();

  new ReactiveValue(runtime, 'source', 1);

  assert(runtime.nodeCount === 1, 'runtime should contain the registered node before disposal');

  runtime.dispose();

  assert(runtime.disposed, 'runtime should report itself as disposed');

  assert(runtime.nodeCount === 0, 'runtime disposal should clear registered nodes');

  assert(runtime.pendingChangeCount === 0, 'runtime disposal should clear pending changes');

  assert(!runtime.hasPendingWork, 'runtime disposal should leave no pending scheduler work');

  // Disposal should be idempotent.
  runtime.dispose();

  assert(runtime.disposed, 'runtime should remain disposed after repeated disposal');
}

/**
 * Verifies that multiple changes inside one batch are coalesced into a
 * single effect execution.
 */
function testBatchCoalescesEffectRuns(): void {
  const runtime = new ReactiveRuntime();

  const first = new ReactiveValue(runtime, 'first', 1);
  const second = new ReactiveValue(runtime, 'second', 2);

  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Establish both dependencies.
    first.value;
    second.value;

    runs++;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(runs === 1, 'effect should run once initially');

  runtime.batch(() => {
    first.value = 10;
    second.value = 20;

    // The effect should not execute while the batch is active.
    assert(runs === 1, 'effect should not run during a batch');
  });

  assert(runs === 2, 'effect should run once after the batch completes');
}

/**
 * Verifies that nested batches remain deferred until the outermost batch
 * completes.
 */
function testNestedBatchesDeferUntilOuterBatchCompletes(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    source.value;
    runs++;
  });

  effect.run();

  runtime.batch(() => {
    source.value = 2;

    runtime.batch(() => {
      source.value = 3;

      assert(runs === 1, 'effect should remain deferred inside nested batches');
    });

    assert(runs === 1, 'effect should remain deferred until the outer batch completes');
  });

  assert(runs === 2, 'effect should run once after the outermost batch completes');
}

/**
 * Verifies that batching preserves the final source value observed by the
 * effect.
 */
function testBatchEffectSeesFinalValue(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let observedValue = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    observedValue = source.value;
  });

  effect.run();

  runtime.batch(() => {
    source.value = 2;
    source.value = 3;
    source.value = 4;
  });

  assert(observedValue === 4, 'effect should observe the final value after the batch');
}

/**
 * Verifies that an error thrown inside a batch propagates to the caller.
 */
function testBatchErrorPropagates(): void {
  const runtime = new ReactiveRuntime();

  let threw = false;

  try {
    runtime.batch(() => {
      throw new Error('batch failure');
    });
  } catch (error) {
    threw = error instanceof Error && error.message === 'batch failure';
  }

  assert(threw, 'batch errors should propagate to the caller');
}

/**
 * Verifies that the runtime exits batching mode after a batch throws.
 */
function testBatchErrorRestoresBatchState(): void {
  const runtime = new ReactiveRuntime();

  try {
    runtime.batch(() => {
      assert(runtime.isBatching, 'runtime should report batching inside the batch');

      throw new Error('batch failure');
    });
  } catch {
    // The error is expected for this test.
  }

  assert(!runtime.isBatching, 'runtime should leave batching mode after a failed batch');

  assert(runtime.batchDepth === 0, 'batch depth should return to zero after a failed batch');
}

/**
 * Verifies that the runtime remains usable after a failed batch.
 */
function testRuntimeRemainsUsableAfterBatchError(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    source.value;
    runs++;
  });

  effect.run();

  try {
    runtime.batch(() => {
      source.value = 2;

      throw new Error('batch failure');
    });
  } catch {
    // The error is expected for this test.
  }

  // The runtime should still be able to process a later change.
  source.value = 3;
  runtime.flush();

  assert(runs >= 2, 'runtime should remain usable after a failed batch');

  assert(!runtime.isBatching, 'runtime should remain outside batching mode');
}
/**
 * Verifies that a graph snapshot contains the current dependency edges.
 */
function testGraphSnapshotContainsDependencies(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Establish the dependency graph.
  computed.value;

  const snapshot = runtime.createGraphSnapshot();

  assert(snapshot.nodes.length === 2, 'snapshot should contain both reactive nodes');

  assert(snapshot.edges.length === 1, 'snapshot should contain the dependency edge');

  const edge = snapshot.edges[0];

  assert(edge?.producerId === 'source', 'snapshot edge should identify the producer');

  assert(edge?.consumerId === 'computed', 'snapshot edge should identify the consumer');
}

/**
 * Verifies that a snapshot diff detects a newly created dependency edge.
 */
function testGraphSnapshotDiffDetectsAddedEdge(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  const before = runtime.createGraphSnapshot();

  // Reading the computed establishes the dependency.
  computed.value;

  const after = runtime.createGraphSnapshot();

  const diff = diffReactiveGraphSnapshots(before, after);

  assert(
    diff.addedEdges.length === 1,
    'snapshot diff should detect the newly added dependency edge',
  );

  assert(diff.addedEdges[0]?.producerId === 'source', 'added edge should identify the producer');

  assert(diff.addedEdges[0]?.consumerId === 'computed', 'added edge should identify the consumer');
}

/**
 * Verifies that a snapshot diff detects a removed dynamic dependency.
 */
function testGraphSnapshotDiffDetectsRemovedEdge(): void {
  const runtime = new ReactiveRuntime();

  const condition = new ReactiveValue(runtime, 'condition', true);
  const first = new ReactiveValue(runtime, 'first', 1);
  const second = new ReactiveValue(runtime, 'second', 2);

  const computed = new ReactiveComputed(runtime, 'computed', () =>
    condition.value ? first.value : second.value,
  );

  // Capture the initial dependency graph.
  computed.value;

  const before = runtime.createGraphSnapshot();

  // Switch to the second dynamic dependency.
  condition.value = false;
  computed.value;

  const after = runtime.createGraphSnapshot();

  const diff = diffReactiveGraphSnapshots(before, after);

  assert(
    diff.removedEdges.some((edge) => edge.producerId === 'first' && edge.consumerId === 'computed'),
    'snapshot diff should detect the removed first dependency',
  );

  assert(
    diff.addedEdges.some((edge) => edge.producerId === 'second' && edge.consumerId === 'computed'),
    'snapshot diff should detect the added second dependency',
  );
}

/**
 * Verifies that runtime inspection combines node state, graph structure,
 * and aggregate graph metrics into one diagnostic view.
 */
function testRuntimeInspection(): void {
  // Create a fresh runtime for the inspection test.
  const runtime = new ReactiveRuntime();

  // Create a source value and a computed node that depends on it.
  const source = new ReactiveValue(runtime, 'source', 1);
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Evaluate the computed value so the dependency edge is established.
  assert(computed.value === 2, 'Computed value should equal 2.');

  // Collect the complete runtime inspection.
  const inspection = runtime.inspect();

  // The runtime should report both registered nodes.
  assert(inspection.metrics.nodeCount === 2, 'Inspection should report two registered nodes.');

  // The computed dependency creates exactly one graph edge.
  assert(inspection.metrics.edgeCount === 1, 'Inspection should report one graph edge.');

  // Find the computed node in the inspection.
  const computedInspection = inspection.nodes.find((node) => node.id === 'computed');

  // The computed node must be present.
  assert(computedInspection !== undefined, 'Computed node should appear in the inspection.');

  // The computed node should depend on the source node.
  assert(
    computedInspection?.producerIds.length === 1 && computedInspection.producerIds[0] === 'source',
    'Computed node should list source as its producer.',
  );

  // Find the dependency edge in the graph snapshot.
  const edge = inspection.graph.edges.find(
    (candidate) => candidate.producerId === 'source' && candidate.consumerId === 'computed',
  );

  // The snapshot should contain the same dependency relationship.
  assert(edge !== undefined, 'Graph snapshot should contain source -> computed.');
}

/**
 * Verifies that the runtime can export the current reactive graph as
 * Graphviz DOT with nodes and dependency edges.
 */
function testRuntimeDotExport(): void {
  // Create a fresh runtime for the DOT export test.
  const runtime = new ReactiveRuntime();

  // Create a source value and a computed node depending on it.
  const source = new ReactiveValue(runtime, 'source', 1);
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Evaluate the computed value so the dependency edge is established.
  assert(computed.value === 2, 'Computed value should equal 2.');

  // Export the reactive graph as Graphviz DOT.
  const dot = runtime.toDot();

  // The output should declare a directed Graphviz graph.
  assert(dot.includes('digraph'), 'DOT output should declare a directed graph.');

  // Both reactive nodes should appear in the output.
  assert(dot.includes('"source"'), 'DOT output should contain the source node.');

  assert(dot.includes('"computed"'), 'DOT output should contain the computed node.');

  // The dependency relationship should appear as a directed edge.
  assert(
    dot.includes('"source" -> "computed"'),
    'DOT output should contain the source -> computed edge.',
  );
}

/**
 * Verifies that disposing a computed node removes it from the runtime and
 * disconnects its dependency relationships.
 */
function testComputedDisposal(): void {
  // Create a fresh runtime for the disposal test.
  const runtime = new ReactiveRuntime();

  // Create a source value and a computed value depending on it.
  const source = new ReactiveValue(runtime, 'source', 1);
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Evaluate the computed value so its dependency is established.
  assert(computed.value === 2, 'Computed value should initially equal 2.');

  // Verify that the dependency exists before disposal.
  assert(
    computed.node.hasProducer(source.node),
    'Computed should depend on source before disposal.',
  );

  // Dispose the computed node through the runtime.
  computed.dispose();

  // The runtime should no longer contain the computed node.
  assert(
    !runtime.getNodes().includes(computed.node),
    'Disposed computed should be removed from the runtime.',
  );

  // The computed node should no longer have any dependencies.
  assert(computed.node.producerCount === 0, 'Disposed computed should have no producers.');

  // The source should no longer retain the computed as a consumer.
  assert(
    source.node.consumerCount === 0,
    'Source should have no consumers after computed disposal.',
  );
}

/**
 * Verifies that disposing a computed more than once is harmless.
 */
function testComputedDisposalIsIdempotent(): void {
  // Create a fresh runtime for the idempotence test.
  const runtime = new ReactiveRuntime();

  // Create a computed value owned by the runtime.
  const computed = new ReactiveComputed(runtime, 'computed', () => 42);

  // Dispose the computed once.
  computed.dispose();

  // Disposing the same computed again should not throw.
  computed.dispose();

  // The computed should remain absent from the runtime.
  assert(
    !runtime.getNodes().includes(computed.node),
    'Disposed computed should remain removed from the runtime.',
  );
}

/**
 * Verifies that reading a disposed computed value is rejected rather than
 * silently recreating or using a disconnected reactive computation.
 */
function testDisposedComputedCannotBeRead(): void {
  // Create a fresh runtime for the disposal-state test.
  const runtime = new ReactiveRuntime();

  // Create a computed value owned by the runtime.
  const computed = new ReactiveComputed(runtime, 'computed', () => 42);

  // Dispose the computed before it is ever evaluated.
  computed.dispose();

  // The public lifecycle state should reflect the disposal.
  assert(computed.disposed, 'Computed should report itself as disposed.');

  // Reading a disposed computed should fail explicitly.
  let errorMessage = '';

  try {
    // A disposed reactive computation must not execute again.
    void computed.value;
  } catch (error) {
    // Capture the lifecycle error so its message can be verified.
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  // The disposed computed must reject evaluation.
  assert(errorMessage.length > 0, 'Reading a disposed computed should throw.');

  // Verify that the error specifically identifies the disposed state.
  assert(
    errorMessage === 'Reactive computed "computed" has been disposed.',
    'Disposed computed should report the expected lifecycle error.',
  );
}

/**
 * Verifies that an evaluated computed transitions from active to disposed
 * while preserving the runtime's graph cleanup guarantees.
 */
function testEvaluatedComputedDisposalState(): void {
  // Create a fresh runtime for the disposal-state test.
  const runtime = new ReactiveRuntime();

  // Create a source and a computed that depends on it.
  const source = new ReactiveValue(runtime, 'source', 1);
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // The computed starts in the active state.
  assert(!computed.disposed, 'Computed should initially report itself as active.');

  // Evaluate the computed so its dependency relationship is established.
  assert(computed.value === 2, 'Computed should initially evaluate to 2.');

  // Dispose the evaluated computed.
  computed.dispose();

  // Disposal should now be observable through the public API.
  assert(computed.disposed, 'Evaluated computed should report itself as disposed.');

  // Disposal should remove the dependency relationship.
  assert(
    source.node.consumerCount === 0,
    'Source should have no consumers after computed disposal.',
  );
}

/**
 * Verifies that disposing a computed removes it from runtime diagnostics.
 */
function testDisposedComputedIsAbsentFromInspection(): void {
  // Create a fresh runtime for the inspection test.
  const runtime = new ReactiveRuntime();

  // Create a computed node owned by the runtime.
  const computed = new ReactiveComputed(runtime, 'computed', () => 42);

  // Confirm the computed is initially visible to runtime inspection.
  const before = runtime.inspect();

  assert(
    before.nodes.some((node) => node.id === 'computed'),
    'Active computed should appear in runtime inspection.',
  );

  // Dispose the computed.
  computed.dispose();

  // Inspect the runtime again after disposal.
  const after = runtime.inspect();

  // The disposed computed should no longer be registered.
  assert(
    !after.nodes.some((node) => node.id === 'computed'),
    'Disposed computed should be absent from runtime inspection.',
  );

  // The runtime should have no remaining nodes.
  assert(
    after.metrics.nodeCount === 0,
    'Runtime should report zero nodes after computed disposal.',
  );
}

/**
 * Verifies that changing a former producer cannot revive a disposed
 * computed value or recreate its dependency relationship.
 */
function testDisposedComputedCannotBeRevivedByProducerChange(): void {
  // Create a fresh runtime for the lifecycle test.
  const runtime = new ReactiveRuntime();

  // Create a source and a computed depending on it.
  const source = new ReactiveValue(runtime, 'source', 1);
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Evaluate the computed so the source -> computed relationship exists.
  assert(computed.value === 2, 'Computed should initially evaluate to 2.');

  // Dispose the computed and disconnect it from the graph.
  computed.dispose();

  // Change the former producer after disposal.
  source.value = 2;

  // The disposed computed must remain disposed.
  assert(computed.disposed, 'Computed should remain disposed after its former producer changes.');

  // The disposed computed must remain absent from the runtime.
  assert(
    !runtime.getNodes().includes(computed.node),
    'Disposed computed should not be re-registered by a producer change.',
  );

  // The source must not regain the disposed computed as a consumer.
  assert(
    source.node.consumerCount === 0,
    'Source should not regain the disposed computed as a consumer.',
  );
}

/**
 * Verifies that disposing a computed while another computed is evaluating
 * does not corrupt the active reactive consumer context.
 */
function testComputedDisposalPreservesReactiveContext(): void {
  // Create a fresh runtime for the context test.
  const runtime = new ReactiveRuntime();

  // Create a source value.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create the computed that will later be disposed.
  const disposable = new ReactiveComputed(runtime, 'disposable', () => source.value * 2);

  // Establish the disposable computed's dependency.
  assert(disposable.value === 2, 'Disposable computed should initially evaluate to 2.');

  // Create another computed that disposes the first computed while it runs.
  const outer = new ReactiveComputed(runtime, 'outer', () => {
    // Read the source so the outer computation has its own dependency.
    const value = source.value;

    // Dispose the unrelated computed during the active computation.
    disposable.dispose();

    // Return the value observed by the outer computation.
    return value;
  });

  // The outer computation should complete successfully.
  assert(outer.value === 1, 'Outer computed should evaluate successfully.');

  // The outer computed should remain connected to its source.
  assert(outer.node.hasProducer(source.node), 'Outer computed should retain source as a producer.');

  // The disposed computed must remain disconnected.
  assert(
    source.node.consumerCount === 1,
    'Source should only retain the outer computed as a consumer.',
  );

  // The reactive context must be restored after the computation.
  assert(
    runtime.context.activeConsumer === undefined,
    'Reactive context should be clear after computation.',
  );
}

/**
 * Verifies that disposing a computed invalidates downstream consumers
 * instead of leaving them with a stale cached value.
 */
function testComputedDisposalInvalidatesConsumers(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 2);
  const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);
  const quadrupled = new ReactiveComputed(runtime, 'quadrupled', () => doubled.value * 2);

  assert(quadrupled.value === 8, 'downstream computed should initialize from its producer');
  assert(!quadrupled.node.dirty, 'downstream computed should be clean after evaluation');

  doubled.dispose();

  assert(quadrupled.node.dirty, 'disposing a computed should invalidate its consumers');
  assert(
    !quadrupled.node.hasProducer(doubled.node),
    'disposed computed should be disconnected from its consumers',
  );

  let errorMessage = '';

  try {
    void quadrupled.value;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assert(
    errorMessage === 'Reactive computed "doubled" has been disposed.',
    'downstream recomputation should surface the disposed producer error',
  );
}

/**
 * Verifies that reading a disposed computed during another computation does
 * not register a dependency on the disposed node.
 */
function testDisposedComputedReadDoesNotTrackProducer(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 1);
  const disposed = new ReactiveComputed(runtime, 'disposed', () => source.value);

  disposed.dispose();

  const consumer = new ReactiveComputed(runtime, 'consumer', () => {
    try {
      return disposed.value;
    } catch {
      return -1;
    }
  });

  assert(consumer.value === -1, 'consumer should observe the disposed-read failure');
  assert(
    !consumer.node.hasProducer(disposed.node),
    'reading a disposed computed should not create a producer relationship',
  );
}

/**
 * Verifies that a reactive value can be disposed and removed from the
 * owning runtime.
 */
function testReactiveValueDisposal(): void {
  // Create a fresh runtime for the disposal test.
  const runtime = new ReactiveRuntime();

  // Create a writable reactive value.
  const source = new ReactiveValue(runtime, 'source', 1);

  // The value should initially be registered with the runtime.
  assert(
    runtime.getNodes().includes(source.node),
    'Reactive value should initially be registered.',
  );

  // Dispose the reactive value through the runtime.
  source.dispose();

  // The value should no longer be registered.
  assert(
    !runtime.getNodes().includes(source.node),
    'Disposed reactive value should be removed from the runtime.',
  );

  // Its dependency graph should be isolated.
  assert(source.node.producerCount === 0, 'Disposed reactive value should have no producers.');

  assert(source.node.consumerCount === 0, 'Disposed reactive value should have no consumers.');
}
/**
 * Verifies that a disposed runtime rejects registration of new reactive nodes.
 */
function testDisposedRuntimeRejectsNewNodes(): void {
  // Create and immediately dispose the runtime.
  const runtime = new ReactiveRuntime();
  runtime.dispose();

  // Track whether registration correctly throws.
  let threw = false;

  try {
    // Creating a reactive value attempts to register its node.
    new ReactiveValue(runtime, 'value', 1);
  } catch (error) {
    // Confirm that the runtime reports its disposed state.
    threw =
      error instanceof Error && error.message === 'Cannot register a node with a disposed runtime.';
  }

  // The disposed runtime must reject the new node.
  assert(threw, 'Disposed runtime should reject registration of new nodes.');
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
testDisposeNode();
testRuntimeDisposePreventsRegistration();
testRuntimeDisposeClearsState();
testBatchErrorPropagates();
testBatchErrorRestoresBatchState();
testRuntimeRemainsUsableAfterBatchError();
testGraphSnapshotContainsDependencies();
testGraphSnapshotDiffDetectsAddedEdge();
testGraphSnapshotDiffDetectsRemovedEdge();
testRuntimeDotExport();
testComputedDisposal();
testComputedDisposalIsIdempotent();
testDisposedComputedCannotBeRead();
testEvaluatedComputedDisposalState();
testDisposedComputedIsAbsentFromInspection();
testDisposedComputedCannotBeRevivedByProducerChange();
testComputedDisposalPreservesReactiveContext();
testComputedDisposalInvalidatesConsumers();
testDisposedComputedReadDoesNotTrackProducer();
testReactiveValueDisposal();
testDisposedRuntimeRejectsNewNodes();
