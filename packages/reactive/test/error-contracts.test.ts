/**
 * Characterizes error contracts for the reactive runtime, primitives, and
 * schedulers.
 *
 * These tests lock existing failure semantics so later refactors cannot
 * silently swallow, reorder, or drop errors.
 */

import {assert} from '../../../test/assert.js';
import {ManualEffectScheduler} from '../manual-effect-scheduler.js';
import {ReactiveComputed} from '../reactive-computed.js';
import {ReactiveEffect} from '../reactive-effect.js';
import {ReactiveRuntime} from '../reactive-runtime.js';
import {ReactiveScheduler} from '../scheduler.js';
import {ReactiveValue} from '../reactive-value.js';

/**
 * Returns the message from an expected thrown Error.
 */
function thrownErrorMessage(run: () => void): string {
  try {
    run();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Verifies that a disposed runtime rejects batching and deferred work with
 * stable error messages.
 */
function testDisposedRuntimeRejectsBatching(): void {
  const runtime = new ReactiveRuntime();
  runtime.dispose();

  assert(
    thrownErrorMessage(() => {
      runtime.batch(() => undefined);
    }) === 'Cannot batch work on a disposed runtime.',
    'disposed runtime should reject batch()',
  );

  assert(
    thrownErrorMessage(() => {
      runtime.deferUntilBatchComplete(() => undefined);
    }) === 'Cannot defer work on a disposed runtime.',
    'disposed runtime should reject deferUntilBatchComplete()',
  );
}

/**
 * Verifies that a computed cannot read itself while it is computing.
 */
function testComputedRejectsSelfRead(): void {
  const runtime = new ReactiveRuntime();
  let computed!: ReactiveComputed<number>;
  computed = new ReactiveComputed(runtime, 'loop', () => computed.value);

  assert(
    thrownErrorMessage(() => {
      void computed.value;
    }) === 'Reactive computed "loop" cannot read itself while computing.',
    'computed self-read should throw a cycle error',
  );
}

/**
 * Verifies that a two-node computed cycle is reported as a self-read on the
 * node that is already computing.
 */
function testComputedCyclePropagates(): void {
  const runtime = new ReactiveRuntime();
  let right!: ReactiveComputed<number>;
  const left = new ReactiveComputed(runtime, 'left', () => right.value);
  right = new ReactiveComputed(runtime, 'right', () => left.value);

  assert(
    thrownErrorMessage(() => {
      void left.value;
    }) === 'Reactive computed "left" cannot read itself while computing.',
    'cyclic computed graphs should fail on the already-computing node',
  );
}

/**
 * Verifies that an effect cannot run itself recursively.
 */
function testEffectRejectsRecursiveRun(): void {
  const runtime = new ReactiveRuntime();
  const effect = new ReactiveEffect(runtime, 'loop', () => {
    effect.run();
  });

  assert(
    thrownErrorMessage(() => {
      effect.run();
    }) === 'Reactive effect "loop" cannot run itself recursively.',
    'recursive effect.run() should throw',
  );
}

/**
 * Verifies that flush rethrows only the first task error after the full
 * batch has run.
 */
function testSchedulerRethrowsFirstErrorOnly(): void {
  const scheduler = new ReactiveScheduler();
  const firstError = new Error('first failure');
  const secondError = new Error('second failure');
  const executed: string[] = [];

  scheduler.schedule(() => {
    executed.push('a');
    throw firstError;
  });
  scheduler.schedule(() => {
    executed.push('b');
    throw secondError;
  });
  scheduler.schedule(() => {
    executed.push('c');
  });

  let thrown: unknown;

  try {
    scheduler.flush();
  } catch (error) {
    thrown = error;
  }

  assert(executed.join(',') === 'a,b,c', 'flush should run every task in the batch after an error');
  assert(thrown === firstError, 'flush should rethrow only the first task error');
}

/**
 * Verifies that flushOne propagates a task error immediately and leaves later
 * tasks pending.
 */
function testFlushOnePropagatesErrorImmediately(): void {
  const scheduler = new ReactiveScheduler();
  const expectedError = new Error('flushOne failure');
  let secondRan = false;

  scheduler.schedule(() => {
    throw expectedError;
  });
  scheduler.schedule(() => {
    secondRan = true;
  });

  let thrown: unknown;

  try {
    scheduler.flushOne();
  } catch (error) {
    thrown = error;
  }

  assert(thrown === expectedError, 'flushOne should propagate the task error immediately');
  assert(!secondRan, 'flushOne should not execute later tasks after an error');
  assert(scheduler.pendingCount === 1, 'flushOne should leave remaining tasks queued');
}

/**
 * Verifies that ManualEffectScheduler completes the current batch before
 * rethrowing the first task error.
 */
function testManualSchedulerContinuesAfterError(): void {
  const scheduler = new ManualEffectScheduler();
  const firstError = new Error('manual failure');
  const executed: string[] = [];

  scheduler.schedule(() => {
    executed.push('a');
    throw firstError;
  });
  scheduler.schedule(() => {
    executed.push('b');
  });

  let thrown: unknown;

  try {
    scheduler.flush();
  } catch (error) {
    thrown = error;
  }

  assert(executed.join(',') === 'a,b', 'manual flush should still run later tasks after an error');
  assert(thrown === firstError, 'manual flush should rethrow the first task error');
  assert(!scheduler.hasPendingWork, 'manual flush should consume the current batch even on error');
}

/**
 * Verifies that writing a disposed reactive value uses the same lifecycle
 * error as reading it.
 */
function testDisposedValueReadAndWriteErrors(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 1);
  source.dispose();

  const expected = 'Reactive value "source" has been disposed.';

  assert(
    thrownErrorMessage(() => {
      void source.value;
    }) === expected,
    'reading a disposed value should throw the lifecycle error',
  );

  assert(
    thrownErrorMessage(() => {
      source.value = 2;
    }) === expected,
    'writing a disposed value should throw the same lifecycle error',
  );
}

/**
 * Verifies that a consumer which observed a failing computed is invalidated
 * again when the failing computed's sources change.
 */
function testConsumerOfFailedComputedIsInvalidatedAgain(): void {
  const runtime = new ReactiveRuntime();
  const input = new ReactiveValue(runtime, 'input', 1);
  const checked = new ReactiveComputed(runtime, 'checked', () => {
    if (input.value < 0) throw new Error('negative');
    return input.value;
  });
  const observed: string[] = [];
  const effect = new ReactiveEffect(runtime, 'effect', () => {
    try {
      observed.push(String(checked.value));
    } catch {
      observed.push('error');
    }
  });

  effect.run();
  input.value = -1;
  runtime.flush();
  input.value = 2;
  runtime.flush();

  assert(
    observed.join(',') === '1,error,2',
    'a consumer should rerun when a previously failing computed can recover',
  );
}

testConsumerOfFailedComputedIsInvalidatedAgain();
testDisposedRuntimeRejectsBatching();
testComputedRejectsSelfRead();
testComputedCyclePropagates();
testEffectRejectsRecursiveRun();
testSchedulerRethrowsFirstErrorOnly();
testFlushOnePropagatesErrorImmediately();
testManualSchedulerContinuesAfterError();
testDisposedValueReadAndWriteErrors();
