import {Queue} from '../index.js';
import {assert} from '../../../test/assert.js';

/**
 * Verifies FIFO ordering and empty-queue behavior.
 */
function testQueueFifo(): void {
  const queue = new Queue<string>();

  assert(queue.isEmpty(), 'queue should start empty');
  assert(queue.size === 0, 'empty queue should have size 0');
  assert(queue.dequeue() === undefined, 'dequeue on an empty queue should return undefined');

  queue.enqueue('a');
  queue.enqueue('b');
  queue.enqueue('c');

  assert(queue.size === 3, 'queue should report the number of remaining items');
  assert(queue.dequeue() === 'a', 'queue should dequeue the oldest item first');
  assert(queue.dequeue() === 'b', 'queue should preserve insertion order');
  assert(queue.size === 1, 'size should decrease after dequeue');
  assert(queue.dequeue() === 'c', 'queue should dequeue the last remaining item');
  assert(queue.isEmpty(), 'queue should be empty after all items are removed');
}

/**
 * Verifies that enqueue after partial dequeue continues from the remaining items.
 */
function testQueueInterleavedOperations(): void {
  const queue = new Queue<number>();

  queue.enqueue(1);
  queue.enqueue(2);
  assert(queue.dequeue() === 1, 'first dequeue should return 1');

  queue.enqueue(3);
  assert(queue.dequeue() === 2, 'remaining head should still be 2');
  assert(queue.dequeue() === 3, 'newly enqueued item should be dequeued last');
  assert(queue.isEmpty(), 'queue should be empty after interleaved operations');
}

/**
 * Verifies that clear discards remaining items and resets the queue.
 */
function testQueueClear(): void {
  const queue = new Queue<string>();

  queue.enqueue('x');
  queue.enqueue('y');
  queue.clear();

  assert(queue.isEmpty(), 'cleared queue should be empty');
  assert(queue.size === 0, 'cleared queue should have size 0');
  assert(queue.dequeue() === undefined, 'cleared queue should not return discarded items');

  queue.enqueue('z');
  assert(queue.dequeue() === 'z', 'queue should be usable after clear');
}

testQueueFifo();
testQueueInterleavedOperations();
testQueueClear();

/**
 * Verifies that a long-lived queue remains usable after many drain cycles.
 */
function testQueueReclaimsDrainedSlots(): void {
  const queue = new Queue<number>();

  for (let index = 0; index < 3_000; index++) {
    queue.enqueue(index);
    assert(queue.dequeue() === index, 'queue should return each enqueued item exactly once');
  }

  queue.enqueue(42);
  queue.enqueue(43);

  assert(queue.dequeue() === 42, 'queue should remain FIFO after many drain cycles');
  assert(queue.dequeue() === 43, 'queue should keep later items after reclamation');
  assert(queue.isEmpty(), 'queue should be empty after the post-reclamation drain');
}

testQueueReclaimsDrainedSlots();
