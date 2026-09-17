/**
 * Baseline benchmarks for graph mutation, traversal, reactive propagation,
 * and queue behavior.
 *
 * These measurements exist to guide later optimization. They are not part
 * of the correctness suite and are excluded from the production build.
 */

import {Queue} from '../data-structures/queue.js';
import {DirectedGraph} from '../graph/directed-graph.js';
import {Node} from '../graph/node.js';
import {breadthFirstSearch} from '../algorithms/bfs.js';
import {ReactiveNode} from '../reactive/reactive-node.js';
import {ReactiveRuntime} from '../reactive/reactive-runtime.js';
import {ReactiveValue} from '../reactive/reactive-value.js';
import {ReactiveComputed} from '../reactive/reactive-computed.js';

/**
 * One reported benchmark result.
 */
interface BenchResult {
  name: string;
  milliseconds: number;
  operations: number;
}

const results: BenchResult[] = [];

/**
 * Times `fn` and records the result.
 */
function measure(name: string, operations: number, fn: () => void): void {
  const started = performance.now();
  fn();
  results.push({
    name,
    milliseconds: performance.now() - started,
    operations,
  });
}

/**
 * Builds a directed graph with `nodeCount` nodes and no edges.
 */
function graphWithNodes(nodeCount: number): DirectedGraph {
  const graph = new DirectedGraph();

  for (let index = 0; index < nodeCount; index++) {
    graph.addNode(new Node(`n${index}`));
  }

  return graph;
}

/**
 * Measures graph construction, lookup, and traversal.
 */
function benchGraph(): void {
  const nodeCount = 10_000;

  measure(`graph: add ${nodeCount} nodes`, nodeCount, () => {
    graphWithNodes(nodeCount);
  });

  const chain = graphWithNodes(nodeCount);
  measure(`graph: add ${nodeCount - 1} chain edges`, nodeCount - 1, () => {
    for (let index = 0; index < nodeCount - 1; index++) {
      chain.addEdge(`n${index}`, `n${index + 1}`);
    }
  });

  measure(`graph: ${nodeCount - 1} hasEdge lookups on a chain`, nodeCount - 1, () => {
    for (let index = 0; index < nodeCount - 1; index++) {
      chain.hasEdge(`n${index}`, `n${index + 1}`);
    }
  });

  const starDegree = 5_000;
  const star = graphWithNodes(starDegree + 1);
  for (let index = 1; index <= starDegree; index++) {
    star.addEdge('n0', `n${index}`);
  }

  measure(`graph: ${starDegree} hasEdge lookups on a star`, starDegree, () => {
    for (let index = 1; index <= starDegree; index++) {
      star.hasEdge('n0', `n${index}`);
    }
  });

  measure('graph: BFS over 10_000-node chain', nodeCount, () => {
    breadthFirstSearch(chain, 'n0');
  });
}

/**
 * Measures reactive node creation, wide invalidation, and recomputation.
 */
function benchReactive(): void {
  const wide = 5_000;
  const source = new ReactiveNode('source');

  for (let index = 0; index < wide; index++) {
    const consumer = new ReactiveNode(`c${index}`);
    consumer.addProducer(source);
  }

  measure(`reactive: notifyConsumers across ${wide} consumers`, wide, () => {
    source.notifyConsumers();
  });

  const depth = 1_000;
  const runtime = new ReactiveRuntime();
  const value = new ReactiveValue(runtime, 'source', 1);
  let current: {value: number} = value;

  for (let index = 0; index < depth; index++) {
    const previous = current;
    current = new ReactiveComputed(runtime, `c${index}`, () => previous.value + 1);
  }

  void current.value;
  value.value = 2;

  measure(`reactive: read ${depth}-deep computed chain after source write`, depth, () => {
    void current.value;
  });

  const wideRuntime = new ReactiveRuntime();
  const wideSource = new ReactiveValue(wideRuntime, 'wide-source', 1);
  const computed: ReactiveComputed<number>[] = [];

  for (let index = 0; index < wide; index++) {
    computed.push(new ReactiveComputed(wideRuntime, `w${index}`, () => wideSource.value + index));
    void computed[index]?.value;
  }

  wideSource.value = 2;

  measure(`reactive: ${wide} computed reads from one source`, wide, () => {
    for (const node of computed) {
      void node.value;
    }
  });
}

/**
 * Compares Array.shift() against Queue for a BFS-like drain.
 */
function benchQueueVersusShift(): void {
  const size = 50_000;

  measure(`queue: Array.shift drain of ${size}`, size, () => {
    const items = Array.from({length: size}, (_, index) => index);

    while (items.length > 0) {
      items.shift();
    }
  });

  measure(`queue: Queue drain of ${size}`, size, () => {
    const queue = new Queue<number>();

    for (let index = 0; index < size; index++) {
      queue.enqueue(index);
    }

    while (!queue.isEmpty()) {
      queue.dequeue();
    }
  });

  measure('queue: 100_000 enqueue/dequeue on one Queue instance', 100_000, () => {
    const queue = new Queue<number>();

    for (let index = 0; index < 100_000; index++) {
      queue.enqueue(index);
      queue.dequeue();
    }
  });
}

/**
 * Prints the collected results as a compact table.
 */
function printResults(): void {
  console.log('Benchmark results');
  console.log('-----------------');

  for (const result of results) {
    const opsPerMs = result.milliseconds === 0 ? 0 : result.operations / result.milliseconds;
    console.log(
      `${result.name.padEnd(62)} ${result.milliseconds.toFixed(2).padStart(8)} ms  ` +
        `${opsPerMs.toFixed(1).padStart(10)} ops/ms`,
    );
  }
}

benchGraph();
benchReactive();
benchQueueVersusShift();
printResults();
