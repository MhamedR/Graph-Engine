import {
  ManualEffectScheduler,
  ReactiveComputed,
  ReactiveRuntime,
  ReactiveValue,
} from '../../reactive/index.js';
import {createExternalStore, createMicrotaskScheduler, toSvelteStore} from '../store.js';
import {assert} from '../../../test/assert.js';

function testExternalStoreNotifiesOnFlush(): void {
  const runtime = new ReactiveRuntime();
  const count = new ReactiveValue(runtime, 'count', 1);
  const parity = new ReactiveComputed(runtime, 'parity', () =>
    count.value % 2 === 0 ? 'even' : 'odd',
  );
  const store = createExternalStore(runtime, parity);
  const nodeCountBefore = runtime.nodeCount;
  let notifications = 0;

  const unsubscribe = store.subscribe(() => notifications++);
  assert(store.getSnapshot() === 'odd', 'getSnapshot should return the current value');
  assert(runtime.nodeCount === nodeCountBefore + 1, 'subscribing should create one observer');

  count.value = 2;
  assert(notifications === 0, 'the default scheduler should defer notifications until flush');
  runtime.flush();
  assert(notifications === 1, 'a changed value should notify after flush');
  assert(store.getSnapshot() === 'even', 'the snapshot should reflect the new value');

  count.value = 4;
  runtime.flush();
  assert(notifications === 1, 'an equal derived value should not notify');

  unsubscribe();
  unsubscribe();
  assert(runtime.nodeCount === nodeCountBefore, 'the last unsubscribe should remove the observer');

  count.value = 5;
  runtime.flush();
  assert(notifications === 1, 'unsubscribed listeners should not be notified');
}

function testErrorsAreSurfacedThroughSnapshots(): void {
  const runtime = new ReactiveRuntime();
  const input = new ReactiveValue(runtime, 'input', 1);
  const checked = new ReactiveComputed(runtime, 'checked', () => {
    if (input.value < 0) throw new Error('negative');
    return input.value;
  });
  const scheduler = new ManualEffectScheduler();
  const store = createExternalStore(runtime, checked, {id: 'checked-store', scheduler});
  let notifications = 0;
  store.subscribe(() => notifications++);

  input.value = -1;
  scheduler.flush();
  assert(notifications === 1, 'a failing source should notify so the UI can read the error');

  let thrown: unknown;
  try {
    store.getSnapshot();
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof Error, 'getSnapshot should rethrow source failures');

  input.value = 3;
  scheduler.flush();
  assert(notifications === 2, 'recovering from an error should notify');
  assert(store.getSnapshot() === 3, 'the recovered value should be readable');
  assert(runtime.explain('checked-store').kind === 'effect', 'custom observer IDs should be used');
}

async function testMicrotaskSchedulerAndSvelteAdapter(): Promise<void> {
  const runtime = new ReactiveRuntime();
  const name = new ReactiveValue(runtime, 'name', 'Ada');
  const store = createExternalStore(runtime, name, {scheduler: createMicrotaskScheduler()});
  const seen: string[] = [];

  const unsubscribe = toSvelteStore(store).subscribe((value) => seen.push(value));
  assert(
    seen.join(',') === 'Ada',
    'Svelte subscribers should receive the current value immediately',
  );

  name.value = 'Grace';
  assert(seen.length === 1, 'microtask notifications should be asynchronous');
  await Promise.resolve();
  assert(seen.join(',') === 'Ada,Grace', 'microtask notifications should run without flush');

  unsubscribe();
  store.dispose();
  store.dispose();
  assert(store.disposed && store.listenerCount === 0, 'disposal should be idempotent');

  let thrown: unknown;
  try {
    store.subscribe(() => undefined);
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof Error, 'disposed stores should reject subscriptions');

  const errors: unknown[] = [];
  const failing = createMicrotaskScheduler((error) => errors.push(error));
  failing.schedule(() => {
    throw new Error('task failed');
  });
  const cancelled = failing.schedule(() => {
    errors.push('should not run');
  });
  cancelled.cancel();
  await Promise.resolve();
  assert(errors.length === 1 && errors[0] instanceof Error, 'task errors should reach onError');
}

testExternalStoreNotifiesOnFlush();
testErrorsAreSurfacedThroughSnapshots();
await testMicrotaskSchedulerAndSvelteAdapter();
