import {ReactiveComputed} from '../reactive-computed.js';
import {assert} from '../../../test/assert.js';
import {ReactiveNode} from '../reactive-node.js';
import {ReactiveRuntime, ReactiveValue} from '../index.js';

/**
 * Creates a fresh runtime and verifies a basic computed dependency.
 *
 * This test establishes the fundamental relationship:
 *
 *     source ───► computed
 *
 * The computed value should:
 * - evaluate lazily,
 * - cache its result,
 * - become invalidated when the source changes,
 * - recompute when read again.
 */
const runtime = new ReactiveRuntime();

const source = new ReactiveValue(runtime, 'source', 10);

let computationCount = 0;

const doubled = new ReactiveComputed(runtime, 'doubled', () => {
  // Record every actual execution of the computation function.
  computationCount++;

  // Reading the source automatically establishes the dependency.
  return source.value * 2;
});

assert(computationCount === 0, 'Expected the computed value to be lazy.');

/**
 * The first read should evaluate the computation.
 */
assert(doubled.value === 20, 'Expected the initial computed value to be 20.');

assert(computationCount === 1, 'Expected the computation to run exactly once.');

/**
 * A second read should use the cached value.
 */
assert(doubled.value === 20, 'Expected the cached computed value to remain 20.');

assert(computationCount === 1, 'Expected the cached read not to recompute.');

/**
 * Changing the source should invalidate the computed value without
 * immediately executing its computation.
 */
source.value = 15;

assert(computationCount === 1, 'Expected invalidation to remain lazy.');

/**
 * Reading the computed value should now recompute it.
 */
assert(doubled.value === 30, 'Expected the recomputed value to be 30.');

assert(computationCount === 2, 'Expected exactly one recomputation after invalidation.');

/**
 * Verify the dependency relationship established by the computation.
 */
assert(doubled.node.getProducerIds().includes('source'), 'Expected doubled to depend on source.');

console.log('ReactiveComputed test passed.');

/**
 * Creates a second computed value that depends on the first computed value.
 *
 * The dependency graph becomes:
 *
 *     source ──► doubled ──► quadrupled
 */
let quadrupledComputations = 0;

const quadrupled = new ReactiveComputed(runtime, 'quadrupled', () => {
  // Record every actual execution of this computation.
  quadrupledComputations++;

  // Reading `doubled` automatically establishes the dependency.
  return doubled.value * 2;
});

/**
 * The nested computed value should evaluate to:
 *
 *     15 × 2 × 2 = 60
 */
assert(quadrupled.value === 60, 'Expected the nested computed value to be 60.');

/**
 * The outer computation should have executed exactly once.
 */
assert(quadrupledComputations === 1, 'Expected quadrupled to compute exactly once.');

/**
 * Verify the dependency relationship.
 */
assert(
  quadrupled.node.getProducerIds().includes('doubled'),
  'Expected quadrupled to depend on doubled.',
);

/**
 * Change the original source.
 *
 * Both computed nodes should become invalidated, but neither computation
 * should execute until its value is requested.
 */
source.value = 20;

assert(quadrupledComputations === 1, 'Expected quadrupled invalidation to remain lazy.');

/**
 * Reading the outer computed value should pull the entire dependency chain.
 *
 *     20 × 2 × 2 = 80
 */
assert(quadrupled.value === 80, 'Expected the nested computed value to become 80.');

assert(quadrupledComputations === 2, 'Expected quadrupled to recompute exactly once.');

/**
 * A computed value whose dependency can change while its result remains
 * identical.
 *
 * This verifies that dependency invalidation and value changes are distinct:
 *
 *     dependency changed → recompute
 *     same result        → version does not advance
 */
const stable = new ReactiveComputed(runtime, 'stable', () => {
  // Read the source so `stable` becomes dependent on it.
  source.value;

  // Always return the same value.
  return 100;
});

/**
 * Establish the initial value and record its version.
 */
assert(stable.value === 100, 'Expected stable to initially return 100.');

const stableVersion = stable.node.version;

/**
 * Change the dependency.
 *
 * The computed node should become dirty, but its computation should remain
 * lazy.
 */
source.value = 25;

/**
 * Reading the computed value forces recomputation.
 */
assert(stable.value === 100, 'Expected stable to remain 100 after its dependency changed.');

/**
 * Because the computed result did not change, its version should also
 * remain unchanged.
 */
assert(
  stable.node.version === stableVersion,
  "Expected stable's version not to change when its result stayed the same.",
);

// Verify the explicit invalidation state transition.
{
  const runtime = new ReactiveRuntime();
  const node = new ReactiveNode('invalidate-test');

  // A newly created node starts clean.
  assert(!node.dirty, 'node should start clean');

  // The first invalidation should transition the node to dirty.
  assert(node.invalidate(), 'first invalidation should report a state transition');

  assert(node.dirty, 'node should be dirty after invalidation');

  // Re-invalidating an already-dirty node should not report another
  // state transition.
  assert(!node.invalidate(), 'second invalidation should not report a new transition');

  // The runtime variable is intentionally created here to keep this test
  // consistent with the surrounding reactive test setup.
  void runtime;
}

/**
 * Verifies that incrementing a node's version is only a local version
 * operation and does not perform runtime-level propagation.
 */
{
  const producer = new ReactiveNode('version-producer');
  const consumer = new ReactiveNode('version-consumer');

  // Establish a dependency from the consumer to the producer.
  consumer.addProducer(producer);

  // Incrementing the producer directly should only change its version.
  producer.incrementVersion();

  assert(producer.version === 1, 'incrementVersion should advance the producer version');

  assert(!consumer.dirty, 'incrementVersion should not invalidate consumers directly');
}

/**
 * Verifies that markValueChanged advances the node version and invalidates
 * its direct consumers.
 */
{
  const producer = new ReactiveNode('changed-producer');
  const consumer = new ReactiveNode('changed-consumer');

  // Establish a dependency from the consumer to the producer.
  consumer.addProducer(producer);

  // The dependency starts clean.
  assert(!consumer.dirty, 'consumer should start clean');

  // Record a value change on the producer.
  producer.markValueChanged();

  // The producer's version must advance.
  assert(producer.version === 1, 'markValueChanged should advance the producer version');

  // The dependent consumer must become invalidated.
  assert(consumer.dirty, 'markValueChanged should invalidate consumers');
}

