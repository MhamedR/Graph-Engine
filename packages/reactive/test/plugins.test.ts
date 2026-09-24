import {
  ReactiveComputed,
  ReactiveEffect,
  ReactiveRuntime,
  ReactiveValue,
  type ReactiveComputationCompletedEvent,
  type ReactiveRuntimeEvent,
} from '../index.js';
import {ensure} from '../../../test/assert.js';

function testPluginLifecycle(): void {
  const runtime = new ReactiveRuntime();
  const calls: string[] = [];

  const uninstallFirst = runtime.use({
    name: 'first',
    install(installedRuntime) {
      ensure(installedRuntime === runtime, 'plugins should receive their runtime');
      calls.push('install:first');
      return () => calls.push('cleanup:first');
    },
  });
  runtime.use({
    name: 'second',
    install() {
      calls.push('install:second');
      return () => calls.push('cleanup:second');
    },
  });
  runtime.use({name: 'no-cleanup', install: () => undefined});

  ensure(
    runtime.pluginNames.join(',') === 'first,second,no-cleanup',
    'plugin names should preserve installation order',
  );

  let duplicateError: unknown;
  try {
    runtime.use({name: 'first', install: () => undefined});
  } catch (error) {
    duplicateError = error;
  }
  ensure(duplicateError instanceof Error, 'duplicate plugin names should be rejected');

  uninstallFirst();
  uninstallFirst();
  ensure(
    calls.filter((call) => call === 'cleanup:first').length === 1,
    'plugin removal should be idempotent',
  );

  runtime.use({
    name: 'third',
    install() {
      return () => calls.push('cleanup:third');
    },
  });
  runtime.dispose();

  ensure(
    calls.slice(-2).join(',') === 'cleanup:third,cleanup:second',
    'runtime disposal should clean up plugins in reverse installation order',
  );
  ensure(runtime.pluginNames.length === 0, 'disposed runtimes should have no plugins');

  let disposedError: unknown;
  try {
    runtime.use({name: 'late', install: () => undefined});
  } catch (error) {
    disposedError = error;
  }
  ensure(disposedError instanceof Error, 'disposed runtimes should reject plugins');
}

function testPluginCleanupErrorsDoNotBlockDisposal(): void {
  const runtime = new ReactiveRuntime();
  let secondCleaned = false;

  runtime.use({
    name: 'healthy',
    install: () => () => {
      secondCleaned = true;
    },
  });
  runtime.use({
    name: 'failing',
    install: () => () => {
      throw new Error('cleanup failed');
    },
  });

  let thrown: unknown;
  try {
    runtime.dispose();
  } catch (error) {
    thrown = error;
  }

  ensure(thrown instanceof Error, 'plugin cleanup failures should be reported');
  ensure(secondCleaned, 'later plugin cleanup should still run');
  ensure(runtime.disposed, 'the runtime should still be disposed');
}

function testComputationEvents(): void {
  const runtime = new ReactiveRuntime({traceBufferSize: 64});
  const source = new ReactiveValue(runtime, 'source', 1);
  const parity = new ReactiveComputed(runtime, 'parity', () => source.value % 2);
  const failing = new ReactiveComputed(runtime, 'failing', () => {
    if (source.value > 2) throw new Error('too large');
    return source.value;
  });
  const effect = new ReactiveEffect(runtime, 'effect', () => {
    void parity.value;
  });

  effect.run();
  source.value = 3;
  void parity.value;

  try {
    void failing.value;
  } catch {
    // Expected: the failure should be traced.
  }

  const completed = runtime
    .getTrace()
    .filter(
      (event): event is ReactiveComputationCompletedEvent => event.type === 'computation-completed',
    );
  const started = new Map(
    runtime
      .getTrace()
      .filter((event) => event.type === 'computation-started')
      .map((event) => [event.sequence, event]),
  );

  const effectRun = completed.find((event) => event.nodeId === 'effect');
  ensure(effectRun?.nodeKind === 'effect', 'effect runs should be traced');
  ensure(effectRun.valueChanged === undefined, 'effects do not report value changes');

  const parityRuns = completed.filter((event) => event.nodeId === 'parity');
  ensure(parityRuns.length === 2, 'each computed evaluation should be traced');
  ensure(parityRuns[0]?.valueChanged === true, 'the first evaluation produces a value');
  ensure(parityRuns[1]?.valueChanged === false, 'an equal recomputation should be reported');

  const failure = completed.find((event) => event.nodeId === 'failing');
  ensure(failure?.status === 'error', 'failed computations should be traced as errors');
  ensure(failure.error === 'too large', 'failures should carry the error message');

  for (const event of completed) {
    const start = started.get(event.startedSequence);
    ensure(start?.type === 'computation-started', 'completions should reference their start');
    ensure(start.nodeId === event.nodeId, 'start and completion should describe the same node');
    ensure(event.durationMs >= 0, 'durations should be non-negative');
  }
}

function testListenersNeverBecomeDependencies(): void {
  const runtime = new ReactiveRuntime();
  const unrelated = new ReactiveValue(runtime, 'unrelated', 0);
  const source = new ReactiveValue(runtime, 'source', 0);
  const computed = new ReactiveComputed(runtime, 'computed', () => source.value);

  runtime.subscribe(() => {
    void unrelated.value;
  });

  void computed.value;

  ensure(
    runtime.explain('computed').producerIds.join(',') === 'source',
    'reads inside event listeners must not be tracked by the active computation',
  );
}

function testTraceRingBufferOrder(): void {
  const runtime = new ReactiveRuntime({traceBufferSize: 3});
  const events: ReactiveRuntimeEvent[] = [];
  runtime.subscribe((event) => events.push(event));

  for (let index = 0; index < 7; index++) {
    new ReactiveValue(runtime, `value-${index}`, index);
  }

  const retained = runtime.getTrace();
  ensure(
    retained.map((event) => event.sequence).join(',') ===
      events
        .slice(-3)
        .map((event) => event.sequence)
        .join(','),
    'the ring buffer should retain the newest events in order',
  );
  ensure(runtime.state.traceEventCount === 3, 'retained count should match the buffer size');

  runtime.clearTrace();
  ensure(runtime.getTrace().length === 0, 'clearing should empty the ring buffer');

  new ReactiveValue(runtime, 'after-clear', 0);
  ensure(runtime.getTrace().length === 1, 'the ring buffer should accept events after clearing');
}

function testUnobservedRuntimeSkipsComputationTracing(): void {
  const runtime = new ReactiveRuntime();
  const computed = new ReactiveComputed(runtime, 'computed', () => 1);

  ensure(!runtime.isObserved, 'a runtime without buffers or listeners is unobserved');
  void computed.value;
  ensure(runtime.state.eventSequence === 0, 'unobserved runtimes should not emit events');
}

testPluginLifecycle();
testPluginCleanupErrorsDoNotBlockDisposal();
testComputationEvents();
testListenersNeverBecomeDependencies();
testTraceRingBufferOrder();
testUnobservedRuntimeSkipsComputationTracing();
