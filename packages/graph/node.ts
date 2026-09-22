/**
 * Uniquely identified graph node with a typed payload.
 *
 * Simple graphs can use the default string payload, which defaults to the
 * node ID:
 *
 *     new Node('a')
 *     new Node('a', 'Ada')
 *
 * Typed graphs attach structured data:
 *
 *     new Node('user-1', { name: 'Ada' })
 */
export class Node<T = string> {
  public readonly data: T;

  constructor(
    public readonly id: string,
    ...payload: [T] extends [string] ? [data?: T] : [data: T]
  ) {
    this.data = (payload.length === 0 ? id : payload[0]) as T;
  }
}
