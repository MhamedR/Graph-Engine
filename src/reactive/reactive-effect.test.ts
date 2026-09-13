import {ReactiveRuntime} from './reactive-runtime.js';
import {ReactiveValue} from './reactive-value.js';
import {assert} from '../test/assert.js';
import {EffectState, ReactiveEffect} from './reactive-effect.js';
import {ReactiveNode} from './reactive-node.js';

/**
 * Verifies that an effect executes and tracks the values it reads.
 */
function testEffectExecution(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;
  let observedValue = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Count every execution of the effect.
    executions++;

    // Reading the reactive value establishes a dependency.
    observedValue = source.value;
  });

  assert(!effect.initialized, 'effect should initially be uninitialized');

  effect.run();

  assert(effect.initialized, 'effect should be initialized after its first run');

  assert(executions === 1, 'effect should execute exactly once');

  assert(observedValue === 10, 'effect should observe the current source value');

  assert(effect.node.hasProducer(source.node), 'effect should track the source as a producer');
}

/**
 * Verifies that an effect becomes dirty when one of its dependencies changes.
 */
function testEffectInvalidation(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Reading the source establishes the dependency.
    source.value;

    // Count each execution.
    executions++;
  });

  assert(effect.shouldRun(), 'uninitialized effect should report that it should run');

  effect.run();

  assert(!effect.shouldRun(), 'clean initialized effect should not report that it should run');

  assert(!effect.isDirty, 'effect should report itself as clean after execution');

  assert(executions === 1, 'effect should initially execute once');

  assert(!effect.node.dirty, 'effect should be clean after execution');

  source.value = 20;

  assert(effect.shouldRun(), 'dirty effect should report that it should run');

  assert(effect.isDirty, 'effect should report itself as dirty after its source changes');

  assert(effect.node.dirty, 'effect should become dirty when its source changes');

  assert(executions === 1, 'effect should not rerun automatically before the scheduler flushes');

  effect.run();

  assert(!effect.shouldRun(), 'clean effect should not report that it should run');

  assert(!effect.isDirty, 'effect should report itself as clean after rerunning');

  assert(executions === 2, 'explicit effect execution should rerun the effect');

  assert(!effect.node.dirty, 'effect should be clean after rerunning');
}

/**
 * Verifies that effects are automatically scheduled when invalidated and
 * that repeated invalidation does not create duplicate scheduler work.
 */
function testEffectScheduling(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect tracks it as a dependency.
    source.value;

    // Count every actual execution.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(executions === 1, 'effect should execute once during initial run');

  assert(!effect.isScheduled, 'effect should not be scheduled after its initial run');

  // Changing the source invalidates the effect and should automatically
  // schedule it through the runtime.
  source.value = 20;

  assert(effect.shouldRun(), 'effect should require execution after source invalidation');

  assert(effect.isScheduled, 'effect should automatically schedule after invalidation');

  assert(
    runtime.scheduler.pendingCount === 1,
    'effect invalidation should create one pending task',
  );

  assert(executions === 1, 'scheduled effect should not execute before the scheduler flushes');

  // Repeated invalidation while the effect is already dirty should not
  // create additional scheduled tasks.
  source.value = 30;
  source.value = 40;

  assert(
    runtime.scheduler.pendingCount === 1,
    'repeated invalidation should remain one pending scheduler task',
  );

  // Execute the scheduled effect.
  runtime.flush();

  assert(executions === 2, 'scheduled effect should execute when the runtime is flushed');

  assert(!effect.isScheduled, 'effect should no longer be scheduled after execution');

  assert(!effect.shouldRun(), 'effect should be clean after scheduled execution');

  assert(!effect.isDirty, 'effect should no longer be dirty after scheduled execution');
}

/**
 * Verifies that dependency invalidation schedules an effect without
 * executing it synchronously.
 */
function testEffectSchedulingIsDeferred(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect becomes dependent on it.
    source.value;

    // Count actual effect executions.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(executions === 1, 'effect should execute once during initial setup');

  // Change the dependency.
  source.value = 20;

  assert(executions === 1, 'effect should not execute synchronously when invalidated');

  assert(effect.isDirty, 'effect should be dirty after dependency invalidation');

  assert(effect.isScheduled, 'effect should be scheduled after dependency invalidation');

  assert(runtime.hasPendingWork, 'runtime should have pending effect work');

  // The scheduled effect executes only at the scheduler boundary.
  runtime.flush();

  assert(executions === 2, 'effect should execute after the scheduler is flushed');

  assert(!effect.isDirty, 'effect should be clean after scheduled execution');

  assert(!effect.isScheduled, 'effect should no longer be scheduled after execution');
}

/**
 * Verifies that an explicit effect run clears its scheduled state even when
 * the scheduler still contains the previously queued task.
 */
function testManualRunCancelsScheduledState(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect tracks it as a dependency.
    source.value;

    // Count every actual effect execution.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  // Invalidate the effect so it becomes scheduled.
  source.value = 20;

  assert(effect.isScheduled, 'effect should be scheduled after invalidation');

  assert(runtime.scheduler.pendingCount === 1, 'scheduler should contain one pending effect task');

  // Execute the effect explicitly before the scheduler flushes.
  effect.run();

  assert(executions === 2, 'explicit run should execute the effect immediately');

  assert(!effect.isScheduled, "explicit run should clear the effect's scheduled state");

  assert(!effect.isDirty, 'explicit run should leave the effect clean');

  // The old scheduler task still exists, but it should do nothing because
  // the effect is already clean.
  runtime.flush();

  assert(executions === 2, 'stale scheduled work should not execute the effect again');
}

/**
 * Verifies that destroying an effect prevents future execution and
 * scheduling, completely isolates its reactive node, and removes it
 * from the runtime registry.
 */
