/**
 * Curves from the right edge of A to the left edge of B.
 */

import type {PlacedNode} from '../layout.js';

export function connectionCurve(from: PlacedNode, to: PlacedNode, bend = 0): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2 + bend;
  const x2 = to.x;
  const y2 = to.y + to.height / 2 + bend;

  if (from.rank === to.rank) {
    const dip = Math.max(y1, y2) + 32;
    return `M ${x1} ${y1} C ${x1 + 40} ${dip}, ${x2 - 40} ${dip}, ${x2} ${y2}`;
  }

  const dx = Math.max(40, (x2 - x1) * 0.46);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
