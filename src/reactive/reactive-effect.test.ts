import {ReactiveRuntime} from './reactive-runtime.js';
import {ReactiveValue} from './reactive-value.js';
import {assert} from '../test/assert.js';
import {EffectState, ReactiveEffect} from './reactive-effect.js';
import {ReactiveNode} from './reactive-node.js';
import {ManualEffectScheduler} from './manual-effect-scheduler.js';
import {
  ReactiveEffectScheduleHandle,
  ReactiveEffectScheduler,
} from './reactive-scheduler-options.js';

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
 * Verifies that an explicit effect run cancels its pending scheduled task.
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

  assert(
    runtime.scheduler.pendingCount === 1,
    'runtime scheduler should contain one pending effect task',
  );

  // Run the effect explicitly before the scheduler flushes.
  effect.run();

  assert(executions === 2, 'explicit run should execute the effect immediately');

  assert(!effect.isScheduled, 'explicit run should clear the effect scheduled state');

  assert(!effect.isDirty, 'explicit run should leave the effect clean');

  assert(
    runtime.scheduler.pendingCount === 0,
    'explicit run should cancel the pending scheduler task',
  );

  // Flushing should have nothing left to execute.
  runtime.flush();

  assert(executions === 2, 'cancelled scheduled work should not execute the effect again');
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
 * Verifies that destroying an effect cancels its already scheduled runtime
 * scheduler task.
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

  assert(
    runtime.scheduler.pendingCount === 1,
    'runtime scheduler should contain one pending effect task',
  );

  // Destroy the effect before its scheduled task executes.
  effect.destroy();

  assert(effect.destroyed, 'effect should report itself as destroyed');

  assert(!effect.isScheduled, 'destroyed effect should no longer report itself as scheduled');

  assert(
    runtime.scheduler.pendingCount === 0,
    'destroying the effect should cancel its pending runtime scheduler task',
  );

  // The cancelled task should no longer execute.
  runtime.flush();

  assert(
    executions === 1,
    'destroyed scheduled effect should not execute after its scheduled task is cancelled',
  );

  assert(!effect.isScheduled, 'effect should remain unscheduled after destruction');
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

  runtime.batch(() => {
    assert(runtime.state.isBatching, 'runtime state should report active batching');

    assert(runtime.state.batchDepth === 1, 'runtime state should report the current batch depth');

    assert(
      runtime.state.batchedChangeCount === 0,
      'runtime state should initially report no batched changes',
    );
  });

  const source = new ReactiveValue(runtime, 'state-source', 0);

  runtime.batch(() => {
    source.value = 1;

    assert(
      runtime.state.batchedChangeCount === 1,
      'runtime state should report one batched change',
    );
  });

  assert(
    runtime.state.batchedChangeCount === 0,
    'runtime state should clear batched changes after the batch',
  );
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

/**
 * Verifies that effect scheduling is deferred during a batch and that
 * multiple invalidations of the same effect produce only one scheduled task.
 */
function testBatchedEffectScheduling(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 0);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Establish the dependency between the effect and source.
    source.value;

    // Count actual executions.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  assert(executions === 1, 'effect should execute once during initial setup');

  runtime.batch(() => {
    // Multiple changes happen inside one logical batch.
    source.value = 1;
    source.value = 2;
    source.value = 3;

    assert(effect.isDirty, 'effect should be dirty inside the batch');

    assert(!effect.isScheduled, 'effect should not be scheduled while the batch is active');

    assert(
      runtime.scheduler.pendingCount === 0,
      'scheduler should remain empty while the batch is active',
    );
  });

  assert(effect.isScheduled, 'effect should be scheduled when the outer batch completes');

  assert(
    runtime.scheduler.pendingCount === 1,
    'multiple batched invalidations should create one scheduled task',
  );

  // Execute the deferred effect.
  runtime.flush();

  assert(executions === 2, 'effect should execute once after the batched changes are flushed');

  assert(!effect.isDirty, 'effect should be clean after the scheduled execution');

  assert(!effect.isScheduled, 'effect should no longer be scheduled after execution');
}

/**
 * Verifies that nested batches share one outer scheduling boundary.
 *
 * The effect should not be scheduled until the outermost batch completes,
 * even when changes occur across multiple nested batch scopes.
 */
