/**
 * A generic first-in, first-out (FIFO) queue.
 *
 * Elements are removed in the same order in which they were added.
 *
 * For example:
 *
 *     enqueue(A)
 *     enqueue(B)
 *     enqueue(C)
 *
 *     dequeue() → A
 *     dequeue() → B
 *     dequeue() → C
 *
 * The queue uses an index instead of Array.shift() so removing the first
 * element does not require moving every remaining element.
 *
 * @typeParam T - The type of values stored in the queue.
 */
export class Queue<T> {
  private readonly items: T[] = [];

  /**
   * Index of the next element that should be removed.
   *
   * Elements before this index have already been dequeued.
   */
  private head = 0;

  /**
   * Adds an item to the end of the queue.
   *
   * @param item - The value to add.
   */
  enqueue(item: T): void {
    this.items.push(item);
  }

  /**
   * Removes and returns the oldest item in the queue.
   *
   * @returns The oldest queued item, or `undefined` when the queue is empty.
   */
  dequeue(): T | undefined {
    // Return undefined when there are no remaining items.
    if (this.isEmpty()) {
      return undefined;
    }

    // Read the next item without shifting the rest of the array.
    const item = this.items[this.head];

    // Move the head forward so this item is not returned again.
    this.head++;

    // Reclaim drained slots so a long-lived queue cannot grow without bound.
    if (this.isEmpty()) {
      this.clear();
    } else if (this.head > 1024 && this.head * 2 >= this.items.length) {
      this.items.splice(0, this.head);
      this.head = 0;
    }

    return item;
  }

  /**
   * Determines whether the queue contains no remaining items.
   *
   * @returns `true` when the queue is empty.
   */
  isEmpty(): boolean {
    return this.head >= this.items.length;
  }

  /**
   * Returns the number of items still waiting in the queue.
   *
   * @returns The number of queued items.
   */
  get size(): number {
    return this.items.length - this.head;
  }

  /**
   * Removes all remaining items from the queue.
   */
  clear(): void {
    this.items.length = 0;
    this.head = 0;
  }
}