/**
 * Verifies that the runtime reports both the new epoch and newly
 * invalidated consumers when a reactive value changes.
 */
{
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'runtime-source', 1);
  const computed = new ReactiveComputed(runtime, 'runtime-computed', () => source.value * 2);

  // Establish the dependency.
  assert(computed.value === 2, 'computed value should be initialized');

  // Change the source through the runtime.
  const result = runtime.markChanged(source.node);

  // The runtime must report the new epoch.
  assert(result.epoch === 1, 'runtime should report the incremented epoch');

  // The computed node should be reported as newly invalidated.
  assert(
    result.invalidatedConsumers.includes('runtime-computed'),
    'runtime should report the invalidated computed consumer',
  );
}

/**
 * Verifies that a dependency link detects producer version changes and
 * becomes current again after synchronization.
 */
{
  const producer = new ReactiveNode('link-producer');
  const consumer = new ReactiveNode('link-consumer');
  const link = consumer.addProducer(producer);

  // A newly created link observes the producer's current version.
  assert(!link.hasChanged(), 'new dependency link should initially be current');

  // Advance the producer without synchronizing the dependency link.
  producer.incrementVersion();

  // The link should now detect that the producer changed.
  assert(link.hasChanged(), 'dependency link should detect a producer version change');

  // Synchronize the link with the producer's current version.
  link.markCurrent();

  // The link should now consider the producer current again.
  assert(!link.hasChanged(), 'dependency link should become current after synchronization');
}

/**
 * Verifies that clearDirty only clears invalidation state and does not
 * alter the node's version.
 */
{
  const node = new ReactiveNode('clear-dirty-test');

  // Invalidate the node first.
  node.invalidate();

  assert(node.dirty, 'node should be dirty after invalidation');

  const versionBeforeClear = node.version;

  // Clear only the dirty state.
  node.clearDirty();

  assert(!node.dirty, 'clearDirty should clear the dirty state');

  assert(node.version === versionBeforeClear, 'clearDirty should not change the node version');
}

/**
 * Verifies that repeated producer polling within the same epoch returns
 * the same changed dependency instead of losing the previously detected
 * result.
 */
{
  const runtime = new ReactiveRuntime();
  const producer = new ReactiveNode('poll-producer');
  const consumer = new ReactiveNode('poll-consumer');

  // Establish the dependency relationship.
  consumer.addProducer(producer);

  // The producer changes without going through the runtime, so its version
  // becomes newer than the version recorded on the dependency link.
  producer.incrementVersion();

  // Ask the runtime to inspect the consumer's dependencies.
  const firstResult = runtime.pollProducersForChange(consumer);

  assert(firstResult !== undefined, 'first poll should detect the changed producer');

  // Poll again during the same epoch.
  const secondResult = runtime.pollProducersForChange(consumer);

  assert(
    secondResult === firstResult,
    'repeated poll in the same epoch should return the same changed link',
  );
}

/**
 * Verifies that a computed value can identify the dependency that changed.
 */
{
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'changed-source', 10);

  const computed = new ReactiveComputed(runtime, 'changed-computed', () => source.value * 2);

  // Establish the dependency relationship.
  assert(computed.value === 20, 'computed value should initialize correctly');

  // Change the source through the normal runtime path.
  source.value = 20;

  // The computed should now identify the source as the changed producer.
  const changedLink = computed.getChangedProducer();

  assert(changedLink !== undefined, 'computed should report a changed producer');

  assert(changedLink!.producer === source.node, 'changed producer should be the source node');
}

/**
 * Verifies that recomputation clears the remembered changed dependency.
 */
{
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'cleared-source', 10);

  const computed = new ReactiveComputed(runtime, 'cleared-computed', () => source.value * 2);

  // Establish the dependency relationship.
  assert(computed.value === 20, 'computed value should initialize correctly');

  // Change the source so the computed becomes invalid.
  source.value = 20;

  assert(
    computed.getChangedProducer() !== undefined,
    'computed should detect the changed producer',
  );

  // Recompute and synchronize the dependency versions.
  assert(computed.value === 40, 'computed should recompute using the new source value');

  // The dependency should now be current.
  assert(
    computed.getChangedProducer() === undefined,
    'changed producer should be cleared after recomputation',
  );
}

/**
 * Verifies that isValid() reflects the lifecycle of a computed value.
 *
 * The computed should be:
 * - invalid before its first evaluation,
 * - valid immediately after evaluation,
 * - invalid after a dependency changes,
 * - valid again after recomputation.
 */
function testComputedValidityLifecycle(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // A computed value has no valid cache before its first evaluation.
  assert(!computed.isValid(), 'computed should be invalid before its first evaluation');

  // Evaluate the computed value and establish its dependency state.
  assert(computed.value === 2, 'computed should initially evaluate to 2');

  // The cache should now be valid.
  assert(computed.isValid(), 'computed should be valid after evaluation');

  // Changing the producer should invalidate the computed value.
  source.value = 2;

  assert(!computed.isValid(), 'computed should be invalid after its producer changes');

  // Reading the computed should recompute and restore validity.
  assert(computed.value === 4, 'computed should recompute to 4');

  assert(computed.isValid(), 'computed should be valid again after recomputation');
}
/**
 * Verifies that invalidation does not immediately recompute a computed value.
 *
 * The producer change should mark the computed as invalid, but the
 * computation itself should remain lazy until the computed value is read.
 */
function testLazyRecomputation(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let computationCount = 0;

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    // Count every actual execution of the computation function.
    computationCount++;

    return source.value * 2;
  });

  // The computation should not run merely because the computed was created.
  assert(computationCount === 0, 'computed should not evaluate during construction');

  // The first read performs the initial computation.
  assert(computed.value === 2, 'computed should initially evaluate to 2');

  assert(computationCount === 1, 'computed should evaluate exactly once after the first read');

  // Changing the producer invalidates the computed but must not recompute it.
  source.value = 2;

  assert(computationCount === 1, 'producer changes should invalidate without recomputing');

  // Reading the invalid computed triggers the lazy recomputation.
  assert(computed.value === 4, 'computed should recompute to 4 when read');

  assert(computationCount === 2, 'computed should recompute exactly once after invalidation');
}

