import {ReactiveRuntime} from './reactive-runtime.js';
import {assert} from '../test/assert.js';
import {ReactiveNode} from './reactive-node.js';

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

// Run the runtime scheduler tests.
testRuntimeOwnsScheduler();
testScheduledChange();
testBatchedScheduledChanges();
testScheduledChangeDeduplication();
testScheduledChangePropagatesToAllConsumers();
testClearScheduledWork();
testRuntimeFlushOne();