function testEffectDestruction(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a dependency.
    source.value;

    // Count every actual execution.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(executions === 1, 'effect should execute once during initial setup');

  assert(!effect.destroyed, 'effect should initially be active');

  assert(
    runtime.getNodes().includes(effect.node),
    'effect should be registered with the runtime before destruction',
  );

  // Permanently destroy the effect.
  effect.destroy();

  assert(effect.destroyed, 'effect should be destroyed after destroy()');

  assert(effect.node.isIsolated(), 'destroyed effect node should be completely isolated');

  assert(
    !runtime.getNodes().includes(effect.node),
    'destroyed effect should no longer be registered with the runtime',
  );

  // A destroyed effect must not execute when run explicitly.
  effect.run();

  assert(executions === 1, 'destroyed effect should not execute when run explicitly');

  // A destroyed effect must not schedule new work.
  effect.schedule();

  assert(!effect.isScheduled, 'destroyed effect should not become scheduled');

  assert(runtime.scheduler.pendingCount === 0, 'destroyed effect should not add scheduler work');

  // Changing a dependency must also be harmless.
  source.value = 20;

  assert(executions === 1, 'destroyed effect should not execute after dependency changes');

  assert(
    runtime.scheduler.pendingCount === 0,
    'destroyed effect should not schedule after dependency changes',
  );
}

/**
 * Verifies that destroying an effect more than once is safe and does not
 * change its lifecycle state after the first destruction.
 */
function testEffectDestructionIsIdempotent(): void {
  const runtime = new ReactiveRuntime();

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Count every actual execution.
    executions++;
  });

  // Establish the effect's initial state.
  effect.run();

  assert(executions === 1, 'effect should execute once during initial setup');

  // Destroy the effect for the first time.
  effect.destroy();

  assert(effect.destroyed, 'effect should be destroyed after the first destroy call');

  // Destroying an already destroyed effect should be harmless.
  effect.destroy();

  assert(effect.destroyed, 'effect should remain destroyed after repeated destroy calls');

  assert(executions === 1, 'repeated destruction should not execute the effect');

  assert(
    runtime.scheduler.pendingCount === 0,
    'repeated destruction should not create scheduler work',
  );
}

/**
 * Verifies that destroying an effect clears its scheduled lifecycle state
 * even when a scheduler task is still waiting.
 */
function testDestroyScheduledEffect(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect tracks it as a dependency.
    source.value;

    // Count actual effect executions.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  // Invalidate the effect so it becomes scheduled.
  source.value = 20;

  assert(effect.isScheduled, 'effect should be scheduled after invalidation');

  assert(runtime.scheduler.pendingCount === 1, 'scheduler should contain one pending effect task');

  // Destroy the effect before its scheduled task executes.
  effect.destroy();

  assert(effect.destroyed, 'effect should report itself as destroyed');

  assert(!effect.isScheduled, 'destroyed effect should no longer report itself as scheduled');

  // The scheduler task itself still exists. It should become harmless when
  // the scheduler eventually processes it.
  assert(
    runtime.scheduler.pendingCount === 1,
    'destroying the effect should not directly remove the scheduler task yet',
  );

  runtime.flush();

  assert(executions === 1, 'destroyed scheduled effect should not execute again');

  assert(!effect.isScheduled, 'effect should remain unscheduled after the stale task is processed');
}

/**
 * Verifies that destroying an effect currently leaves its dependency links
 * intact until explicit dependency cleanup is implemented.
 *
 * This test documents the current intermediate lifecycle state so the next
 * cleanup step has a precise behavior to change.
 */
function testDestroyedEffectDependencyState(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a dependency.
    source.value;
  });

  // Establish the dependency graph.
  effect.run();

  assert(effect.node.hasProducer(source.node), 'effect should track source before destruction');

  assert(source.node.consumerCount === 1, 'source should have one consumer before destruction');

  // Destroy the effect and clean up its dependency links.
  effect.destroy();

  assert(
    !effect.node.hasProducer(source.node),
    'destroyed effect should no longer retain its producer link',
  );

  assert(
    source.node.consumerCount === 0,
    'source should no longer retain the destroyed effect as a consumer',
  );
}

/**
 * Verifies that destroying an effect removes all of its dependency links.
 */
function testDestroyedEffectCleansAllDependencies(): void {
  const runtime = new ReactiveRuntime();

  const firstSource = new ReactiveValue(runtime, 'first', 10);
  const secondSource = new ReactiveValue(runtime, 'second', 20);
  const thirdSource = new ReactiveValue(runtime, 'third', 30);

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read all three sources so the effect tracks all of them.
    firstSource.value;
    secondSource.value;
    thirdSource.value;
  });

  // Establish all three dependency links.
  effect.run();

  assert(
    effect.node.producerCount === 3,
    'effect should track all three producers before destruction',
  );

  assert(
    firstSource.node.consumerCount === 1,
    'first source should have one consumer before destruction',
  );

  assert(
    secondSource.node.consumerCount === 1,
    'second source should have one consumer before destruction',
  );

  assert(
    thirdSource.node.consumerCount === 1,
    'third source should have one consumer before destruction',
  );

  // Destroy the effect and clean up every dependency.
  effect.destroy();

  assert(effect.node.producerCount === 0, 'destroyed effect should have no producers');

  assert(
    firstSource.node.consumerCount === 0,
    'first source should have no consumers after destruction',
  );

  assert(
    secondSource.node.consumerCount === 0,
    'second source should have no consumers after destruction',
  );

  assert(
    thirdSource.node.consumerCount === 0,
    'third source should have no consumers after destruction',
  );
}

/**
 * Verifies that changing a former dependency after effect destruction does
 * not invalidate the destroyed effect.
 */
function testDestroyedEffectIgnoresFormerDependencies(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a dependency.
    source.value;

    // Count actual executions.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(executions === 1, 'effect should execute once during initial setup');

  assert(effect.node.consumerCount === 0, 'effect should not have consumers before destruction');

  // Destroy the effect and remove its producer relationship.
  effect.destroy();

  assert(effect.node.producerCount === 0, 'destroyed effect should have no producers');

  // Changing the former dependency must no longer reach the effect.
  source.value = 20;

  assert(!effect.isDirty, 'destroyed effect should not become dirty from a former dependency');

  assert(
    !effect.isScheduled,
    'destroyed effect should not become scheduled from a former dependency',
  );

  assert(runtime.scheduler.pendingCount === 0, 'destroyed effect should not create scheduler work');

  assert(
    executions === 1,
    'destroyed effect should not execute after its former dependency changes',
  );
}

/**
 * Verifies the complete public lifecycle contract of a destroyed effect.
 */