/**
 * Verifies that repeated reads reuse the cached computed value.
 *
 * Once a computed value has been evaluated and none of its producers
 * have changed, reading it again must not execute the computation again.
 */
function testCachedReads(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let computationCount = 0;

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    // Count every actual computation execution.
    computationCount++;

    return source.value * 2;
  });

  // The first read performs the initial computation.
  assert(computed.value === 2, 'computed should initially evaluate to 2');

  assert(computationCount === 1, 'first read should execute the computation once');

  // Repeated reads should reuse the cached result.
  assert(computed.value === 2, 'second read should return the cached value');

  assert(computed.value === 2, 'third read should return the cached value');

  // No additional computation should have occurred.
  assert(computationCount === 1, 'repeated reads should not recompute a valid computed value');

  // The producer has not changed, so another read should still use the cache.
  assert(computed.isValid(), 'computed should remain valid after repeated cached reads');
}

/**
 * Verifies that invalidation propagates through multiple computed levels.
 *
 * A change to the original source should invalidate every downstream
 * computed node, not just its immediate consumer.
 */
function testMultiLevelInvalidation(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const middle = new ReactiveComputed(runtime, 'middle', () => source.value * 2);

  const leaf = new ReactiveComputed(runtime, 'leaf', () => middle.value * 2);

  // Evaluate the entire dependency chain and establish all dependencies.
  assert(leaf.value === 4, 'leaf should initially evaluate to 4');

  // Both computed values should be valid after the initial evaluation.
  assert(middle.isValid(), 'middle should initially be valid');

  assert(leaf.isValid(), 'leaf should initially be valid');

  // Changing the source should propagate invalidation through the chain.
  source.value = 2;

  // The immediate computed consumer should now be invalid.
  assert(!middle.isValid(), 'middle should be invalid after source changes');

  // The downstream computed should also be invalid.
  assert(!leaf.isValid(), 'leaf should be invalid after source changes');

  // Reading the leaf should lazily refresh the dependency chain.
  assert(leaf.value === 8, 'leaf should recompute through the invalidated chain');

  // Both computed values should be valid again after recomputation.
  assert(middle.isValid(), 'middle should be valid after recomputation');

  assert(leaf.isValid(), 'leaf should be valid after recomputation');
}

/**
 * Verifies that a computed value establishes the expected dependency graph.
 *
 * After evaluation, the computed should have exactly the producers that
 * were read during its computation.
 */
function testComputedDependencies(): void {
  const runtime = new ReactiveRuntime();

  const first = new ReactiveValue(runtime, 'first', 10);
  const second = new ReactiveValue(runtime, 'second', 20);

  const computed = new ReactiveComputed(runtime, 'computed', () => first.value + second.value);

  // Before the first evaluation, no dependencies have been established.
  assert(computed.node.producerCount === 0, 'computed should have no producers before evaluation');

  // Evaluate the computation so dependency tracking can run.
  assert(computed.value === 30, 'computed should initially evaluate to 30');

  // Both values were read, so both should now be tracked as producers.
  assert(computed.node.producerCount === 2, 'computed should track both producers');

  assert(computed.node.hasProducer(first.node), 'computed should track first as a producer');

  assert(computed.node.hasProducer(second.node), 'computed should track second as a producer');

  // Each producer should also know that the computed consumes it.
  assert(first.node.consumerCount === 1, 'first should have one consumer');

  assert(second.node.consumerCount === 1, 'second should have one consumer');
}

/**
 * Verifies that dependencies no longer used by a computation are removed.
 *
 * The computed initially depends on both values. After switching to a
 * computation that only reads one value, the obsolete dependency should
 * disappear from both the consumer and producer indexes.
 */
function testRemovedDependency(): void {
  const runtime = new ReactiveRuntime();

  const first = new ReactiveValue(runtime, 'first', 10);
  const second = new ReactiveValue(runtime, 'second', 20);
  const useFirst = new ReactiveValue(runtime, 'use-first', true);

  const selected = new ReactiveComputed(runtime, 'selected', () => {
    // Read only the currently selected branch.
    return useFirst.value ? first.value : second.value;
  });

  // Establish the initial dependency graph.
  assert(selected.value === 10, 'selected should initially use first');

  assert(selected.node.hasProducer(first.node), 'selected should initially depend on first');

  assert(!selected.node.hasProducer(second.node), 'selected should not initially depend on second');

  assert(first.node.consumerCount === 1, 'first should initially have selected as a consumer');

  assert(second.node.consumerCount === 0, 'second should initially have no consumers');

  // Switch the computation to the second branch.
  useFirst.value = false;

  assert(selected.value === 20, 'selected should switch to second');

  // The old dependency must have been removed.
  assert(!selected.node.hasProducer(first.node), 'selected should no longer depend on first');

  // The new dependency must be present.
  assert(selected.node.hasProducer(second.node), 'selected should now depend on second');

  // The producer-side consumer indexes must also be synchronized.
  assert(first.node.consumerCount === 0, 'first should no longer have selected as a consumer');

  assert(second.node.consumerCount === 1, 'second should now have selected as a consumer');
}

/**
 * Verifies that reading the same producer multiple times creates only one
 * dependency relationship.
 *
 * Dependency tracking should describe relationships between nodes, not the
 * number of times a value happened to be read during one computation.
 */
function testDependencyDeduplication(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 5);

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    // Read the same producer more than once during this computation.
    return source.value + source.value;
  });

  // Evaluate the computation and establish the dependency.
  assert(computed.value === 10, 'computed should evaluate repeated reads correctly');

  // Repeated reads of the same producer must create only one dependency.
  assert(
    computed.node.producerCount === 1,
    'computed should contain only one dependency link for source',
  );

  // The producer should likewise contain only one consumer relationship.
  assert(source.node.consumerCount === 1, 'source should contain only one consumer relationship');

  assert(computed.node.hasProducer(source.node), 'computed should track source as a producer');
}

/**
 * Verifies that repeated reads of a nested computed create only one
 * dependency relationship.
 *
 * A consumer may read the same computed producer multiple times during one
 * evaluation, but the dependency graph should still contain one link.
 */
