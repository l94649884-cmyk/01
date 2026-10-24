type Point = { x: number; y: number };
export type Viewport = { center: Point; zoom: number; originY: number };

export const baseScale = (width: number) => Math.max(25, Math.min(95, (width - 140) / 8));
export const defaultViewport = (height = 384): Viewport => ({ center: { x: 3, y: 0 }, zoom: 1, originY: 225 + (height - 384) / 2 });

/** Fit node coordinates with space for supports, load arrows, and the canvas toolbar. */
export function fitViewport(nodes: readonly Point[], width: number, height = 384): Viewport {
  if (!nodes.length) return defaultViewport(height);
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanY = maxY - minY;
  const horizontalZoom = Math.max(32, width - 200) / (Math.max(3, maxX - minX) * baseScale(width));
  const verticalZoom = spanY > 1e-8 ? Math.max(40, height - 250) / (spanY * baseScale(width)) : 3;
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    zoom: Math.min(3, horizontalZoom, verticalZoom),
    originY: spanY > 1e-8 ? (150 + height - 100) / 2 : 225 + (height - 384) / 2,
  };
}

/** Keep the familiar origin for small horizontal drafts; fit imported spatial models. */
export function initialViewport(nodes: readonly Point[], width: number, height = 384): Viewport {
  return nodes.every(n => Math.abs(n.y) < 1e-8 && n.x >= 0 && n.x <= 7)
    ? defaultViewport(height)
    : fitViewport(nodes, width, height);
}