function testNestedBatchScheduling(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 0);

  let executions = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Establish the dependency between the effect and source.
    source.value;

    // Count actual executions.
    executions++;
  });

  // Establish the initial dependency graph.
  effect.run();

  runtime.batch(() => {
    // First change occurs in the outer batch.
    source.value = 1;

    runtime.batch(() => {
      // Additional changes occur in a nested batch.
      source.value = 2;
      source.value = 3;

      assert(runtime.batchDepth === 2, 'nested batch should have depth two');

      assert(
        runtime.scheduler.pendingCount === 0,
        'scheduler should remain empty inside nested batch',
      );
    });

    assert(
      runtime.batchDepth === 1,
      'outer batch should remain active after nested batch completes',
    );

    assert(
      runtime.scheduler.pendingCount === 0,
      'scheduler should remain empty until the outer batch completes',
    );
  });

  assert(runtime.batchDepth === 0, 'all batch scopes should be closed');

  assert(
    runtime.scheduler.pendingCount === 1,
    'outer batch completion should create one scheduled effect',
  );

  runtime.flush();

  assert(executions === 2, 'nested batched changes should produce one effect execution');
}

/**
 * Verifies that a failed batch does not leave deferred work behind.
 */
function testFailedBatchClearsDeferredWork(): void {
  const runtime = new ReactiveRuntime();

  let deferredExecutions = 0;

  let threw = false;

  try {
    runtime.batch(() => {
      // Queue work that should normally execute when the batch completes.
      runtime.deferUntilBatchComplete(() => {
        deferredExecutions++;
      });

      // Force the batch callback to fail.
      throw new Error('batch failed');
    });
  } catch (error) {
    threw = true;

    // Narrow the caught value before inspecting it.
    if (!(error instanceof Error)) {
      throw new Error('batch failure should throw an Error');
    }

    assert(error.message === 'batch failed', 'batch should propagate the callback error');
  }

  assert(threw, 'failed batch should propagate the callback error');

  assert(deferredExecutions === 1, 'deferred work should still execute when the batch unwinds');

  assert(runtime.batchDepth === 0, 'failed batch should restore zero batch depth');

  assert(!runtime.isBatching, 'failed batch should leave the runtime outside batching mode');
}

/**
 * Verifies that an effect error propagates to the caller.
 */
function testEffectErrorPropagates(): void {
  const runtime = new ReactiveRuntime();

  let shouldThrow = true;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    if (shouldThrow) {
      throw new Error('effect failure');
    }
  });

  let threw = false;

  try {
    effect.run();
  } catch (error) {
    threw = error instanceof Error && error.message === 'effect failure';
  }

  assert(threw, 'effect errors should propagate to the caller');
}

/**
 * Verifies that an effect can recover and run successfully after a failed
 * execution.
 */
function testEffectRecoversAfterError(): void {
  const runtime = new ReactiveRuntime();

  let shouldThrow = true;
  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    runs++;

    if (shouldThrow) {
      throw new Error('effect failure');
    }
  });

  // The first execution is expected to fail.
  try {
    effect.run();
  } catch {
    // The error is expected for this test.
  }

  assert(runs === 1, 'effect should have attempted its first execution');

  // Allow the effect to execute successfully.
  shouldThrow = false;

  effect.run();

  assert(runs === 2, 'effect should recover after a failed execution');
}

/**
 * Verifies that dependency tracking remains functional after an effect
 * throws during execution.
 */
function testEffectDependencyTrackingAfterError(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let shouldThrow = true;
  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Reading the source establishes the dependency even when the effect
    // subsequently throws.
    source.value;

    runs++;

    if (shouldThrow) {
      throw new Error('effect failure');
    }
  });

  // Initial execution establishes the dependency but throws.
  try {
    effect.run();
  } catch {
    // The error is expected.
  }

  assert(
    effect.node.hasProducer(source.node),
    'effect should retain its source dependency after an error',
  );

  // Allow future executions to succeed.
  shouldThrow = false;

  source.value = 2;

  runtime.flush();

  assert(runs === 2, 'effect should rerun after its dependency changes');
}

/**
 * Verifies that dynamic effect dependencies continue to work after a
 * failed execution.
 */
function testEffectDynamicDependenciesAfterError(): void {
  const runtime = new ReactiveRuntime();

  const first = new ReactiveValue(runtime, 'first', 1);
  const second = new ReactiveValue(runtime, 'second', 2);

  let useFirst = true;
  let shouldThrow = true;
  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Select the dependency dynamically for this execution.
    if (useFirst) {
      first.value;
    } else {
      second.value;
    }

    runs++;

    // The first execution intentionally fails.
    if (shouldThrow) {
      throw new Error('effect failure');
    }
  });

  // The initial execution tracks `first` before throwing.
  try {
    effect.run();
  } catch {
    // The error is expected.
  }

  assert(
    effect.node.hasProducer(first.node),
    'effect should track the first dependency after an error',
  );

  // Switch to the second dependency and allow the next execution to succeed.
  useFirst = false;
  shouldThrow = false;

  effect.run();

  assert(
    effect.node.hasProducer(second.node),
    'effect should track the second dependency after recovery',
  );

  assert(
    !effect.node.hasProducer(first.node),
    'effect should remove the old dynamic dependency after recovery',
  );

  const runsAfterRecovery = runs;

  // Changing the old dependency must no longer rerun the effect.
  first.value = 10;
  runtime.flush();

  assert(runs === runsAfterRecovery, 'removed dependency should no longer trigger the effect');

  // Changing the current dependency must rerun the effect.
  second.value = 20;
  runtime.flush();

  assert(runs === runsAfterRecovery + 1, 'current dynamic dependency should trigger the effect');
}