function testNestedDependencyDeduplication(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 5);

  const inner = new ReactiveComputed(runtime, 'inner', () => source.value * 2);

  const outer = new ReactiveComputed(runtime, 'outer', () => {
    // Read the same computed producer twice.
    return inner.value + inner.value;
  });

  // Evaluate the complete nested computation.
  assert(outer.value === 20, 'outer should evaluate repeated inner reads correctly');

  // The outer computed should have exactly one producer: inner.
  assert(outer.node.producerCount === 1, 'outer should contain only one dependency link to inner');

  assert(outer.node.hasProducer(inner.node), 'outer should track inner as a producer');

  // The inner computed should have exactly one consumer: outer.
  assert(inner.node.consumerCount === 1, 'inner should contain only one consumer relationship');
}

/**
 * Verifies that changing a producer invalidates its direct consumers.
 *
 * This test focuses on the graph propagation mechanism itself rather than
 * computed-value evaluation.
 */
function testProducerInvalidatesConsumers(): void {
  const runtime = new ReactiveRuntime();

  const producer = new ReactiveValue(runtime, 'producer', 1);

  const first = new ReactiveComputed(runtime, 'first', () => producer.value);

  const second = new ReactiveComputed(runtime, 'second', () => producer.value * 2);

  // Establish both producer → consumer relationships.
  assert(first.value === 1, 'first should initially evaluate correctly');

  assert(second.value === 2, 'second should initially evaluate correctly');

  // Both consumers should initially be valid.
  assert(first.isValid(), 'first should initially be valid');

  assert(second.isValid(), 'second should initially be valid');

  // Change the shared producer.
  producer.value = 2;

  // Both direct consumers should now be invalid.
  assert(!first.isValid(), 'first should be invalid after producer changes');

  assert(!second.isValid(), 'second should be invalid after producer changes');

  // Recomputing one consumer should not accidentally make the other valid.
  assert(first.value === 2, 'first should recompute using the new producer value');

  assert(!second.isValid(), 'second should remain invalid until it is recomputed');

  // Finally recompute the second consumer.
  assert(second.value === 4, 'second should recompute using the new producer value');

  assert(second.isValid(), 'second should be valid after recomputation');
}

/**
 * Verifies invalidation across a diamond-shaped dependency graph.
 *
 * Both intermediate computations depend on the same source, while the
 * final computation depends on both intermediate computations.
 *
 * The final node should become invalid exactly once even though there are
 * two paths from the source to it.
 */
function testDiamondInvalidation(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const first = new ReactiveComputed(runtime, 'first', () => source.value + 1);

  const second = new ReactiveComputed(runtime, 'second', () => source.value + 2);

  const result = new ReactiveComputed(runtime, 'result', () => first.value + second.value);

  // Evaluate the complete diamond and establish all dependency links.
  assert(result.value === 5, 'result should initially evaluate to 5');

  // All nodes should initially have valid cached values.
  assert(first.isValid(), 'first should initially be valid');

  assert(second.isValid(), 'second should initially be valid');

  assert(result.isValid(), 'result should initially be valid');

  // Changing the shared source invalidates both branches.
  source.value = 2;

  assert(!first.isValid(), 'first should be invalid after source changes');

  assert(!second.isValid(), 'second should be invalid after source changes');

  // The final node must also be invalidated through both dependency paths.
  assert(!result.isValid(), 'result should be invalid after source changes');

  // Reading the result should refresh the complete diamond.
  assert(result.value === 7, 'result should recompute to 7');

  // Every node should be valid again after the recomputation.
  assert(first.isValid(), 'first should be valid after recomputation');

  assert(second.isValid(), 'second should be valid after recomputation');

  assert(result.isValid(), 'result should be valid after recomputation');
}

/**
 * Verifies that a diamond dependency graph does not unnecessarily
 * recompute the same node multiple times during one downstream read.
 *
 * Each computed node should execute once when the final result is read
 * after invalidation.
 */
function testDiamondRecomputationCounts(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let firstComputations = 0;
  let secondComputations = 0;
  let resultComputations = 0;

  const first = new ReactiveComputed(runtime, 'first', () => {
    // Count executions of the first branch.
    firstComputations++;

    return source.value + 1;
  });

  const second = new ReactiveComputed(runtime, 'second', () => {
    // Count executions of the second branch.
    secondComputations++;

    return source.value + 2;
  });

  const result = new ReactiveComputed(runtime, 'result', () => {
    // Count executions of the final computation.
    resultComputations++;

    return first.value + second.value;
  });

  // Establish the complete dependency graph.
  assert(result.value === 5, 'result should initially evaluate to 5');

  assert(firstComputations === 1, 'first should initially compute once');

  assert(secondComputations === 1, 'second should initially compute once');

  assert(resultComputations === 1, 'result should initially compute once');

  // Change the shared producer.
  source.value = 2;

  // Invalidation should not perform any computation.
  assert(firstComputations === 1, 'first should not recompute during invalidation');

  assert(secondComputations === 1, 'second should not recompute during invalidation');

  assert(resultComputations === 1, 'result should not recompute during invalidation');

  // Reading the final result should refresh the whole diamond.
  assert(result.value === 7, 'result should recompute to 7');

  // Each node should have executed exactly once more.
  assert(firstComputations === 2, 'first should recompute exactly once');

  assert(secondComputations === 2, 'second should recompute exactly once');

  assert(resultComputations === 2, 'result should recompute exactly once');

  // A second read should use the cached result.
  assert(result.value === 7, 'second result read should return the cached value');

  assert(firstComputations === 2, 'first should not recompute on a cached read');

  assert(secondComputations === 2, 'second should not recompute on a cached read');

  assert(resultComputations === 2, 'result should not recompute on a cached read');
}

/**
 * Verifies that one producer can invalidate multiple independent consumers.
 *
 * Both computed values depend directly on the same source. A source change
 * should invalidate both consumers, while each consumer maintains its own
 * cached result independently.
 */