function testDestroyedEffectLifecycle(): void {
  const runtime = new ReactiveRuntime();

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Count every actual execution.
    executions++;
  });

  assert(!effect.destroyed, 'effect should initially be active');

  // Destroy the effect.
  effect.destroy();

  assert(effect.destroyed, 'effect should be destroyed after destroy()');

  assert(!effect.isScheduled, 'destroyed effect should not be scheduled');

  // Repeated destruction must not change the state.
  effect.destroy();

  assert(effect.destroyed, 'effect should remain destroyed after repeated destruction');

  // Neither explicit execution nor explicit scheduling should have any
  // effect after destruction.
  effect.run();
  effect.schedule();

  assert(executions === 0, 'destroyed effect should never execute');

  assert(runtime.scheduler.pendingCount === 0, 'destroyed effect should never schedule work');
}

/**
 * Verifies that dispose() delegates to the effect destruction lifecycle.
 */
function testEffectDispose(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a dependency.
    source.value;

    // Count actual executions.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(executions === 1, 'effect should execute once during initial setup');

  assert(effect.node.producerCount === 1, 'effect should have one producer before disposal');

  // Dispose the effect through the alias.
  effect.dispose();

  assert(effect.destroyed, 'dispose() should destroy the effect');

  assert(effect.node.producerCount === 0, "dispose() should remove the effect's producer links");

  assert(
    source.node.consumerCount === 0,
    'dispose() should remove the effect from its source consumers',
  );

  // Disposal should be idempotent.
  effect.dispose();

  assert(effect.destroyed, 'effect should remain destroyed after repeated dispose()');

  // Former dependencies must no longer affect the disposed effect.
  source.value = 20;

  assert(executions === 1, 'disposed effect should not execute after source changes');

  assert(runtime.scheduler.pendingCount === 0, 'disposed effect should not schedule new work');
}

/**
 * Verifies that dependencyCount reflects the effect's current dependency
 * graph and becomes zero after disposal.
 */
function testEffectDependencyCount(): void {
  const runtime = new ReactiveRuntime();

  const firstSource = new ReactiveValue(runtime, 'first', 10);
  const secondSource = new ReactiveValue(runtime, 'second', 20);

  let useSecondSource = true;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Always track the first source.
    firstSource.value;

    // Track the second source only while the branch is enabled.
    if (useSecondSource) {
      secondSource.value;
    }
  });

  assert(effect.dependencyCount === 0, 'uninitialized effect should have no dependencies');

  // Establish the initial dependency graph.
  effect.run();

  assert(effect.dependencyCount === 2, 'effect should track two dependencies after the first run');

  // Change the dependency condition.
  useSecondSource = false;

  // Run explicitly so dependency tracking is rebuilt immediately.
  effect.run();

  assert(
    effect.dependencyCount === 1,
    'effect should track only one dependency after dynamic cleanup',
  );

  // Dispose the effect and remove the remaining dependency.
  effect.dispose();

  assert(effect.dependencyCount === 0, 'disposed effect should have no dependencies');
}

/**
 * Verifies that dependencyIds exposes the effect's current dependency
 * identities without exposing its internal collections.
 */
function testEffectDependencyIds(): void {
  const runtime = new ReactiveRuntime();

  const firstSource = new ReactiveValue(runtime, 'first', 10);
  const secondSource = new ReactiveValue(runtime, 'second', 20);

  let useSecondSource = true;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Always depend on the first source.
    firstSource.value;

    // Dynamically depend on the second source.
    if (useSecondSource) {
      secondSource.value;
    }
  });

  // Before the first execution, there are no tracked dependencies.
  assert(effect.dependencyIds.length === 0, 'uninitialized effect should expose no dependency IDs');

  // Establish both dependencies.
  effect.run();

  const initialDependencies = effect.dependencyIds;

  assert(initialDependencies.length === 2, 'effect should expose two dependency IDs');

  assert(initialDependencies.includes('first'), 'dependency IDs should include the first source');

  assert(initialDependencies.includes('second'), 'dependency IDs should include the second source');

  // Change the dynamic dependency condition.
  useSecondSource = false;

  // Rebuild the dependency graph.
  effect.run();

  const updatedDependencies = effect.dependencyIds;

  assert(
    updatedDependencies.length === 1,
    'effect should expose one dependency after dynamic cleanup',
  );

  assert(
    updatedDependencies.includes('first'),
    'remaining dependency IDs should include the first source',
  );

  assert(
    !updatedDependencies.includes('second'),
    'removed dependency IDs should exclude the second source',
  );

  // Dispose the effect and verify that the public inspection API reflects
  // the cleaned-up graph.
  effect.dispose();

  assert(effect.dependencyIds.length === 0, 'disposed effect should expose no dependency IDs');
}

/**
 * Verifies that the effect's active and destroyed lifecycle states are
 * complementary.
 */
function testEffectLifecycleState(): void {
  const runtime = new ReactiveRuntime();

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // This effect intentionally has no reactive dependencies.
  });

  assert(effect.isActive, 'newly created effect should be active');

  assert(!effect.destroyed, 'newly created effect should not be destroyed');

  // Destroy the effect.
  effect.destroy();

  assert(!effect.isActive, 'destroyed effect should not be active');

  assert(effect.destroyed, 'destroyed effect should report itself as destroyed');

  // Repeated destruction must not restore the active state.
  effect.destroy();

  assert(!effect.isActive, 'repeated destruction should not reactivate the effect');

  assert(effect.destroyed, 'effect should remain destroyed after repeated destruction');
}

/**
 * Verifies that a destroyed effect never reports that it should run.
 */
function testDestroyedEffectShouldRun(): void {
  const runtime = new ReactiveRuntime();

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // This effect intentionally has no dependencies.
  });

  assert(effect.shouldRun(), 'uninitialized active effect should report that it should run');

  effect.run();

  assert(!effect.shouldRun(), 'clean initialized effect should not report that it should run');

  effect.destroy();

  assert(!effect.shouldRun(), 'destroyed effect should never report that it should run');
}

/**
 * Verifies that a destroyed effect never reports itself as dirty.
 */
function testDestroyedEffectIsDirty(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a dependency.
    source.value;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(!effect.isDirty, 'effect should initially be clean');

  // Invalidate the effect before destroying it.
  source.value = 20;

  assert(effect.isDirty, 'effect should be dirty after dependency invalidation');

  // Destroy the dirty effect.
  effect.destroy();

  assert(!effect.isDirty, 'destroyed effect should not report itself as dirty');

  assert(!effect.shouldRun(), 'destroyed effect should not report that it should run');
}