/**
 * Verifies that destroying an effect prevents future manual execution.
 */
function testDestroyedEffectCannotRun(): void {
  const runtime = new ReactiveRuntime();

  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    runs++;
  });

  // Establish the initial execution.
  effect.run();

  assert(runs === 1, 'effect should run before destruction');

  effect.destroy();

  // A destroyed effect should ignore future manual runs.
  effect.run();

  assert(runs === 1, 'destroyed effect should not run again');

  assert(effect.destroyed, 'effect should report itself as destroyed');
}

/**
 * Verifies that destroying an effect removes its dependency relationships
 * and prevents future source changes from scheduling it.
 */
function testDestroyedEffectStopsReacting(): void {
  const runtime = new ReactiveRuntime();

  const source = new ReactiveValue(runtime, 'source', 1);

  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Establish the dependency.
    source.value;
    runs++;
  });

  effect.run();

  assert(runs === 1, 'effect should run once initially');

  assert(effect.node.hasProducer(source.node), 'effect should initially depend on the source');

  effect.destroy();

  assert(effect.node.isIsolated(), 'destroyed effect should be isolated from the graph');

  source.value = 2;

  runtime.flush();

  assert(runs === 1, 'destroyed effect should not react to future source changes');

  assert(
    !effect.node.hasProducer(source.node),
    'destroyed effect should no longer have the source as a producer',
  );
}

/**
 * Verifies that destroying an effect is idempotent.
 */
function testEffectDestroyIsIdempotent(): void {
  const runtime = new ReactiveRuntime();

  let runs = 0;

  const effect = new ReactiveEffect(runtime, 'effect', () => {
    runs++;
  });

  effect.run();

  effect.destroy();
  effect.destroy();

  assert(runs === 1, 'destroying an effect repeatedly should not execute it');

  assert(effect.destroyed, 'effect should remain destroyed after repeated destruction');
}

/**
 * Verifies that destroying an effect removes its dependency relationships.
 */
function testDestroyedEffectDisconnectsDependencies(): void {
  // Create a fresh runtime for the lifecycle test.
  const runtime = new ReactiveRuntime();

  // Create a source value.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create an effect that depends on the source.
  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Read the source so the dependency relationship is established.
    void source.value;
  });

  // Run the effect to establish its dependency.
  effect.run();

  // Confirm that the source has the effect as a consumer.
  assert(
    source.node.consumerCount === 1,
    'Source should have one consumer before effect destruction.',
  );

  // Destroy the effect.
  effect.destroy();

  // The source should no longer retain the destroyed effect.
  assert(
    source.node.consumerCount === 0,
    'Source should have no consumers after effect destruction.',
  );

  // The destroyed effect should have no producers.
  assert(effect.node.producerCount === 0, 'Destroyed effect should have no producers.');
}

/**
 * Verifies that destroying an effect cancels an already scheduled execution.
 */
function testDestroyedEffectCancelsScheduledWork(): void {
  // Create a fresh runtime for the scheduling test.
  const runtime = new ReactiveRuntime();

  // Create a source value.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Count how many times the effect executes.
  let runCount = 0;

  // Create an effect that depends on the source.
  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Record each execution.
    runCount++;

    // Establish the source dependency.
    void source.value;
  });

  // Establish the initial dependency.
  effect.run();

  // Changing the source should schedule the effect.
  source.value = 2;

  // Confirm that work is waiting in the scheduler.
  assert(runtime.hasPendingWork, 'Effect should have pending scheduled work.');

  // Destroy the effect before the scheduler flushes.
  effect.destroy();

  // Flush the runtime after destruction.
  runtime.flush();

  // The scheduled effect must not execute.
  assert(runCount === 1, 'Destroyed effect should not execute pending scheduled work.');
}
/**
 * Verifies that multiple source changes inside one batch coalesce into
 * a single scheduled effect execution.
 */