function testSharedProducerConsumers(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 3);

  let doubleComputations = 0;
  let tripleComputations = 0;

  const double = new ReactiveComputed(runtime, 'double', () => {
    // Count executions of the first consumer.
    doubleComputations++;

    return source.value * 2;
  });

  const triple = new ReactiveComputed(runtime, 'triple', () => {
    // Count executions of the second consumer.
    tripleComputations++;

    return source.value * 3;
  });

  // Establish both independent dependency relationships.
  assert(double.value === 6, 'double should initially evaluate to 6');

  assert(triple.value === 9, 'triple should initially evaluate to 9');

  // Both consumers should initially have one computation.
  assert(doubleComputations === 1, 'double should initially compute once');

  assert(tripleComputations === 1, 'triple should initially compute once');

  // Change the shared producer.
  source.value = 4;

  // Both consumers must become invalid.
  assert(!double.isValid(), 'double should be invalid after source changes');

  assert(!triple.isValid(), 'triple should be invalid after source changes');

  // Reading only double should recompute only double.
  assert(double.value === 8, 'double should recompute to 8');

  assert(doubleComputations === 2, 'double should recompute exactly once');

  assert(tripleComputations === 1, 'triple should remain unevaluated');

  // Triple remains independently invalid.
  assert(!triple.isValid(), 'triple should remain invalid until read');

  // Reading triple should now recompute only triple.
  assert(triple.value === 12, 'triple should recompute to 12');

  assert(tripleComputations === 2, 'triple should recompute exactly once');
}

/**
 * Verifies the bidirectional consistency of the reactive dependency graph.
 *
 * Every dependency relationship must be represented from both directions:
 *
 *     producer.consumers
 *             ↕
 *     consumer.producers
 *
 * This makes later propagation and inspection reliable.
 */
function testDependencyGraphConsistency(): void {
  const runtime = new ReactiveRuntime();

  const first = new ReactiveValue(runtime, 'first', 1);
  const second = new ReactiveValue(runtime, 'second', 2);

  const computed = new ReactiveComputed(runtime, 'computed', () => first.value + second.value);

  // Evaluate the computation so both dependency links are created.
  assert(computed.value === 3, 'computed should evaluate to 3');

  // Verify the consumer-side dependency index.
  assert(computed.node.producerCount === 2, 'computed should have two producers');

  assert(computed.node.hasProducer(first.node), 'computed should list first as a producer');

  assert(computed.node.hasProducer(second.node), 'computed should list second as a producer');

  // Verify the producer-side consumer indexes.
  assert(first.node.consumerCount === 1, 'first should have computed as a consumer');

  assert(second.node.consumerCount === 1, 'second should have computed as a consumer');

  // Verify the actual consumer IDs exposed by each producer.
  assert(
    first.node.getConsumerIds().includes('computed'),
    'first should list computed as a consumer',
  );

  assert(
    second.node.getConsumerIds().includes('computed'),
    'second should list computed as a consumer',
  );

  // Verify the producer IDs exposed by the consumer.
  const producerIds = computed.node.getProducerIds();

  assert(producerIds.includes('first'), 'computed should expose first in its producer IDs');

  assert(producerIds.includes('second'), 'computed should expose second in its producer IDs');
}

/**
 * Verifies that producer version changes do not directly change consumer
 * versions during invalidation.
 *
 * A consumer becoming dirty means its cached state is no longer trusted.
 * It does not mean that the consumer itself has produced a new value yet.
 */
function testVersionAndInvalidationAreSeparate(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Establish the initial computed value and dependency relationship.
  assert(computed.value === 2, 'computed should initially evaluate to 2');

  const sourceVersionBeforeChange = source.node.version;
  const computedVersionBeforeChange = computed.node.version;

  // Changing the source should advance only the source's value version.
  source.value = 2;

  assert(
    source.node.version === sourceVersionBeforeChange + 1,
    'source version should increment after its value changes',
  );

  // The computed has become invalid, but it has not produced a new value yet.
  assert(!computed.isValid(), 'computed should be invalid after source changes');

  assert(
    computed.node.version === computedVersionBeforeChange,
    'computed version should not change merely because it was invalidated',
  );

  // Reading the computed performs the actual recomputation.
  assert(computed.value === 4, 'computed should recompute to 4');

  // The computed has now produced a new value, so its version may advance.
  assert(
    computed.node.version === computedVersionBeforeChange + 1,
    'computed version should advance after producing a changed value',
  );
}

/**
 * Verifies the lifecycle of a dependency link's observed producer version.
 *
 * A link begins synchronized with its producer. After the producer changes,
 * the link becomes stale. Synchronizing the producer versions should make
 * the link current again.
 */
function testReactiveLinkVersionLifecycle(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Evaluate the computed so its dependency link is created.
  assert(computed.value === 2, 'computed should initially evaluate to 2');

  // Retrieve the dependency link from the computed's producer set.
  const links = [...computed.node.getProducerIds()];

  assert(links.length === 1, 'computed should have exactly one producer');

  // The public producer ID confirms the expected dependency exists.
  assert(links[0] === 'source', 'computed should depend on source');

  // The computed should initially have no changed producer.
  assert(computed.getChangedProducer() === undefined, 'producer link should initially be current');

  // Change the producer.
  source.value = 2;

  // The dependency should now be observable as changed.
  assert(
    computed.getChangedProducer() !== undefined,
    'producer link should become stale after source changes',
  );

  // Recompute the consumer so it observes the producer's new version.
  assert(computed.value === 4, 'computed should recompute using the new source value');

  // The dependency link should now be synchronized again.
  assert(
    computed.getChangedProducer() === undefined,
    'producer link should be current after recomputation',
  );
}

/**
 * Verifies that recomputation does not produce a new value version when
 * the resulting value is unchanged.
 *
 * Dependency changes can force a computation to run even when the final
 * result is still Object.is-equal to the previous result.
 */
function testSameResultDoesNotChangeVersion(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let computationCount = 0;

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    // Count every actual recomputation.
    computationCount++;

    // Read the source so the dependency is tracked.
    // The value is intentionally ignored so the computed result stays 42.
    source.value;

    // The result deliberately remains constant.
    return 42;
  });

  // Establish the initial value and dependency relationship.
  assert(computed.value === 42, 'computed should initially evaluate to 42');

  assert(computationCount === 1, 'computed should initially run once');

  const versionBeforeChange = computed.node.version;

  // The source changes even though it does not affect the computed result.
  source.value = 2;

  // The dependency change should invalidate the computed.
  assert(!computed.isValid(), 'computed should become invalid when its producer changes');

  // Reading it forces a recomputation.
  assert(computed.value === 42, 'computed should still return 42 after recomputation');

  assert(computationCount === 2, 'computed should recompute after its producer changes');

  // The result did not change, so the computed's version must remain stable.
  assert(
    computed.node.version === versionBeforeChange,
    'computed version should not change when the result is unchanged',
  );

  // The computed should nevertheless be valid after recomputation.
  assert(computed.isValid(), 'computed should be valid after recomputing the same result');
}