/**
 * Verifies that the public effect state snapshot reflects the current
 * lifecycle and dependency state.
 */
function testEffectStateSnapshot(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a dependency.
    source.value;
  });

  const initialState = effect.state;

  // The state snapshot should be assignable to the public EffectState type.
  const typedState: EffectState = initialState;

  assert(typedState.dependencyCount === 0, 'typed effect state should expose the dependency count');

  assert(!initialState.initialized, 'new effect should not initially be initialized');

  assert(!initialState.destroyed, 'new effect should not initially be destroyed');

  assert(initialState.active, 'new effect should initially be active');

  assert(!initialState.dirty, 'new effect should initially be clean');

  assert(!initialState.scheduled, 'new effect should initially not be scheduled');

  assert(initialState.dependencyCount === 0, 'new effect should initially have no dependencies');

  // Establish the dependency graph.
  effect.run();

  const activeState = effect.state;

  assert(activeState.initialized, 'effect should be initialized after execution');

  assert(activeState.active, 'effect should remain active after execution');

  assert(!activeState.dirty, 'effect should be clean after execution');

  assert(!activeState.scheduled, 'effect should not be scheduled after execution');

  assert(activeState.dependencyCount === 1, 'effect should report one dependency after execution');

  // Invalidate the effect so its scheduled and dirty states become visible.
  source.value = 20;

  const dirtyState = effect.state;

  assert(dirtyState.dirty, 'effect state should report dirty after invalidation');

  assert(dirtyState.scheduled, 'effect state should report scheduled after invalidation');

  // Destroy the effect.
  effect.destroy();

  const destroyedState = effect.state;

  assert(destroyedState.destroyed, 'effect state should report destroyed after destruction');

  assert(!destroyedState.active, 'destroyed effect state should report inactive');

  assert(!destroyedState.dirty, 'destroyed effect state should report clean');

  assert(!destroyedState.scheduled, 'destroyed effect state should report unscheduled');

  assert(
    destroyedState.dependencyCount === 0,
    'destroyed effect state should report no dependencies',
  );
}

/**
 * Verifies that destroying an effect leaves its reactive node disconnected
 * from the dependency graph.
 */
function testDestroyedEffectGraphIsolation(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a producer relationship.
    source.value;
  });

  // Establish the dependency graph.
  effect.run();

  assert(effect.node.producerCount === 1, 'effect should have one producer before destruction');

  assert(effect.node.consumerCount === 0, 'effect should initially have no consumers');

  // Destroy the effect and disconnect its graph relationships.
  effect.destroy();

  assert(effect.node.producerCount === 0, 'destroyed effect should have no producers');

  assert(effect.node.consumerCount === 0, 'destroyed effect should have no consumers');

  assert(
    source.node.consumerCount === 0,
    'source should have no consumers after effect destruction',
  );
}

/**
 * Verifies that dispose() disconnects the effect from every producer.
 */
function testDisposeCleansAllDependencies(): void {
  const runtime = new ReactiveRuntime();

  const firstSource = new ReactiveValue(runtime, 'first', 10);
  const secondSource = new ReactiveValue(runtime, 'second', 20);

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read both sources so the effect establishes two dependencies.
    firstSource.value;
    secondSource.value;
  });

  // Establish the dependency graph.
  effect.run();

  assert(effect.dependencyCount === 2, 'effect should have two dependencies before disposal');

  assert(
    firstSource.node.consumerCount === 1,
    'first source should have one consumer before disposal',
  );

  assert(
    secondSource.node.consumerCount === 1,
    'second source should have one consumer before disposal',
  );

  // Dispose the effect.
  effect.dispose();

  assert(effect.dependencyCount === 0, 'disposed effect should have no dependencies');

  assert(
    firstSource.node.consumerCount === 0,
    'first source should have no consumers after disposal',
  );

  assert(
    secondSource.node.consumerCount === 0,
    'second source should have no consumers after disposal',
  );

  assert(effect.destroyed, 'disposed effect should be destroyed');
}

/**
 * Verifies that clearProducers() removes every dependency from a node
 * and disconnects both sides of each graph relationship.
 */
function testNodeClearProducers(): void {
  const runtime = new ReactiveRuntime();

  const firstSource = new ReactiveValue(runtime, 'first', 10);
  const secondSource = new ReactiveValue(runtime, 'second', 20);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Read both sources so the effect establishes two dependencies.
    firstSource.value;
    secondSource.value;
  });

  // Establish the dependency graph.
  consumer.run();

  assert(consumer.dependencyCount === 2, 'consumer should have two dependencies before clearing');

  assert(
    firstSource.node.consumerCount === 1,
    'first source should have one consumer before clearing',
  );

  assert(
    secondSource.node.consumerCount === 1,
    'second source should have one consumer before clearing',
  );

  // Clear all producer relationships directly through the node primitive.
  consumer.node.clearProducers();

  assert(consumer.dependencyCount === 0, 'consumer should have no dependencies after clearing');

  assert(
    firstSource.node.consumerCount === 0,
    'first source should have no consumers after clearing',
  );

  assert(
    secondSource.node.consumerCount === 0,
    'second source should have no consumers after clearing',
  );
}

/**
 * Verifies that clearConsumers() removes every consumer relationship from
 * a node and disconnects both sides of each graph relationship.
 */
function testNodeClearConsumers(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const firstConsumer = new ReactiveEffect(runtime, 'first-consumer', () => {
    // Read the source so this effect becomes a consumer of it.
    source.value;
  });

  const secondConsumer = new ReactiveEffect(runtime, 'second-consumer', () => {
    // Read the same source from a second consumer.
    source.value;
  });

  // Establish both dependency relationships.
  firstConsumer.run();
  secondConsumer.run();

  assert(source.node.consumerCount === 2, 'source should have two consumers before clearing');

  assert(
    firstConsumer.dependencyCount === 1,
    'first consumer should have one dependency before clearing',
  );

  assert(
    secondConsumer.dependencyCount === 1,
    'second consumer should have one dependency before clearing',
  );

  // Clear every consumer relationship directly from the source node.
  source.node.clearConsumers();

  assert(source.node.consumerCount === 0, 'source should have no consumers after clearing');

  assert(
    firstConsumer.dependencyCount === 0,
    'first consumer should have no dependencies after clearing',
  );

  assert(
    secondConsumer.dependencyCount === 0,
    'second consumer should have no dependencies after clearing',
  );
}