function testEffectRunsOnceForBatchedChanges(): void {
  // Create a fresh runtime for the batching test.
  const runtime = new ReactiveRuntime();

  // Create the source value observed by the effect.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Record every value observed by the effect.
  const observedValues: number[] = [];

  // Create an effect that reads the source.
  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Record the current source value whenever the effect runs.
    observedValues.push(source.value);
  });

  // Establish the initial dependency and initial execution.
  effect.run();

  // Change the source multiple times inside one batch.
  runtime.batch(() => {
    source.value = 2;
    source.value = 3;
    source.value = 4;
  });

  // The batch has now completed, so the effect should be scheduled.
  assert(runtime.hasPendingWork, 'Effect should be scheduled after the batch completes.');

  // Execute the scheduled effect.
  runtime.flush();

  // The effect should have executed once initially and once after the batch.
  assert(observedValues.length === 2, 'Effect should execute only once for batched changes.');

  // The batched execution must observe the final source value.
  assert(observedValues[1] === 4, 'Effect should observe the final value from the batch.');
}

/**
 * Verifies that nested batches defer effect execution until the outermost
 * batch completes.
 */
function testNestedBatchesDeferEffectUntilOutermostBatch(): void {
  // Create a fresh runtime for the nested batching test.
  const runtime = new ReactiveRuntime();

  // Create the source value observed by the effect.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Count effect executions.
  let runCount = 0;

  // Create an effect that depends on the source.
  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Record each execution.
    runCount++;

    // Establish the source dependency.
    void source.value;
  });

  // Establish the initial dependency.
  effect.run();

  // Enter the outer batch.
  runtime.batch(() => {
    // Change the source inside the outer batch.
    source.value = 2;

    // Enter a nested batch.
    runtime.batch(() => {
      // Change the source again inside the nested batch.
      source.value = 3;

      // The nested batch must still be active here.
      assert(runtime.batchDepth === 2, 'Nested batch should increase the batch depth.');

      // The effect must not be scheduled yet.
      assert(!runtime.hasPendingWork, 'Effect should remain deferred inside nested batches.');
    });

    // The outer batch is still active after the nested batch completes.
    assert(
      runtime.batchDepth === 1,
      'Outer batch should remain active after nested batch completes.',
    );

    // The effect must still not be scheduled.
    assert(
      !runtime.hasPendingWork,
      'Effect should remain deferred until the outermost batch completes.',
    );
  });

  // The outermost batch has completed, so the effect should now be scheduled.
  assert(runtime.hasPendingWork, 'Effect should be scheduled after the outermost batch completes.');

  // Execute the deferred effect.
  runtime.flush();

  // The effect should run once for the complete nested batch.
  assert(runCount === 2, 'Effect should run once after the nested batch completes.');
}

/**
 * Verifies that a failed batch restores batching state and does not leave
 * the runtime permanently stuck inside a batch.
 */
function testFailedBatchRestoresRuntimeState(): void {
  // Create a fresh runtime for the error-recovery test.
  const runtime = new ReactiveRuntime();

  // Track the error thrown by the batch callback.
  let caughtError: unknown;

  try {
    // Execute a batch that intentionally fails.
    runtime.batch(() => {
      // Confirm that batching is active while the callback executes.
      assert(runtime.isBatching, 'Runtime should be batching inside the batch callback.');

      // Throw an intentional error to exercise the finally path.
      throw new Error('batch failure');
    });
  } catch (error) {
    // Capture the error so the test can verify it was propagated.
    caughtError = error;
  }

  // The original batch error must be propagated to the caller.
  assert(
    caughtError instanceof Error && caughtError.message === 'batch failure',
    'Batch should propagate the original callback error.',
  );

  // The runtime must leave batching mode after the failed batch.
  assert(!runtime.isBatching, 'Runtime should not remain in batching mode after an error.');

  // The batch nesting depth must be fully restored.
  assert(runtime.batchDepth === 0, 'Batch depth should return to zero after an error.');

  // No deferred batch tasks should remain stranded.
  assert(
    runtime.deferredBatchTaskCount === 0,
    'Failed batch should not leave deferred tasks behind.',
  );
}

/**
 * Verifies that the runtime can process reactive work after a failed batch.
 */
