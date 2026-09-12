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
