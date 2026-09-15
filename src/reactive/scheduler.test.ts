import {ReactiveScheduler} from './scheduler.js';
import {assert} from '../test/assert.js';

/**
 * Verifies that a scheduler starts with no pending work.
 */
function testSchedulerStartsEmpty(): void {
  const scheduler = new ReactiveScheduler();

  assert(!scheduler.hasPendingWork, 'scheduler should initially have no pending work');

  assert(scheduler.pendingCount === 0, 'scheduler should initially contain zero tasks');
}

/**
 * Verifies that scheduled work remains pending until the scheduler is flushed.
 */
function testScheduling(): void {
  const scheduler = new ReactiveScheduler();

  let executed = false;

  scheduler.schedule(() => {
    // Record that the scheduled task actually executed.
    executed = true;
  });

  assert(scheduler.hasPendingWork, 'scheduler should report pending work after scheduling');

  assert(scheduler.pendingCount === 1, 'scheduler should contain one pending task');

  assert(!executed, 'scheduled work should not execute immediately');
}

/**
 * Verifies that flush executes queued tasks in insertion order.
 */
function testFlushOrder(): void {
  const scheduler = new ReactiveScheduler();

  const executionOrder: number[] = [];

  scheduler.schedule(() => {
    // Record the first task.
    executionOrder.push(1);
  });

  scheduler.schedule(() => {
    // Record the second task.
    executionOrder.push(2);
  });

  scheduler.schedule(() => {
    // Record the third task.
    executionOrder.push(3);
  });

  scheduler.flush();

  assert(executionOrder.length === 3, 'flush should execute all queued tasks');

  assert(
    executionOrder[0] === 1 && executionOrder[1] === 2 && executionOrder[2] === 3,
    'flush should preserve scheduling order',
  );

  assert(!scheduler.hasPendingWork, 'scheduler should be empty after flushing');

  assert(scheduler.pendingCount === 0, 'scheduler should contain zero tasks after flushing');
}

/**
 * Verifies that tasks scheduled during a flush are deferred to the next
 * flush cycle.
 */
function testNestedSchedulingIsDeferred(): void {
  const scheduler = new ReactiveScheduler();

  const executionOrder: string[] = [];

  scheduler.schedule(() => {
    // Record the currently executing task.
    executionOrder.push('A');

    // Schedule new work while the current batch is executing.
    scheduler.schedule(() => {
      executionOrder.push('C');
    });
  });

  scheduler.schedule(() => {
    // This task belongs to the original batch.
    executionOrder.push('B');
  });

  scheduler.flush();

  assert(executionOrder.length === 2, 'first flush should execute only the original batch');

  assert(
    executionOrder[0] === 'A' && executionOrder[1] === 'B',
    'newly scheduled work should not interrupt the current batch',
  );

  assert(scheduler.hasPendingWork, 'newly scheduled work should remain pending');

  assert(scheduler.pendingCount === 1, 'exactly one newly scheduled task should remain');

  scheduler.flush();

  assert(executionOrder.length === 3, 'second flush should execute the deferred task');

  assert(executionOrder[2] === 'C', 'deferred task should execute during the next flush');

  assert(!scheduler.hasPendingWork, 'scheduler should be empty after the second flush');
}
/**
 * Verifies that one failing task does not prevent later tasks in the same
 * batch from executing.
 */
function testFlushContinuesAfterError(): void {
  const scheduler = new ReactiveScheduler();

  const executionOrder: string[] = [];
  const expectedError = new Error('scheduled task failed');

  scheduler.schedule(() => {
    // Record the failing task before throwing.
    executionOrder.push('A');

    throw expectedError;
  });

  scheduler.schedule(() => {
    // This task should still execute after the first task fails.
    executionOrder.push('B');
  });

  scheduler.schedule(() => {
    // This task should also execute before flush reports the error.
    executionOrder.push('C');
  });

  let thrownError: unknown;

  try {
    // Flush should execute the complete current batch before rethrowing.
    scheduler.flush();
  } catch (error) {
    // Capture the error so we can verify that it is the original failure.
    thrownError = error;
  }

  assert(executionOrder.length === 3, 'flush should continue executing tasks after an error');

  assert(
    executionOrder[0] === 'A' && executionOrder[1] === 'B' && executionOrder[2] === 'C',
    'tasks should retain their original execution order after an error',
  );

  assert(thrownError === expectedError, 'flush should rethrow the first task error');

  assert(
    !scheduler.hasPendingWork,
    'the completed batch should be removed even when a task throws',
  );
}

/**
 * Verifies that calling flush from inside a scheduled task is rejected.
 */
