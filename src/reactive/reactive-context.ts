import {ReactiveNode} from './reactive-node.js';

/**
 * Stores the reactive consumer that is currently being evaluated.
 *
 * When a computed value reads a reactive value, that value can use the
 * active consumer to automatically register a dependency.
 */
export class ReactiveContext {
  private _activeConsumer: ReactiveNode | undefined;

  /**
   * Returns the consumer currently being evaluated.
   *
   * @returns The active consumer, or undefined when no reactive computation
   * is currently running.
   */
  get activeConsumer(): ReactiveNode | undefined {
    return this._activeConsumer;
  }

  /**
   * Makes a reactive node the current consumer.
   *
   * @param consumer - Node that is currently being evaluated.
   */
  setActiveConsumer(consumer: ReactiveNode): void {
    this._activeConsumer = consumer;
  }

  /**
   * Clears the current reactive consumer.
   */
  clearActiveConsumer(): void {
    this._activeConsumer = undefined;
  }
}