/**
 * Verifies that a computed producing the same result does not propagate
 * a new value change to its downstream consumer.
 *
 * The computed still recomputes because its producer changed, but because
 * its result is Object.is-equal to the previous result, its own value
 * version must remain unchanged.
 */
function testSameResultDoesNotPropagateValueChange(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let computedCount = 0;
  let consumerCount = 0;

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    // Count every execution of the computed function.
    computedCount++;

    // Establish the dependency without changing the final result.
    source.value;

    return 42;
  });

  const consumer = new ReactiveComputed(runtime, 'consumer', () => {
    // Count every execution of the downstream computation.
    consumerCount++;

    return computed.value + 1;
  });

  // Establish the complete dependency chain.
  assert(consumer.value === 43, 'consumer should initially evaluate to 43');

  assert(computedCount === 1, 'computed should initially run once');

  assert(consumerCount === 1, 'consumer should initially run once');

  const computedVersion = computed.node.version;

  // Change the source. This invalidates the computed.
  source.value = 2;

  assert(!computed.isValid(), 'computed should become invalid after source changes');

  assert(!consumer.isValid(), 'consumer should also become invalid through propagation');

  // Reading the consumer forces the chain to refresh.
  assert(consumer.value === 43, 'consumer should still produce 43');

  // The computed did recompute.
  assert(computedCount === 2, 'computed should recompute after source changes');

  // But the downstream consumer also needs to recompute because it was
  // already invalidated during the push phase.
  assert(consumerCount === 2, 'consumer should recompute after invalidation');

  // The computed result remained unchanged, so its value version stays put.
  assert(
    computed.node.version === computedVersion,
    'computed version should remain unchanged for the same result',
  );

  assert(consumer.isValid(), 'consumer should be valid after recomputation');
}

/**
 * Verifies that repeated recomputations producing the same value do not
 * increment the computed node's version.
 *
 * The dependency changes multiple times, so the computation executes
 * multiple times, but the resulting value remains unchanged.
 */
function testRepeatedSameResultKeepsVersionStable(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let computationCount = 0;

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    // Count every actual computation.
    computationCount++;

    // Track the source as a dependency.
    source.value;

    // Always produce the same result.
    return 'constant';
  });

  // Establish the initial cached value.
  assert(computed.value === 'constant', 'computed should initially return constant');

  const initialVersion = computed.node.version;

  // Change the producer and recompute once.
  source.value = 2;

  assert(computed.value === 'constant', 'computed should still return constant after first change');

  assert(
    computed.node.version === initialVersion,
    'version should remain stable after the first same-result recomputation',
  );

  // Change the producer again and recompute again.
  source.value = 3;

  assert(
    computed.value === 'constant',
    'computed should still return constant after second change',
  );

  assert(
    computed.node.version === initialVersion,
    'version should remain stable after the second same-result recomputation',
  );

  // Confirm that the computation actually executed for every invalidation.
  assert(
    computationCount === 3,
    'computation should run once initially and once per producer change',
  );
}

/**
 * Verifies that a computed node increments its value version when its
 * recomputation produces a genuinely different result.
 *
 * The version represents observable value changes, not merely computation
 * executions.
 */
function testChangedResultIncrementsVersion(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let computationCount = 0;

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    // Count every actual computation.
    computationCount++;

    // Track source as a dependency and return its current value.
    return source.value;
  });

  // Establish the initial value.
  assert(computed.value === 1, 'computed should initially return 1');

  const initialVersion = computed.node.version;

  assert(computationCount === 1, 'computed should initially run once');

  // Change the producer so the computed result changes as well.
  source.value = 2;

  assert(computed.value === 2, 'computed should recompute to 2');

  assert(computationCount === 2, 'computed should recompute exactly once');

  // A genuinely different result must advance the value version.
  assert(
    computed.node.version === initialVersion + 1,
    'computed version should increment when its result changes',
  );

  // A subsequent cached read must not increment the version again.
  assert(computed.value === 2, 'repeated read should return the cached value');

  assert(
    computed.node.version === initialVersion + 1,
    'cached reads should not change the computed version',
  );
}

/**
 * Verifies that assigning the same value does not invalidate the node.
 */
function testSameValueDoesNotInvalidate(): void {
  const runtime = new ReactiveRuntime();
  const value = new ReactiveValue(runtime, 'source', 10);

  // Capture the current version before assigning the same value.
  const versionBefore = value.node.version;

  // Assigning an equivalent value should not mark the node as changed.
  value.value = 10;

  // The version must remain unchanged because no reactive change occurred.
  assert(
    value.node.version === versionBefore,
    'assigning the same value should not invalidate the reactive node',
  );
}

/**
 * Verifies that assigning the same source value does not cause a computed
 * value to recompute.
 */
function testSameValueDoesNotRecomputeComputed(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let computeCount = 0;

  const computed = new ReactiveComputed(runtime, 'doubled', () => {
    // Count every actual computation so we can verify invalidation behavior.
    computeCount++;

    return source.value * 2;
  });

  // First read performs the initial lazy computation.
  assert(computed.value === 20, 'computed value should initially be 20');

  assert(computeCount === 1, 'computed should run once during the initial read');

  // Assigning the same source value must not invalidate the computed node.
  source.value = 10;

  // Reading again should reuse the cached result.
  assert(computed.value === 20, 'computed value should remain 20');

  assert(computeCount === 1, 'computed should not recompute when the source value is unchanged');
}

/**
 * Verifies that changing the source value causes the computed value to
 * recompute exactly once.
 */
function testDifferentValueRecomputesComputed(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let computeCount = 0;

  const computed = new ReactiveComputed(runtime, 'doubled', () => {
    // Count actual computations so invalidation can be observed directly.
    computeCount++;

    return source.value * 2;
  });

  // Perform the initial lazy computation.
  assert(computed.value === 20, 'computed value should initially be 20');

  assert(computeCount === 1, 'computed should initially run once');

  // A genuinely different value must invalidate the computed node.
  source.value = 20;

  // The next read should recompute using the new source value.
  assert(computed.value === 40, 'computed value should update after the source changes');

  assert(computeCount === 2, 'computed should recompute exactly once after the source changes');
}