/**
 * Verifies that clearDependencies() completely isolates a node from the
 * reactive graph in both directions.
 */
function testNodeClearDependencies(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Read the source so the consumer has an incoming dependency.
    source.value;
  });

  // Establish the source -> consumer relationship.
  consumer.run();

  assert(consumer.dependencyCount === 1, 'consumer should have one dependency before clearing');

  assert(source.node.consumerCount === 1, 'source should have one consumer before clearing');

  // Add a reverse relationship so the node under test has both incoming
  // and outgoing graph connections.
  consumer.node.addProducer(consumer.node);

  // Remove the self-relationship again so the test remains focused on
  // legitimate producer/consumer connections.
  consumer.node.removeProducer(consumer.node);

  // Clear every relationship connected to the consumer node.
  consumer.node.clearDependencies();

  assert(consumer.dependencyCount === 0, 'consumer should have no dependencies after clearing');

  assert(
    consumer.node.consumerCount === 0,
    'consumer should have no outgoing consumers after clearing',
  );

  assert(source.node.consumerCount === 0, 'source should have no consumers after clearing');
}

/**
 * Verifies that clearDependencies() removes both incoming and outgoing
 * relationships from a node participating in a dependency chain.
 */
function testNodeClearDependenciesInChain(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const middle = new ReactiveEffect(runtime, 'middle', () => {
    // Reading the source creates the incoming source -> middle relationship.
    source.value;
  });

  const downstream = new ReactiveEffect(runtime, 'downstream', () => {
    // Reading the middle node itself creates a downstream relationship.
    //
    // The node is used directly here because this test is focused on graph
    // connectivity rather than value computation.
    middle.node;
  });

  // Establish the source -> middle relationship.
  middle.run();

  // Establish the middle -> downstream relationship explicitly.
  downstream.node.addProducer(middle.node);

  assert(middle.dependencyCount === 1, 'middle should have one producer before clearing');

  assert(middle.node.consumerCount === 1, 'middle should have one consumer before clearing');

  // Clear both directions from the middle node.
  middle.node.clearDependencies();

  assert(middle.dependencyCount === 0, 'middle should have no producers after clearing');

  assert(middle.node.consumerCount === 0, 'middle should have no consumers after clearing');

  assert(source.node.consumerCount === 0, 'source should no longer have middle as a consumer');

  assert(downstream.dependencyCount === 0, 'downstream should no longer depend on middle');
}

/**
 * Verifies that producer and consumer links remain bidirectionally
 * consistent while a dependency exists and after it is removed.
 */
function testNodeRelationshipConsistency(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Reading the source establishes a source -> consumer relationship.
    source.value;
  });

  assert(
    source.node.hasConsistentRelationships(),
    'source should initially have consistent relationships',
  );

  assert(
    consumer.node.hasConsistentRelationships(),
    'consumer should initially have consistent relationships',
  );

  // Establish the dependency graph.
  consumer.run();

  assert(
    source.node.hasConsistentRelationships(),
    'source relationships should remain consistent after connection',
  );

  assert(
    consumer.node.hasConsistentRelationships(),
    'consumer relationships should remain consistent after connection',
  );

  // Remove the relationship.
  consumer.node.clearDependencies();

  assert(
    source.node.hasConsistentRelationships(),
    'source relationships should remain consistent after cleanup',
  );

  assert(
    consumer.node.hasConsistentRelationships(),
    'consumer relationships should remain consistent after cleanup',
  );
}

/**
 * Verifies that ReactiveRuntime can validate several connected reactive
 * nodes as one graph.
 */
function testRuntimeNodeValidation(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Reading the source establishes the source -> consumer relationship.
    source.value;
  });

  // Establish the dependency graph.
  consumer.run();

  assert(
    runtime.validateNodes([source.node, consumer.node]),
    'runtime should validate a consistent reactive graph',
  );

  // Remove the relationship and verify the disconnected graph remains valid.
  consumer.node.clearDependencies();

  assert(
    runtime.validateNodes([source.node, consumer.node]),
    'runtime should validate the graph after dependency cleanup',
  );
}

/**
 * Verifies that a dependency remains structurally consistent after its
 * producer changes, even though the dependency link becomes stale.
 */
function testStaleDependencyRemainsConsistent(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Reading the source establishes the dependency relationship.
    source.value;
  });

  // Establish the initial dependency and synchronize its observed version.
  consumer.run();

  assert(!consumer.node.hasStaleProducer(), 'consumer should initially have no stale producers');

  assert(
    consumer.node.hasConsistentRelationships(),
    'consumer should initially have consistent relationships',
  );

  // Change the producer without immediately re-running the consumer.
  source.value = 20;

  assert(consumer.node.hasStaleProducer(), 'consumer should detect the changed producer');

  // The link is stale, but the graph relationship itself remains valid.
  assert(
    consumer.node.hasConsistentRelationships(),
    'stale dependency should remain structurally consistent',
  );
}

/**
 * Verifies that structural consistency and dependency freshness are
 * independent properties of a reactive node.
 */
function testNodeFreshProducerState(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Reading the source establishes the dependency relationship.
    source.value;
  });

  // Establish and synchronize the initial dependency state.
  consumer.run();

  assert(consumer.node.hasFreshProducers(), 'consumer producers should initially be fresh');

  assert(
    consumer.node.hasConsistentRelationships(),
    'consumer relationships should initially be consistent',
  );

  // Change the producer without immediately re-running the consumer.
  source.value = 20;

  assert(
    !consumer.node.hasFreshProducers(),
    'consumer producers should become stale after source changes',
  );

  assert(
    consumer.node.hasConsistentRelationships(),
    'stale relationships should remain structurally consistent',
  );

  // Re-run the consumer so its producer versions are synchronized again.
  consumer.run();

  assert(consumer.node.hasFreshProducers(), 'consumer producers should be fresh after re-running');

  assert(
    consumer.node.hasConsistentRelationships(),
    'relationships should remain consistent after re-running',
  );
}

/**
 * Verifies that isHealthy() requires both structural consistency and fresh
 * producer dependencies.
 */