function testRuntimeRemainsUsableAfterFailedBatch(): void {
  // Create a fresh runtime for the recovery test.
  const runtime = new ReactiveRuntime();

  // Create the source value observed by the effect.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Count effect executions.
  let runCount = 0;

  // Create an effect that depends on the source.
  const effect = new ReactiveEffect(runtime, 'effect', () => {
    // Record each execution.
    runCount++;

    // Establish the source dependency.
    void source.value;
  });

  // Establish the initial dependency.
  effect.run();

  try {
    // Execute a batch that intentionally fails.
    runtime.batch(() => {
      // Change the source while batching.
      source.value = 2;

      // Abort the batch with an intentional error.
      throw new Error('batch failure');
    });
  } catch {
    // Ignore the intentional error so the recovery behavior can be tested.
  }

  // The failed batch should have deferred the effect rather than losing it.
  assert(runtime.hasPendingWork, 'Failed batch should preserve pending reactive work.');

  // Execute the pending effect.
  runtime.flush();

  // The effect should have run once initially and once for the change.
  assert(runCount === 2, 'Runtime should remain usable after a failed batch.');
}

/**
 * Verifies that a custom scheduler receives effect work instead of the
 * runtime scheduler.
 */
function testCustomSchedulerReceivesEffectWork(): void {
  // Create a fresh runtime for the scheduler test.
  const runtime = new ReactiveRuntime();

  // Create the reactive source.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Store scheduled tasks instead of executing them immediately.
  const scheduledTasks: Array<() => void> = [];

  // Create a scheduler that captures effect work.
  const scheduler: ReactiveEffectScheduler = {
    schedule(task): ReactiveEffectScheduleHandle {
      // Keep the task for explicit execution by the test.
      scheduledTasks.push(task);

      // Return a no-op cancellation handle because this test scheduler does not
      // currently model task removal.
      return {
        cancel(): void {
          // Nothing to cancel in this test scheduler.
        },
      };
    },
  };

  // Count effect executions.
  let runCount = 0;

  // Create the effect using the custom scheduler.
  const effect = new ReactiveEffect(
    runtime,
    'effect',
    () => {
      // Record each execution.
      runCount++;

      // Establish the dependency.
      void source.value;
    },
    scheduler,
  );

  // Run once to establish the dependency.
  effect.run();

  // Change the dependency.
  source.value = 2;

  // The custom scheduler should receive the work.
  assert(scheduledTasks.length === 1, 'Custom scheduler should receive one effect task.');

  // The runtime scheduler should remain unused.
  assert(!runtime.hasPendingWork, 'Runtime scheduler should not receive custom-scheduled work.');

  // The effect should not have executed yet.
  assert(runCount === 1, 'Custom-scheduled effect should not execute immediately.');

  // Execute the captured task.
  scheduledTasks.shift()?.();

  // The effect should now have executed once more.
  assert(runCount === 2, 'Executing the scheduled task should run the effect.');

  // Clean up the effect.
  effect.destroy();
}

/**
 * Verifies that custom scheduling still coalesces repeated invalidations.
 */
function testCustomSchedulerCoalescesInvalidations(): void {
  // Create a fresh runtime.
  const runtime = new ReactiveRuntime();

  // Create the reactive source.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Capture scheduled tasks.
  const scheduledTasks: Array<() => void> = [];

  // Create the custom scheduler.
  const scheduler: ReactiveEffectScheduler = {
    schedule(task): ReactiveEffectScheduleHandle {
      // Keep the task for explicit execution by the test.
      scheduledTasks.push(task);

      // Return a no-op cancellation handle because this test scheduler does not
      // currently model task removal.
      return {
        cancel(): void {
          // Nothing to cancel in this test scheduler.
        },
      };
    },
  };

  // Create the effect.
  const effect = new ReactiveEffect(
    runtime,
    'effect',
    () => {
      // Establish the dependency.
      void source.value;
    },
    scheduler,
  );

  // Establish the initial dependency.
  effect.run();

  // Trigger multiple changes before executing the scheduled task.
  source.value = 2;
  source.value = 3;
  source.value = 4;

  // Only one task should have been scheduled.
  assert(
    scheduledTasks.length === 1,
    'Repeated invalidations should coalesce into one custom-scheduled task.',
  );

  // Execute the single task.
  scheduledTasks.shift()?.();

  // Clean up the effect.
  effect.destroy();
}

/**
 * Verifies that the manual scheduler stores tasks until explicitly flushed.
 */
function testManualSchedulerDefersTasks(): void {
  // Create the scheduler under test.
  const scheduler = new ManualEffectScheduler();

  // Track how many tasks have executed.
  let runCount = 0;

  // Schedule one task.
  scheduler.schedule(() => {
    // Record the execution.
    runCount++;
  });

  // The task must remain pending before flushing.
  assert(scheduler.hasPendingWork, 'Manual scheduler should report pending work.');

  // Exactly one task should be pending.
  assert(scheduler.pendingCount === 1, 'Manual scheduler should contain one pending task.');

  // The task must not have executed yet.
  assert(runCount === 0, 'Manual scheduler should defer task execution.');

  // Execute the pending task.
  scheduler.flush();

  // The task should now have executed.
  assert(runCount === 1, 'Manual scheduler should execute tasks during flush.');

  // The queue should now be empty.
  assert(!scheduler.hasPendingWork, 'Manual scheduler should be empty after flush.');
}

