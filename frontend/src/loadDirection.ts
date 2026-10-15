type Point = { x: number; y: number };

/** Suggest a global axis once at placement; never reinterpret an existing load. */
export function inferLoadDirection(start: Point, end: Point): 'x' | 'y' {
  return Math.abs(end.y - start.y) > Math.abs(end.x - start.x) ? 'x' : 'y';
}

export function loadDirectionLabel(direction: 'x' | 'y'): string {
  return direction === 'x' ? '水平 X · 正值向左' : '竖向 Y · 正值向下';
}
