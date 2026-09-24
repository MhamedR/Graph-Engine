/**
 * Asserts that a condition is true.
 *
 * @param condition - Condition that must evaluate to `true`.
 * @param message - Description of the expected condition.
 * @throws {Error} When the condition is false.
 */
export function assert(condition: boolean, message: string): void {
  // Stop the test immediately when an invariant is violated.
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Asserts that a condition is truthy and narrows its type.
 *
 * Kept separate from {@link assert} because narrowing breaks assertions on
 * values that are mutated inside callbacks.
 */
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