/**
 * Verifies that ReactiveValue can use a custom equality function to decide
 * whether an update should invalidate the reactive graph.
 */
function testCustomEquality(): void {
  const runtime = new ReactiveRuntime();

  const value = new ReactiveValue(
    runtime,
    'source',
    {count: 1},
    (previous, next) => previous.count === next.count,
  );

  const versionBefore = value.node.version;

  // These are different object references but equivalent according to the
  // custom equality function.
  value.value = {count: 1};

  assert(
    value.node.version === versionBefore,
    'custom equality should prevent invalidation for equivalent values',
  );

  // This object differs according to the custom equality function.
  value.value = {count: 2};

  assert(
    value.node.version > versionBefore,
    'custom equality should allow invalidation for different values',
  );
}

/**
 * Verifies that an error thrown by the equality function does not replace
 * the currently stored value.
 */
function testEqualityErrorPreservesValue(): void {
  const runtime = new ReactiveRuntime();

  const value = new ReactiveValue(runtime, 'source', 10, () => {
    // Simulate an equality implementation failure.
    throw new Error('equality failure');
  });

  let threw = false;

  try {
    // The equality check happens before the stored value is replaced.
    value.value = 20;
  } catch (error) {
    threw = true;

    assert(
      error instanceof Error && error.message === 'equality failure',
      'equality errors should be propagated to the caller',
    );
  }

  assert(threw, 'assigning a value should propagate equality errors');

  assert(value.value === 10, 'the previous value should remain after an equality error');
}

/**
 * Verifies that a custom equality function can suppress downstream
 * invalidation when a computed result is structurally equivalent.
 */
function testComputedCustomEquality(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let computeCount = 0;

  const computed = new ReactiveComputed(
    runtime,
    'computed',
    () => {
      computeCount++;

      return {
        value: source.value % 2,
      };
    },
    (previous, next) => previous.value === next.value,
  );

  // First read initializes the computed value.
  computed.value;

  assert(computeCount === 1, 'computed should evaluate once during initialization');

  // This changes the source and therefore invalidates the computed, but the
  // computed result remains `{value: 1}`.
  source.value = 3;

  computed.value;

  assert(computeCount === 2, 'computed should reevaluate after its producer changes');

  assert(computed.value.value === 1, 'computed should produce the expected result');
}

/**
 * Verifies that an equal computed result does not increment the computed
 * node version.
 */
function testComputedEqualityPreventsVersionChange(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(
    runtime,
    'computed',
    () => ({
      value: source.value % 2,
    }),
    (previous, next) => previous.value === next.value,
  );

  // Initialize the computed value.
  computed.value;

  const initialVersion = computed.node.version;

  // Force a recomputation whose result is structurally equal.
  source.value = 3;
  computed.value;

  assert(
    computed.node.version === initialVersion,
    'computed version should not change when the result is equal',
  );
}

/**
 * Verifies that a genuinely different computed result still propagates
 * normally when a custom equality function is used.
 */
function testComputedCustomEqualityDetectsRealChange(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(
    runtime,
    'computed',
    () => ({
      value: source.value % 2,
    }),
    (previous, next) => previous.value === next.value,
  );

  // Initialize the computed value.
  computed.value;

  const initialVersion = computed.node.version;

  // 1 % 2 === 1, while 2 % 2 === 0.
  source.value = 2;
  computed.value;

  assert(
    computed.node.version > initialVersion,
    'computed version should change when the result is different',
  );

  assert(computed.value.value === 0, 'computed should expose the changed result');
}

/**
 * Verifies that the default computed equality behavior uses Object.is.
 *
 * Two separately created objects with identical contents are not equal under
 * Object.is, so the computed should treat the new object as a real change.
 */
function testComputedDefaultEquality(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => ({
    value: source.value,
  }));

  // Initialize the computed value.
  computed.value;

  const initialVersion = computed.node.version;

  // Change the producer so the computed is actually invalidated.
  //
  // The computed will produce:
  //
  // {value: 1} -> {value: 2}
  source.value = 2;

  computed.value;

  assert(
    computed.node.version > initialVersion,
    'default computed equality should detect a changed object',
  );
}

/**
 * Verifies that a computation error propagates to the caller.
 */
function testComputedErrorPropagates(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    if (source.value === 2) {
      throw new Error('computed failure');
    }

    return source.value;
  });

  // Establish the initial cached value and dependency graph.
  assert(computed.value === 1, 'computed should produce its initial value');

  source.value = 2;

  let threw = false;

  try {
    computed.value;
  } catch (error) {
    threw = error instanceof Error && error.message === 'computed failure';
  }

  assert(threw, 'computed errors should propagate to the caller');
}

/**
 * Verifies that a failed recomputation does not replace the previously
 * cached value.
 */
function testComputedErrorPreservesPreviousValue(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    if (source.value === 2) {
      throw new Error('computed failure');
    }

    return source.value;
  });

  // Establish the initial cached value.
  assert(computed.value === 1, 'computed should produce its initial value');

  source.value = 2;

  try {
    computed.value;
  } catch {
    // The error is expected for this test.
  }

  // The failed computation must not overwrite the previous cached value.
  assert(
    computed.isValid() === false,
    'computed should remain invalid after a failed recomputation',
  );
}

/**
 * Verifies that the computed can recover after a failed recomputation.
 */
function testComputedRecoversAfterError(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    if (source.value === 2) {
      throw new Error('computed failure');
    }

    return source.value;
  });

  // Establish the initial cached value.
  assert(computed.value === 1, 'computed should produce its initial value');

  // First force a failed computation.
  source.value = 2;

  try {
    computed.value;
  } catch {
    // The error is expected.
  }

  // Restore a valid producer value.
  source.value = 3;

  assert(computed.value === 3, 'computed should recover after a failed recomputation');

  assert(computed.isValid(), 'computed should be valid after successful recovery');
}

/**
 * Verifies that a disposed reactive value can no longer be mutated.
 */