function testNodeHealth(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Reading the source establishes the dependency relationship.
    source.value;
  });

  // Establish the initial dependency graph.
  consumer.run();

  assert(consumer.node.isHealthy(), 'consumer should be healthy after initial execution');

  // Change the source without immediately re-running the consumer.
  source.value = 20;

  assert(
    consumer.node.hasConsistentRelationships(),
    'consumer should remain structurally consistent after source changes',
  );

  assert(
    !consumer.node.hasFreshProducers(),
    'consumer should have a stale producer after source changes',
  );

  assert(!consumer.node.isHealthy(), 'consumer should not be healthy while its producer is stale');

  // Re-run the consumer to synchronize its dependency versions.
  consumer.run();

  assert(consumer.node.isHealthy(), 'consumer should be healthy again after re-running');
}

/**
 * Verifies that ReactiveNode.state exposes a consistent diagnostic snapshot
 * before connection, after connection, and after dependency cleanup.
 */
function testNodeStateSnapshot(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Reading the source establishes the dependency relationship.
    source.value;
  });

  const initialState = consumer.node.state;

  assert(initialState.id === 'consumer', 'initial state should contain the node ID');

  assert(initialState.producerCount === 0, 'consumer should initially have no producers');

  assert(initialState.consumerCount === 0, 'consumer should initially have no consumers');

  assert(initialState.isolated, 'consumer should initially be isolated');

  assert(initialState.consistent, 'initial consumer graph should be consistent');

  // Establish the dependency graph.
  consumer.run();

  const connectedState = consumer.node.state;

  assert(connectedState.producerCount === 1, 'connected consumer should have one producer');

  assert(connectedState.consumerCount === 0, 'connected consumer should still have no consumers');

  assert(!connectedState.isolated, 'connected consumer should not be isolated');

  assert(connectedState.fresh, 'connected consumer should have fresh producers');

  assert(connectedState.consistent, 'connected consumer graph should be consistent');

  assert(connectedState.healthy, 'connected consumer should be healthy');

  // Remove the dependency graph.
  consumer.node.clearDependencies();

  const clearedState = consumer.node.state;

  assert(clearedState.producerCount === 0, 'cleared consumer should have no producers');

  assert(clearedState.consumerCount === 0, 'cleared consumer should have no consumers');

  assert(clearedState.isolated, 'cleared consumer should be isolated');

  assert(clearedState.consistent, 'cleared consumer graph should remain consistent');
}

/**
 * Verifies that ReactiveRuntime.state accurately reports global runtime
 * state before and after scheduled work.
 */
function testRuntimeStateSnapshot(): void {
  const runtime = new ReactiveRuntime();

  const initialState = runtime.state;

  assert(initialState.epoch === 0, 'runtime should initially be at epoch zero');

  assert(
    initialState.activeConsumerId === undefined,
    'runtime should initially have no active consumer',
  );

  assert(initialState.pendingTaskCount === 0, 'runtime should initially have no pending tasks');

  assert(!initialState.hasPendingWork, 'runtime should initially have no pending work');

  assert(!initialState.isFlushing, 'runtime should initially not be flushing');

  // Schedule a simple task so the runtime exposes pending scheduler work.
  runtime.schedule(() => {
    // The task intentionally does nothing; this test only observes scheduler
    // state before and after the task executes.
  });

  const scheduledState = runtime.state;

  assert(scheduledState.pendingTaskCount === 1, 'runtime should report one pending task');

  assert(scheduledState.hasPendingWork, 'runtime should report pending work');

  assert(!scheduledState.isFlushing, 'runtime should not be flushing before flush()');

  // Execute the pending scheduler batch.
  runtime.flush();

  const flushedState = runtime.state;

  assert(flushedState.pendingTaskCount === 0, 'runtime should have no pending tasks after flush');

  assert(!flushedState.hasPendingWork, 'runtime should have no pending work after flush');

  assert(!flushedState.isFlushing, 'runtime should not be flushing after flush completes');
}

/**
 * Verifies that the runtime reports coalesced pending reactive changes.
 */
function testRuntimePendingChangeCount(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  assert(
    runtime.pendingChangeCount === 0,
    'runtime should initially have no pending reactive changes',
  );

  // Queue a deferred change for the source.
  runtime.scheduleChange(source.node);

  assert(runtime.pendingChangeCount === 1, 'runtime should report one pending reactive change');

  assert(runtime.scheduler.pendingCount === 1, 'runtime should have one scheduled change task');

  // Schedule the same node again. The runtime should coalesce it.
  runtime.scheduleChange(source.node);

  assert(
    runtime.pendingChangeCount === 1,
    'repeated changes for the same node should be coalesced',
  );

  assert(
    runtime.scheduler.pendingCount === 1,
    'coalesced changes should not create duplicate scheduler tasks',
  );

  // Execute the deferred change.
  runtime.flush();

  assert(
    runtime.pendingChangeCount === 0,
    'pending reactive changes should be cleared after execution',
  );

  assert(
    runtime.scheduler.pendingCount === 0,
    'scheduler should be empty after executing the change',
  );

  assert(
    source.node.version === 1,
    'source should have exactly one version change after coalescing',
  );
}

/**
 * Verifies that ReactiveRuntime can register, inspect, and unregister
 * reactive nodes without changing their graph relationships.
 */
function testRuntimeNodeRegistry(): void {
  const runtime = new ReactiveRuntime();

  const first = new ReactiveNode('first');
  const second = new ReactiveNode('second');

  assert(runtime.nodeCount === 0, 'runtime should initially have no registered nodes');

  // Register both nodes.
  runtime.registerNode(first);
  runtime.registerNode(second);

  assert(runtime.nodeCount === 2, 'runtime should contain two registered nodes');

  assert(runtime.getNodes().length === 2, 'runtime should return both registered nodes');

  // Registering the same node again must not create a duplicate.
  runtime.registerNode(first);

  assert(runtime.nodeCount === 2, 'registering the same node twice should not duplicate it');

  // Remove one node from the registry.
  runtime.unregisterNode(first);

  assert(runtime.nodeCount === 1, 'runtime should contain one node after unregistering');

  assert(runtime.getNodes()[0] === second, 'remaining registered node should be second');

  // Removing an already-unregistered node should be harmless.
  runtime.unregisterNode(first);

  assert(runtime.nodeCount === 1, 'unregistering an absent node should be harmless');
}