function testRecursiveFlushIsRejected(): void {
  const scheduler = new ReactiveScheduler();

  let nestedError: unknown;

  scheduler.schedule(() => {
    assert(
      scheduler.isFlushing,
      'scheduler should report that it is flushing while a task executes',
    );

    try {
      // Attempt to start another flush while the current flush is active.
      scheduler.flush();
    } catch (error) {
      // Capture the scheduler's reentrancy error.
      nestedError = error;
    }

    assert(
      scheduler.isFlushing,
      'scheduler should still report flushing after the rejected nested flush',
    );
  });

  assert(!scheduler.isFlushing, 'scheduler should initially report that it is not flushing');

  scheduler.flush();

  assert(!scheduler.isFlushing, 'scheduler should stop reporting flushing after flush completes');

  scheduler.flush();

  assert(nestedError instanceof Error, 'recursive flush should throw an Error');

  assert(
    nestedError instanceof Error &&
      nestedError.message === 'Reactive scheduler cannot be flushed recursively.',
    'recursive flush should report the expected error',
  );

  assert(
    !scheduler.hasPendingWork,
    'scheduler should remain empty after the rejected nested flush',
  );
}

/**
 * Verifies that clear removes pending work without executing it.
 */
function testClear(): void {
  const scheduler = new ReactiveScheduler();

  let executed = false;

  scheduler.schedule(() => {
    // This task should be discarded before it can execute.
    executed = true;
  });

  scheduler.schedule(() => {
    // This task should also be discarded.
    executed = true;
  });

  assert(scheduler.pendingCount === 2, 'scheduler should contain the tasks before clearing');

  scheduler.clear();

  assert(!scheduler.hasPendingWork, 'scheduler should have no pending work after clear');

  assert(scheduler.pendingCount === 0, 'scheduler should contain zero tasks after clear');

  assert(!executed, 'clear should discard tasks without executing them');
}

/**
 * Verifies that flushOne executes exactly one pending task.
 */
function testFlushOne(): void {
  const scheduler = new ReactiveScheduler();

  const executionOrder: number[] = [];

  scheduler.schedule(() => {
    // Record the first task.
    executionOrder.push(1);
  });

  scheduler.schedule(() => {
    // Record the second task.
    executionOrder.push(2);
  });

  scheduler.flushOne();

  assert(executionOrder.length === 1, 'flushOne should execute exactly one task');

  assert(executionOrder[0] === 1, 'flushOne should execute the first pending task');

  assert(scheduler.pendingCount === 1, 'flushOne should leave later tasks pending');

  scheduler.flushOne();

  assert(executionOrder.length === 2, 'second flushOne should execute the remaining task');

  assert(executionOrder[1] === 2, 'second flushOne should execute the next task');

  assert(!scheduler.hasPendingWork, 'scheduler should be empty after all tasks are executed');
}

/**
 * Verifies that a scheduler error propagates to the caller.
 */
function testSchedulerErrorPropagates(): void {
  const scheduler = new ReactiveScheduler();

  let threw = false;

  scheduler.schedule(() => {
    throw new Error('scheduler failure');
  });

  try {
    scheduler.flush();
  } catch (error) {
    threw = error instanceof Error && error.message === 'scheduler failure';
  }

  assert(threw, 'scheduler errors should propagate to the caller');
}

/**
 * Verifies that one failed scheduler task does not prevent later tasks from
 * executing.
 */
function testSchedulerContinuesAfterError(): void {
  const scheduler = new ReactiveScheduler();

  let firstTaskRan = false;
  let secondTaskRan = false;
  let thirdTaskRan = false;

  scheduler.schedule(() => {
    firstTaskRan = true;
    throw new Error('first failure');
  });

  scheduler.schedule(() => {
    secondTaskRan = true;
  });

  scheduler.schedule(() => {
    thirdTaskRan = true;
  });

  try {
    scheduler.flush();
  } catch {
    // The first error is expected.
  }

  assert(firstTaskRan, 'the failing scheduler task should execute');

  assert(secondTaskRan, 'scheduler should continue after the first task fails');

  assert(thirdTaskRan, 'scheduler should execute all remaining tasks after an error');
}

/**
 * Verifies that scheduler tasks added while a flush is running are deferred
 * to the next flush cycle.
 */
function testSchedulerDefersTasksScheduledDuringFlush(): void {
  const scheduler = new ReactiveScheduler();

  let firstRuns = 0;
  let deferredRuns = 0;

  scheduler.schedule(() => {
    firstRuns++;

    // This task is scheduled while the current flush is already running.
    scheduler.schedule(() => {
      deferredRuns++;
    });
  });

  scheduler.flush();

  assert(firstRuns === 1, 'initial scheduler task should run during the first flush');

  assert(deferredRuns === 0, 'tasks scheduled during a flush should be deferred');

  scheduler.flush();

  assert(deferredRuns === 1, 'deferred task should run during the next flush');
}

// Run the scheduler test suite.
testSchedulerStartsEmpty();
testScheduling();
testFlushOrder();
testNestedSchedulingIsDeferred();
testFlushContinuesAfterError();
testRecursiveFlushIsRejected();
testClear();
testFlushOne();
testSchedulerErrorPropagates();
testSchedulerContinuesAfterError();
testSchedulerDefersTasksScheduledDuringFlush();