/**
 * Verifies that tasks scheduled during a flush wait for the next flush.
 */
function testManualSchedulerDefersNewTasksUntilNextFlush(): void {
  // Create the scheduler under test.
  const scheduler = new ManualEffectScheduler();

  // Record execution order.
  const execution: string[] = [];

  // Schedule the initial task.
  scheduler.schedule(() => {
    // Record the first task.
    execution.push('first');

    // Schedule another task while the scheduler is flushing.
    scheduler.schedule(() => {
      // Record the deferred task.
      execution.push('second');
    });
  });

  // Flush the initial batch.
  scheduler.flush();

  // Only the original task should have executed.
  assert(
    execution.join(',') === 'first',
    'Tasks scheduled during flush should wait for the next flush.',
  );

  // The newly scheduled task should remain pending.
  assert(scheduler.pendingCount === 1, 'Task scheduled during flush should remain pending.');

  // Flush the next batch.
  scheduler.flush();

  // The deferred task should now execute.
  assert(
    execution.join(',') === 'first,second',
    'Deferred task should execute during the next flush.',
  );
}

/**
 * Verifies that clear removes pending tasks without executing them.
 */
function testManualSchedulerClear(): void {
  // Create the scheduler under test.
  const scheduler = new ManualEffectScheduler();

  // Track task execution.
  let runCount = 0;

  // Schedule two tasks.
  scheduler.schedule(() => {
    runCount++;
  });

  scheduler.schedule(() => {
    runCount++;
  });

  // Remove the pending tasks.
  scheduler.clear();

  // The scheduler should now be empty.
  assert(scheduler.pendingCount === 0, 'Clear should remove all pending tasks.');

  // Flushing should not execute the cleared tasks.
  scheduler.flush();

  assert(runCount === 0, 'Cleared tasks should not execute.');
}

/**
 * Verifies that a reactive effect can use the manual scheduler to defer
 * execution until the scheduler is explicitly flushed.
 */
function testEffectWithManualScheduler(): void {
  // Create a fresh runtime.
  const runtime = new ReactiveRuntime();

  // Create the reactive source.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create a manually controlled scheduler.
  const scheduler = new ManualEffectScheduler();

  // Record every value observed by the effect.
  const observedValues: number[] = [];

  // Create the effect with the custom scheduler.
  const effect = new ReactiveEffect(
    runtime,
    'effect',
    () => {
      // Record the current source value.
      observedValues.push(source.value);
    },
    scheduler,
  );

  // Establish the initial dependency and execution.
  effect.run();

  // The initial execution should have observed the initial value.
  assert(observedValues.join(',') === '1', 'Effect should initially observe the source value.');

  // Change the source.
  source.value = 2;

  // The custom scheduler should now contain the effect task.
  assert(scheduler.pendingCount === 1, 'Source change should schedule one task.');

  // The effect should still have its old observed value.
  assert(observedValues.join(',') === '1', 'Custom scheduler should defer effect execution.');

  // Flush the custom scheduler.
  scheduler.flush();

  // The effect should now observe the new source value.
  assert(
    observedValues.join(',') === '1,2',
    'Flushing the custom scheduler should execute the effect.',
  );

  // The runtime scheduler should not contain this effect task.
  assert(!runtime.hasPendingWork, 'Custom scheduler should bypass the runtime scheduler.');

  // Clean up the effect.
  effect.destroy();
}

/**
 * Verifies that a scheduler failure propagates and does not permanently
 * mark the effect as scheduled.
 */