/**
 * Verifies that reactive values and effects automatically register their
 * nodes with the runtime when they are created.
 */
function testAutomaticRuntimeRegistration(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  assert(runtime.nodeCount === 1, 'creating a reactive value should register one node');

  assert(
    runtime.getNodes()[0] === source.node,
    "registered node should be the reactive value's node",
  );

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // The effect body intentionally does nothing; this test focuses on
    // runtime registration rather than dependency tracking.
  });

  assert(runtime.nodeCount === 2, 'creating an effect should register a second node');

  const nodes = runtime.getNodes();

  assert(nodes.includes(source.node), 'runtime should still contain the source node');

  assert(nodes.includes(effect.node), 'runtime should contain the effect node');
}

/**
 * Verifies that disposeNode() removes a node from the runtime registry and
 * disconnects it from the reactive graph.
 */
function testRuntimeDisposeNode(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  const consumer = new ReactiveEffect(runtime, 'consumer', () => {
    // Reading the source establishes the source -> consumer relationship.
    source.value;
  });

  // Establish the dependency graph.
  consumer.run();

  assert(runtime.nodeCount === 2, 'runtime should contain both nodes before disposal');

  assert(source.node.consumerCount === 1, 'source should have one consumer before disposal');

  assert(consumer.node.producerCount === 1, 'consumer should have one dependency before disposal');

  // Dispose the consumer through the runtime.
  runtime.disposeNode(consumer.node);

  assert(runtime.nodeCount === 1, 'runtime should contain only the source after disposal');

  assert(
    !runtime.getNodes().includes(consumer.node),
    'disposed node should no longer be registered',
  );

  assert(consumer.node.isIsolated(), 'disposed node should be isolated');

  assert(source.node.consumerCount === 0, 'source should have no consumers after disposal');
}

/**
 * Verifies that disposing the runtime isolates every registered node,
 * removes every node from the runtime registry, and clears pending work.
 */
function testRuntimeDisposal(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a dependency.
    source.value;

    // Count actual executions.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(executions === 1, 'effect should execute once during initial setup');

  // Queue some work so runtime disposal has pending scheduler state to clear.
  source.value = 20;

  assert(
    runtime.scheduler.pendingCount === 1,
    'runtime should contain pending effect work before disposal',
  );

  assert(runtime.nodeCount === 2, 'runtime should contain both registered nodes before disposal');

  // Dispose the entire runtime.
  runtime.dispose();

  assert(runtime.nodeCount === 0, 'runtime should contain no registered nodes after disposal');

  assert(
    runtime.scheduler.pendingCount === 0,
    'runtime disposal should clear pending scheduler work',
  );

  assert(source.node.isIsolated(), 'source node should be isolated after runtime disposal');

  assert(effect.node.isIsolated(), 'effect node should be isolated after runtime disposal');
}

/**
 * Verifies that disposing the same runtime multiple times is harmless.
 *
 * Runtime disposal should be idempotent because shutdown paths often run
 * through multiple cleanup layers.
 */
function testRuntimeDisposalIsIdempotent(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 10);

  // Register a second node so disposal exercises the runtime registry.
  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the effect establishes a dependency.
    source.value;
  });

  // Establish the dependency graph.
  effect.run();

  // Dispose the runtime once.
  runtime.dispose();

  assert(
    runtime.nodeCount === 0,
    'runtime should have no registered nodes after the first disposal',
  );

  // Dispose the already-empty runtime again.
  runtime.dispose();

  assert(runtime.nodeCount === 0, 'runtime should remain empty after repeated disposal');

  assert(source.node.isIsolated(), 'source should remain isolated after repeated runtime disposal');

  assert(effect.node.isIsolated(), 'effect should remain isolated after repeated runtime disposal');

  assert(
    runtime.scheduler.pendingCount === 0,
    'scheduler should remain empty after repeated runtime disposal',
  );
}

/**
 * Verifies that the runtime exposes its disposal lifecycle state correctly.
 */
function testRuntimeDisposedState(): void {
  const runtime = new ReactiveRuntime();

  assert(!runtime.disposed, 'runtime should initially report that it is not disposed');

  // Dispose the runtime and transition it into its terminal lifecycle state.
  runtime.dispose();

  assert(runtime.disposed, 'runtime should report that it is disposed after dispose()');

  // Repeated disposal must preserve the disposed state.
  runtime.dispose();

  assert(runtime.disposed, 'runtime should remain disposed after repeated dispose()');
}

/**
 * Verifies that a disposed runtime rejects attempts to register new nodes.
 */
function testDisposedRuntimeRejectsRegistration(): void {
  const runtime = new ReactiveRuntime();

  // Dispose the runtime before attempting to register another node.
  runtime.dispose();

  const node = new ReactiveNode('late-node');

  let threw = false;

  try {
    // Registration must fail because the runtime is permanently closed.
    runtime.registerNode(node);
  } catch (error) {
    threw = true;

    // TypeScript treats caught values as unknown, so narrow the value before
    // accessing Error-specific properties.
    if (!(error instanceof Error)) {
      throw new Error('registration failure should throw an Error');
    }

    assert(
      error.message === 'Cannot register a node with a disposed runtime.',
      'registration failure should explain that the runtime is disposed',
    );
  }

  assert(threw, 'disposed runtime should reject new node registration');

  assert(runtime.nodeCount === 0, 'rejected node should not enter the runtime registry');
}

/**
 * Verifies that a disposed runtime rejects new scheduler work.
 */
function testDisposedRuntimeRejectsScheduling(): void {
  const runtime = new ReactiveRuntime();

  // Permanently close the runtime before attempting to schedule work.
  runtime.dispose();

  let threw = false;

  try {
    // Scheduling must fail because the runtime can no longer accept work.
    runtime.schedule(() => {
      // This task must never be accepted by the disposed runtime.
    });
  } catch (error) {
    threw = true;

    // TypeScript treats caught values as unknown, so narrow the value before
    // accessing Error-specific properties.
    if (!(error instanceof Error)) {
      throw new Error('scheduling failure should throw an Error');
    }

    assert(
      error.message === 'Cannot schedule work on a disposed runtime.',
      'scheduling failure should explain that the runtime is disposed',
    );
  }

  assert(threw, 'disposed runtime should reject new scheduled work');

  assert(runtime.scheduler.pendingCount === 0, 'rejected work should not enter the scheduler');
}