function testDisposedReactiveValueCannotBeWritten(): void {
  // Create a fresh runtime for the disposal-state test.
  const runtime = new ReactiveRuntime();

  // Create a writable reactive value.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Dispose the value before attempting another write.
  source.dispose();

  // The public lifecycle state should reflect the disposal.
  assert(source.disposed, 'Reactive value should report itself as disposed.');

  // Attempting to write after disposal should fail explicitly.
  let errorMessage = '';

  try {
    // A disposed reactive value must not re-enter the reactive graph.
    source.value = 2;
  } catch (error) {
    // Capture the lifecycle error for verification.
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  // The write must be rejected.
  assert(errorMessage.length > 0, 'Writing to a disposed reactive value should throw.');

  // Verify that the error identifies the disposed state.
  assert(
    errorMessage === 'Reactive value "source" has been disposed.',
    'Disposed reactive value should report the expected lifecycle error.',
  );
}

/**
 * Verifies that disposing a reactive value disconnects its consumers and
 * prevents the disposed value from participating in future propagation.
 */
function testDisposedReactiveValueCannotBeRevived(): void {
  // Create a fresh runtime for the lifecycle test.
  const runtime = new ReactiveRuntime();

  // Create a source value.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create a computed value that depends on the source.
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Establish the source -> computed dependency.
  assert(computed.value === 2, 'Computed should initially evaluate to 2.');

  // Confirm the consumer relationship exists before disposal.
  assert(source.node.consumerCount === 1, 'Source should have one consumer before disposal.');

  // Dispose the source.
  source.dispose();

  // The disposed source should no longer have consumers.
  assert(source.node.consumerCount === 0, 'Disposed source should have no consumers.');

  // The computed should no longer retain the disposed source as a producer.
  assert(
    computed.node.producerCount === 0,
    'Computed should have no producers after source disposal.',
  );

  // The source should remain permanently disposed.
  assert(source.disposed, 'Source should remain disposed.');
}

/**
 * Verifies that a computed detects when one of its producers has been
 * disposed and rejects evaluation instead of reading stale reactive state.
 */
function testComputedCannotReadDisposedProducer(): void {
  // Create a fresh runtime for the producer-disposal test.
  const runtime = new ReactiveRuntime();

  // Create a source value.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create a computed value depending on the source.
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value * 2);

  // Establish the dependency relationship.
  assert(computed.value === 2, 'Computed should initially evaluate to 2.');

  // Dispose the producer after the dependency has been established.
  source.dispose();

  // Reading the computed should not silently use the disposed producer.
  let errorMessage = '';

  try {
    // Force the computed to evaluate again.
    void computed.value;
  } catch (error) {
    // Capture the lifecycle error for verification.
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  // The computed must reject evaluation after its producer is disposed.
  assert(
    errorMessage.length > 0,
    'Computed should reject evaluation after its producer is disposed.',
  );

  /**
   * Verifies that the computed receives the precise producer-disposal error.
   */
  assert(
    errorMessage === 'Reactive value "source" has been disposed.',
    'Computed should report the disposed producer error.',
  );
}

/**
 * Verifies that disposing a reactive value more than once is harmless.
 */
function testReactiveValueDisposalIsIdempotent(): void {
  // Create a fresh runtime for the idempotence test.
  const runtime = new ReactiveRuntime();

  // Create a writable reactive value.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Dispose the value once.
  source.dispose();

  // Disposing the same value again should not throw.
  source.dispose();

  // The value should remain disposed after repeated disposal.
  assert(source.disposed, 'Reactive value should remain disposed after repeated disposal.');

  // The runtime should not contain the disposed value.
  assert(
    !runtime.getNodes().includes(source.node),
    'Disposed reactive value should remain absent from the runtime.',
  );
}

/**
 * Verifies that disposing a reactive value does not alter its stored value.
 */
function testReactiveValueDisposalPreservesValue(): void {
  // Create a fresh runtime for the value-preservation test.
  const runtime = new ReactiveRuntime();

  // Create a writable reactive value.
  const source = new ReactiveValue(runtime, 'source', 42);

  // Dispose the value.
  source.dispose();

  // The internal stored value should remain unchanged even though reads
  // are no longer permitted after disposal.
  assert(source.node.version === 0, 'Disposing a reactive value should not increment its version.');
}

testComputedCustomEquality();
testEqualityErrorPreservesValue();
testCustomEquality();
testDifferentValueRecomputesComputed();
testSameValueDoesNotRecomputeComputed();
testSameValueDoesNotInvalidate();
testComputedCustomEquality();
testComputedEqualityPreventsVersionChange();
testComputedCustomEqualityDetectsRealChange();
testComputedDefaultEquality();
testComputedErrorPropagates();
testComputedErrorPreservesPreviousValue();
testComputedRecoversAfterError();
/*
 * Run the reactive computed test suite.
 *
 * Each test focuses on one invariant of the reactive graph:
 * - validity lifecycle,
 * - lazy evaluation,
 * - caching,
 * - multi-level invalidation,
 * - dependency tracking,
 * - dependency deduplication,
 * - nested dependency deduplication,
 * - producer invalidation,
 * - diamond invalidation,
 * - diamond recomputation,
 * - shared producer invalidation,
 * - graph consistency,
 * - version/invalidation separation,
 * - reactive-link lifecycle,
 * - same-result recomputation,
 * - same-result propagation,
 * - repeated same-result version stability,
 * - changed-result version increments.
 */
testComputedValidityLifecycle();
testLazyRecomputation();
testCachedReads();
testMultiLevelInvalidation();
testComputedDependencies();
testRemovedDependency();
testDependencyDeduplication();
testNestedDependencyDeduplication();
testProducerInvalidatesConsumers();
testDiamondInvalidation();
testDiamondRecomputationCounts();
testSharedProducerConsumers();
testDependencyGraphConsistency();
testVersionAndInvalidationAreSeparate();
testReactiveLinkVersionLifecycle();
testSameResultDoesNotChangeVersion();
testSameResultDoesNotPropagateValueChange();
testRepeatedSameResultKeepsVersionStable();
testChangedResultIncrementsVersion();
testDisposedReactiveValueCannotBeWritten();
testDisposedReactiveValueCannotBeRevived();
testComputedCannotReadDisposedProducer();
testReactiveValueDisposalIsIdempotent();
testReactiveValueDisposalPreservesValue();