function testCustomSchedulerFailureRestoresSchedulingState(): void {
  // Create a fresh runtime.
  const runtime = new ReactiveRuntime();

  // Create a scheduler that deliberately rejects scheduling.
  const scheduler: ReactiveEffectScheduler = {
    schedule(): ReactiveEffectScheduleHandle {
      // Simulate a scheduler failure.
      throw new Error('scheduler failure');
    },
  };

  // Create the effect using the failing scheduler.
  const effect = new ReactiveEffect(
    runtime,
    'effect',
    () => {
      // The effect body is not expected to execute in this test.
    },
    scheduler,
  );

  // Attempt to schedule the effect directly.
  let errorMessage = '';

  try {
    // The scheduler failure should propagate through schedule().
    effect.schedule();
  } catch (error) {
    // Capture the scheduler error.
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  // Confirm that the scheduler error propagated.
  assert(
    errorMessage === 'scheduler failure',
    'Custom scheduler errors should propagate to the caller.',
  );

  // Retry scheduling to verify that the failed attempt did not leave the
  // effect permanently marked as scheduled.
  errorMessage = '';

  try {
    // The scheduler should be invoked again.
    effect.schedule();
  } catch (error) {
    // Capture the second scheduler failure.
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  // Confirm that the effect remained schedulable after the first failure.
  assert(
    errorMessage === 'scheduler failure',
    'Effect should remain schedulable after a scheduler failure.',
  );

  // Clean up the effect.
  effect.destroy();
}

/**
 * Verifies that destroying an effect prevents already scheduled custom
 * scheduler work from executing the effect.
 */
function testDestroyedEffectCancelsCustomScheduledWork(): void {
  // Create a fresh runtime.
  const runtime = new ReactiveRuntime();

  // Create the reactive source.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create a manual scheduler so execution can be controlled explicitly.
  const scheduler = new ManualEffectScheduler();

  // Count effect executions.
  let runCount = 0;

  // Create the effect using the manual scheduler.
  const effect = new ReactiveEffect(
    runtime,
    'effect',
    () => {
      // Record every execution.
      runCount++;

      // Establish the dependency.
      void source.value;
    },
    scheduler,
  );

  // Establish the initial dependency.
  effect.run();

  // Change the source and schedule the effect.
  source.value = 2;

  // Confirm that the custom scheduler received the task.
  assert(scheduler.pendingCount === 1, 'Custom scheduler should contain one pending effect task.');

  // Destroy the effect before the scheduler executes its task.
  effect.destroy();

  // Execute the previously queued task.
  scheduler.flush();

  // The destroyed effect must not execute.
  assert(runCount === 1, 'Destroyed effect should not execute queued custom scheduler work.');

  // The scheduler itself should now be empty.
  assert(!scheduler.hasPendingWork, 'Manual scheduler should be empty after flushing.');
}

/**
 * Verifies that a custom-scheduled effect is deferred until the outermost
 * runtime batch completes and is still coalesced into one scheduled task.
 */
function testBatchedChangesWithCustomScheduler(): void {
  // Create a fresh runtime.
  const runtime = new ReactiveRuntime();

  // Create the reactive source.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create a manually controlled scheduler.
  const scheduler = new ManualEffectScheduler();

  // Record the values observed by the effect.
  const observedValues: number[] = [];

  // Create the effect using the custom scheduler.
  const effect = new ReactiveEffect(
    runtime,
    'effect',
    () => {
      // Record the current source value.
      observedValues.push(source.value);
    },
    scheduler,
  );

  // Establish the initial dependency.
  effect.run();

  // Perform multiple changes inside one batch.
  runtime.batch(() => {
    // First change.
    source.value = 2;

    // Second change.
    source.value = 3;

    // Third change.
    source.value = 4;

    // The custom scheduler must not receive work while batching.
    assert(
      scheduler.pendingCount === 0,
      'Custom scheduler should not receive effect work during a batch.',
    );
  });

  // The outermost batch should now have deferred one effect task.
  assert(scheduler.pendingCount === 1, 'Batch completion should schedule one custom effect task.');

  // The effect should still have observed only the initial value.
  assert(
    observedValues.join(',') === '1',
    'Effect should not run before the custom scheduler is flushed.',
  );

  // Execute the deferred effect.
  scheduler.flush();

  // The effect should see only the final value from the batch.
  assert(
    observedValues.join(',') === '1,4',
    'Batched custom-scheduled effect should observe the final value once.',
  );

  // The runtime scheduler should remain unused.
  assert(
    !runtime.hasPendingWork,
    'Runtime scheduler should remain empty when using a custom scheduler.',
  );

  // Clean up the effect.
  effect.destroy();
}

/**
 * Verifies that cancelling a manual scheduler task prevents it from
 * executing.
 */
function testManualSchedulerCancelsTask(): void {
  // Create the scheduler under test.
  const scheduler = new ManualEffectScheduler();

  // Track whether the task executes.
  let runCount = 0;

  // Schedule a task and retain its cancellation handle.
  const handle = scheduler.schedule(() => {
    // Record execution.
    runCount++;
  });

  // The task should initially be pending.
  assert(scheduler.pendingCount === 1, 'Scheduled task should initially be pending.');

  // Cancel the pending task.
  handle.cancel();

  // The task should have been removed.
  assert(scheduler.pendingCount === 0, 'Cancelled task should be removed from the scheduler.');

  // Flushing should not execute the cancelled task.
  scheduler.flush();

  // Confirm that the task never ran.
  assert(runCount === 0, 'Cancelled task should not execute.');

  // Cancelling again should be harmless.
  handle.cancel();

  // The scheduler should remain empty.
  assert(!scheduler.hasPendingWork, 'Repeated cancellation should leave the scheduler empty.');
}

/**
 * Verifies that destroying an effect actively cancels its custom scheduler
 * task.
 */
function testDestroyCancelsCustomSchedulerTask(): void {
  // Create a fresh runtime.
  const runtime = new ReactiveRuntime();

  // Create the reactive source.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create a manual scheduler.
  const scheduler = new ManualEffectScheduler();

  // Track effect executions.
  let runCount = 0;

  // Create the effect using the manual scheduler.
  const effect = new ReactiveEffect(
    runtime,
    'effect',
    () => {
      // Record execution.
      runCount++;

      // Establish the dependency.
      void source.value;
    },
    scheduler,
  );

  // Establish the initial dependency.
  effect.run();

  // Change the source to schedule the effect.
  source.value = 2;

  // Confirm that custom scheduler work exists.
  assert(scheduler.pendingCount === 1, 'Effect should have one pending custom scheduler task.');

  // Destroy the effect.
  effect.destroy();

  // Destruction should actively remove the task from the scheduler.
  assert(
    scheduler.pendingCount === 0,
    'Destroying the effect should cancel its custom scheduler task.',
  );

  // Flush the scheduler as an additional safety check.
  scheduler.flush();

  // The effect must not execute again.
  assert(runCount === 1, 'Destroyed effect should not execute cancelled custom scheduler work.');
}

/**
 * Verifies that a custom-scheduled effect can schedule new work after its
 * previous scheduled task has completed.
 */
function testCustomSchedulerCanRescheduleAfterExecution(): void {
  // Create a fresh runtime.
  const runtime = new ReactiveRuntime();

  // Create the reactive source.
  const source = new ReactiveValue(runtime, 'source', 1);

  // Create a manually controlled scheduler.
  const scheduler = new ManualEffectScheduler();

  // Record every value observed by the effect.
  const observedValues: number[] = [];

  // Create the effect using the custom scheduler.
  const effect = new ReactiveEffect(
    runtime,
    'effect',
    () => {
      // Record the current source value.
      observedValues.push(source.value);
    },
    scheduler,
  );

  // Establish the initial dependency.
  effect.run();

  // First change should schedule one task.
  source.value = 2;

  assert(scheduler.pendingCount === 1, 'First source change should schedule one task.');

  // Execute the first scheduled task.
  scheduler.flush();

  assert(observedValues.join(',') === '1,2', 'First scheduled task should execute the effect.');

  // A second change should be able to schedule another task.
  source.value = 3;

  assert(
    scheduler.pendingCount === 1,
    'Effect should be schedulable again after its previous task completes.',
  );

  // Execute the second scheduled task.
  scheduler.flush();

  // Confirm both scheduled executions occurred.
  assert(
    observedValues.join(',') === '1,2,3',
    'Effect should execute again after being rescheduled.',
  );

  // Clean up the effect.
  effect.destroy();
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
testBatchedEffectScheduling();
testNestedBatchScheduling();
testFailedBatchClearsDeferredWork();
testEffectErrorPropagates();
testEffectRecoversAfterError();
testEffectDependencyTrackingAfterError();
testEffectDynamicDependenciesAfterError();
testDestroyedEffectCannotRun();
testDestroyedEffectStopsReacting();
testEffectDestroyIsIdempotent();
testDestroyedEffectDisconnectsDependencies();
testDestroyedEffectCancelsScheduledWork();
testEffectRunsOnceForBatchedChanges();
testNestedBatchesDeferEffectUntilOutermostBatch();
testFailedBatchRestoresRuntimeState();
testRuntimeRemainsUsableAfterFailedBatch();
testCustomSchedulerReceivesEffectWork();
testCustomSchedulerCoalescesInvalidations();
testManualSchedulerDefersTasks();
testManualSchedulerDefersNewTasksUntilNextFlush();
testManualSchedulerClear();
testEffectWithManualScheduler();
testCustomSchedulerFailureRestoresSchedulingState();
testDestroyedEffectCancelsCustomScheduledWork();
testBatchedChangesWithCustomScheduler();
testManualSchedulerCancelsTask();
testDestroyCancelsCustomSchedulerTask();
testCustomSchedulerCanRescheduleAfterExecution();