/**
 * Verifies that a disposed runtime rejects deferred reactive changes without
 * leaving stale pending-change state behind.
 */
function testDisposedRuntimeRejectsScheduledChange(): void {
  const runtime = new ReactiveRuntime();
  const node = new ReactiveNode('late-change');

  // Permanently close the runtime before attempting to schedule a change.
  runtime.dispose();

  let threw = false;

  try {
    // The disposed runtime must reject the deferred change.
    runtime.scheduleChange(node);
  } catch (error) {
    threw = true;

    // TypeScript treats caught values as unknown, so narrow the value before
    // accessing Error-specific properties.
    if (!(error instanceof Error)) {
      throw new Error('scheduled-change failure should throw an Error');
    }

    assert(
      error.message === 'Cannot schedule work on a disposed runtime.',
      'scheduled-change failure should explain that the runtime is disposed',
    );
  }

  assert(threw, 'disposed runtime should reject scheduled reactive changes');

  assert(
    runtime.pendingChangeCount === 0,
    'rejected change should not remain in the pending-change set',
  );

  assert(runtime.scheduler.pendingCount === 0, 'rejected change should not enter the scheduler');
}

/**
 * Verifies that a disposed runtime rejects direct reactive state changes
 * without mutating the supplied node or advancing the runtime epoch.
 */
function testDisposedRuntimeRejectsMarkChanged(): void {
  const runtime = new ReactiveRuntime();
  const node = new ReactiveNode('late-change');

  // Capture the state before the runtime is disposed.
  const initialVersion = node.version;
  const initialEpoch = runtime.epoch.value;

  // Permanently close the runtime.
  runtime.dispose();

  let threw = false;

  try {
    // The disposed runtime must reject reactive state changes.
    runtime.markChanged(node);
  } catch (error) {
    threw = true;

    // TypeScript treats caught values as unknown, so narrow the value before
    // accessing Error-specific properties.
    if (!(error instanceof Error)) {
      throw new Error('markChanged failure should throw an Error');
    }

    assert(
      error.message === 'Cannot mark a node as changed on a disposed runtime.',
      'markChanged failure should explain that the runtime is disposed',
    );
  }

  assert(threw, 'disposed runtime should reject markChanged()');

  assert(
    node.version === initialVersion,
    'rejected markChanged() should not mutate the node version',
  );

  assert(
    runtime.epoch.value === initialEpoch,
    'rejected markChanged() should not advance the runtime epoch',
  );
}

/**
 * Verifies the complete runtime lifecycle from active operation through
 * permanent disposal.
 *
 * This test intentionally combines the major lifecycle guarantees into one
 * end-to-end scenario.
 */
function testCompleteRuntimeLifecycle(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Establish a real dependency between the effect and source.
    source.value;

    // Count actual effect executions.
    executions++;
  });

  // The runtime should begin in an active state.
  assert(!runtime.disposed, 'runtime should initially be active');

  // Both reactive nodes should be registered automatically.
  assert(runtime.nodeCount === 2, 'runtime should register source and effect nodes');

  // Establish the dependency graph.
  effect.run();

  assert(executions === 1, 'effect should execute during initial setup');

  assert(
    effect.node.hasProducer(source.node),
    'effect should depend on source after initial execution',
  );

  // Trigger a normal reactive change.
  source.value = 20;

  assert(
    runtime.scheduler.pendingCount === 1,
    'source change should schedule the dependent effect',
  );

  // Flush the pending effect.
  runtime.flush();

  assert(executions === 2, 'effect should execute after the scheduled change is flushed');

  // Permanently dispose the entire runtime.
  runtime.dispose();

  assert(runtime.disposed, 'runtime should be disposed after dispose()');

  assert(runtime.nodeCount === 0, 'runtime registry should be empty after disposal');

  assert(runtime.scheduler.pendingCount === 0, 'scheduler should be empty after disposal');

  assert(
    runtime.pendingChangeCount === 0,
    'pending reactive changes should be empty after disposal',
  );

  assert(source.node.isIsolated(), 'source should be isolated after runtime disposal');

  assert(effect.node.isIsolated(), 'effect should be isolated after runtime disposal');

  // Repeated disposal must remain harmless.
  runtime.dispose();

  assert(runtime.disposed, 'runtime should remain disposed after repeated disposal');

  assert(runtime.nodeCount === 0, 'runtime registry should remain empty after repeated disposal');
}

// Run the effect test suite.
testEffectExecution();
testEffectInvalidation();
testEffectScheduling();
testEffectSchedulingIsDeferred();
testManualRunCancelsScheduledState();
testEffectDestruction();
testEffectDestructionIsIdempotent();
testDestroyScheduledEffect();
testDestroyedEffectDependencyState();
testDestroyedEffectCleansAllDependencies();
testDestroyedEffectIgnoresFormerDependencies();
testDestroyedEffectLifecycle();
testEffectDispose();
testEffectDependencyCount();
testEffectDependencyIds();
testEffectLifecycleState();
testDestroyedEffectShouldRun();
testDestroyedEffectIsDirty();
testEffectStateSnapshot();
testDestroyedEffectGraphIsolation();
testDisposeCleansAllDependencies();
testNodeClearProducers();
testNodeClearConsumers();
testNodeClearProducers();
testNodeClearDependencies();
testNodeClearDependenciesInChain();
testNodeRelationshipConsistency();
testRuntimeNodeValidation();
testStaleDependencyRemainsConsistent();
testNodeFreshProducerState();
testNodeHealth();
testNodeStateSnapshot();
testRuntimeStateSnapshot();
testRuntimePendingChangeCount();
testRuntimeNodeRegistry();
testAutomaticRuntimeRegistration();
testRuntimeDisposeNode();
testRuntimeDisposal();
testRuntimeDisposalIsIdempotent();
testRuntimeDisposedState();
testDisposedRuntimeRejectsRegistration();
testDisposedRuntimeRejectsScheduling();
testDisposedRuntimeRejectsScheduledChange();
testDisposedRuntimeRejectsMarkChanged();
testCompleteRuntimeLifecycle();
