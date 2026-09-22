/**
 * Stable performance budgets for operations whose complexity is part of the
 * public quality contract. Budgets are intentionally conservative enough for
 * shared CI runners while still detecting accidental quadratic regressions.
 */

import {DirectedGraph, Node, breadthFirstSearch} from '../packages/graph/index.js';
import {
  ReactiveComputed,
  ReactiveRuntime,
  ReactiveValue,
  diffReactiveGraphSnapshots,
} from '../packages/reactive/index.js';
import {ReactiveNode} from '../packages/reactive/advanced.js';

interface RegressionCase {
  readonly name: string;
  readonly operationCount: number;
  readonly budgetMilliseconds: number;
  readonly run: () => void;
  readonly reset?: () => void;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
}

function measure(testCase: RegressionCase): number {
  testCase.reset?.();
  testCase.run();

  const samples: number[] = [];

  for (let sample = 0; sample < 7; sample++) {
    testCase.reset?.();
    const started = performance.now();
    testCase.run();
    samples.push(performance.now() - started);
  }

  return median(samples);
}

const graphSize = 20_000;
const graph = new DirectedGraph();

for (let index = 0; index < graphSize; index++) {
  graph.addNode(new Node(`g${index}`));
}

for (let index = 0; index < graphSize - 1; index++) {
  graph.addEdge(`g${index}`, `g${index + 1}`);
}

const invalidationWidth = 20_000;
const invalidationSource = new ReactiveNode('invalidation-source');
const invalidationConsumers: ReactiveNode[] = [];

for (let index = 0; index < invalidationWidth; index++) {
  const consumer = new ReactiveNode(`consumer-${index}`, 'computed');
  consumer.addProducer(invalidationSource);
  invalidationConsumers.push(consumer);
}

const computedWidth = 5_000;
const runtime = new ReactiveRuntime();
const source = new ReactiveValue(runtime, 'source', 0);
const computeds: ReactiveComputed<number>[] = [];

for (let index = 0; index < computedWidth; index++) {
  const computed = new ReactiveComputed(runtime, `computed-${index}`, () => source.value + index);
  computeds.push(computed);
  void computed.value;
}

let sourceVersion = 0;
let previousSnapshot = runtime.createGraphSnapshot();
source.value = ++sourceVersion;
let currentSnapshot = runtime.createGraphSnapshot();

const cases: RegressionCase[] = [
  {
    name: `BFS over ${graphSize.toLocaleString()}-node chain`,
    operationCount: graphSize,
    budgetMilliseconds: 150,
    run: () => {
      breadthFirstSearch(graph, 'g0');
    },
  },
  {
    name: `invalidate ${invalidationWidth.toLocaleString()} consumers`,
    operationCount: invalidationWidth,
    budgetMilliseconds: 100,
    reset: () => {
      for (const consumer of invalidationConsumers) consumer.clearDirty();
    },
    run: () => {
      invalidationSource.notifyConsumers();
    },
  },
  {
    name: `recompute ${computedWidth.toLocaleString()} wide dependencies`,
    operationCount: computedWidth,
    budgetMilliseconds: 150,
    reset: () => {
      source.value = ++sourceVersion;
    },
    run: () => {
      for (const computed of computeds) void computed.value;
    },
  },
  {
    name: `snapshot ${computedWidth.toLocaleString()}-edge reactive graph`,
    operationCount: computedWidth,
    budgetMilliseconds: 150,
    run: () => {
      runtime.createGraphSnapshot();
    },
  },
  {
    name: `diff ${computedWidth.toLocaleString()}-edge reactive snapshots`,
    operationCount: computedWidth,
    budgetMilliseconds: 150,
    reset: () => {
      for (const computed of computeds) void computed.value;
      previousSnapshot = runtime.createGraphSnapshot();
      source.value = ++sourceVersion;
      currentSnapshot = runtime.createGraphSnapshot();
    },
    run: () => {
      diffReactiveGraphSnapshots(previousSnapshot, currentSnapshot);
    },
  },
];

const failures: string[] = [];

console.log('Performance regression budgets');
console.log('------------------------------');

for (const testCase of cases) {
  const milliseconds = measure(testCase);
  const status = milliseconds <= testCase.budgetMilliseconds ? 'PASS' : 'FAIL';
  const operationsPerSecond = (testCase.operationCount / milliseconds) * 1_000;

  console.log(
    `${status} ${testCase.name}: ${milliseconds.toFixed(2)} ms ` +
      `(${operationsPerSecond.toFixed(0)} ops/s, budget ${testCase.budgetMilliseconds} ms)`,
  );

  if (status === 'FAIL') {
    failures.push(
      `${testCase.name} took ${milliseconds.toFixed(2)} ms; budget is ${testCase.budgetMilliseconds} ms`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(`Performance regression detected:\n${failures.join('\n')}`);
}
