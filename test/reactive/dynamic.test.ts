import {ReactiveRuntime} from '../../src/reactive/reactive-runtime.js';
import {ReactiveValue} from '../../src/reactive/reactive-value.js';
import {ReactiveComputed} from '../../src/reactive/reactive-computed.js';
import {assert} from '../assert.js';

/**
 * Creates a fresh runtime for this dynamic dependency test.
 */
const runtime = new ReactiveRuntime();

/**
 * Controls which source the computed value should use.
 *
 *     true  → first
 *     false → second
 */
const useFirst = new ReactiveValue(runtime, 'use-first', true);

/**
 * First possible source.
 */
const first = new ReactiveValue(runtime, 'first', 10);

/**
 * Second possible source.
 */
const second = new ReactiveValue(runtime, 'second', 20);

/**
 * Computed value with a dynamic dependency.
 *
 * The dependency graph initially becomes:
 *
 *     use-first ──► selected
 *     first     ──► selected
 */
const selected = new ReactiveComputed(runtime, 'selected', () => {
  // Only the branch that executes should become a dependency.
  return useFirst.value ? first.value : second.value;
});

/**
 * Establish the initial dependency set.
 */
assert(selected.value === 10, 'Expected the initial selected value to be 10.');

assert(
  selected.node.getProducerIds().includes('first'),
  'Expected selected to initially depend on first.',
);

assert(
  !selected.node.getProducerIds().includes('second'),
  'Expected selected not to initially depend on second.',
);

/**
 * Switch the active branch.
 */
useFirst.value = false;

/**
 * The computation should now use `second`.
 */
assert(selected.value === 20, 'Expected selected to switch to second.');

/**
 * The old dependency should have been removed.
 */
assert(
  !selected.node.getProducerIds().includes('first'),
  'Expected first to be removed from the dependencies.',
);

assert(
  selected.node.getProducerIds().includes('second'),
  'Expected second to become a dependency.',
);

/**
 * Changing the old producer must not invalidate the computed value.
 */
first.value = 100;

assert(selected.value === 20, 'Expected changes to the old producer to be ignored.');

/**
 * Changing the active producer must invalidate the computed value.
 */
second.value = 30;

assert(selected.value === 30, 'Expected changes to the active producer to recompute the value.');

console.log('Reactive dynamic dependency test passed.');

/**
 * Verifies that changing dynamic dependencies does not retain a stale
 * changed-producer record from the previous computation.
 */
{
  const runtime = new ReactiveRuntime();

  const useFirst = new ReactiveValue(runtime, 'clear-use-first', true);
  const first = new ReactiveValue(runtime, 'clear-first', 10);
  const second = new ReactiveValue(runtime, 'clear-second', 20);

  const selected = new ReactiveComputed(runtime, 'clear-selected', () =>
    useFirst.value ? first.value : second.value,
  );

  // Establish the initial dependency on `first`.
  assert(selected.value === 10, 'selected should initially use the first value');

  // Switch the dynamic dependency to `second`.
  useFirst.value = false;

  assert(selected.value === 20, 'selected should switch to the second value');

  // After recomputation, no producer should remain marked as changed.
  assert(
    selected.getChangedProducer() === undefined,
    'dynamic dependency switch should clear changed-producer state',
  );
}

/**
 * Verifies that a computed removes a producer that is no longer read during
 * a later computation.
 */
function testComputedRemovesDynamicDependency(): void {
  const runtime = new ReactiveRuntime();

  const condition = new ReactiveValue(runtime, 'condition', true);
  const first = new ReactiveValue(runtime, 'first', 10);
  const second = new ReactiveValue(runtime, 'second', 20);

  const computed = new ReactiveComputed(runtime, 'computed', () =>
    condition.value ? first.value : second.value,
  );

  // Initial computation establishes:
  //
  // condition -> computed
  // first     -> computed
  computed.value;

  assert(
    computed.node.hasProducer(condition.node),
    'computed should initially depend on condition',
  );

  assert(computed.node.hasProducer(first.node), 'computed should initially depend on first');

  assert(!computed.node.hasProducer(second.node), 'computed should not initially depend on second');

  // Switch the dynamic branch.
  condition.value = false;

  computed.value;

  assert(
    computed.node.hasProducer(condition.node),
    'computed should continue depending on condition',
  );

  assert(!computed.node.hasProducer(first.node), 'computed should remove the old first dependency');

  assert(computed.node.hasProducer(second.node), 'computed should add the new second dependency');
}

/**
 * Verifies that a removed dynamic producer no longer triggers the computed.
 */
function testRemovedDynamicDependencyStopsInvalidation(): void {
  const runtime = new ReactiveRuntime();

  const condition = new ReactiveValue(runtime, 'condition', true);
  const first = new ReactiveValue(runtime, 'first', 10);
  const second = new ReactiveValue(runtime, 'second', 20);

  let computeCount = 0;

  const computed = new ReactiveComputed(runtime, 'computed', () => {
    computeCount++;

    return condition.value ? first.value : second.value;
  });

  // Establish the initial dependency graph.
  computed.value;

  // Switch from `first` to `second`.
  condition.value = false;
  computed.value;

  const countAfterSwitch = computeCount;

  // Changing the removed producer must no longer invalidate the computed.
  first.value = 100;

  assert(computeCount === countAfterSwitch, 'removed producer should not trigger the computed');

  // Changing the current producer should still invalidate it.
  second.value = 200;
  computed.value;

  assert(computeCount === countAfterSwitch + 1, 'current producer should trigger the computed');
}

/**
 * Verifies that repeated dynamic dependency switches do not accumulate stale
 * producer links.
 */
function testDynamicDependencySwitchDoesNotAccumulateLinks(): void {
  const runtime = new ReactiveRuntime();

  const condition = new ReactiveValue(runtime, 'condition', true);
  const first = new ReactiveValue(runtime, 'first', 10);
  const second = new ReactiveValue(runtime, 'second', 20);

  const computed = new ReactiveComputed(runtime, 'computed', () =>
    condition.value ? first.value : second.value,
  );

  // Switch between branches several times.
  computed.value;

  condition.value = false;
  computed.value;

  condition.value = true;
  computed.value;

  condition.value = false;
  computed.value;

  // Only the currently active branch and the condition should remain.
  assert(
    computed.node.producerCount === 2,
    'dynamic dependency switching should not accumulate stale links',
  );

  assert(computed.node.hasProducer(condition.node), 'condition should remain a producer');

  assert(
    computed.node.hasProducer(second.node),
    'current dynamic producer should remain connected',
  );

  assert(
    !computed.node.hasProducer(first.node),
    'inactive dynamic producer should not remain connected',
  );
}

testComputedRemovesDynamicDependency();
testRemovedDynamicDependencyStopsInvalidation();
testDynamicDependencySwitchDoesNotAccumulateLinks();
