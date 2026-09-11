/**
 * Tracks the current global reactive epoch.
 *
 * The epoch advances whenever reactive state changes. Consumers can use
 * the epoch to determine whether they have already checked their
 * dependencies since the latest change.
 */
export class Epoch {
  private _value = 0;

  /**
   * Returns the current global epoch.
   *
   * @returns The current epoch value.
   */
  get value(): number {
    return this._value;
  }

  /**
   * Advances the global epoch.
   *
   * @returns The newly assigned epoch value.
   */
  increment(): number {
    this._value++;
    return this._value;
  }
}
