import { describe, expect, it } from 'vitest';
import { baseScale, defaultViewport, fitViewport, initialViewport } from './viewport';

describe('model viewport fitting', () => {
  it('restores a conventional 100% origin for an empty canvas', () => {
    expect(fitViewport([], 800)).toEqual({ center: { x: 3, y: 0 }, zoom: 1, originY: 225 });
  });
  it.each([
    [{ x: 999, y: -990 }, { x: 999, y: -980 }],
    [{ x: -1000, y: -1000 }, { x: 1000, y: 1000 }],
    [{ x: -940, y: 820 }, { x: -925, y: 820 }],
  ])('fits distant vertical, diagonal, and horizontal coordinates without moving geometry: %j', (...nodes) => {
    const before = structuredClone(nodes);
    for (const width of [480, 800, 1200]) {
      const view = fitViewport(nodes, width), scale = baseScale(width) * view.zoom;
      for (const n of nodes) {
        const x = width / 2 + (n.x - view.center.x) * scale;
        const y = view.originY - (n.y - view.center.y) * scale;
        expect(x).toBeGreaterThanOrEqual(99);
        expect(x).toBeLessThanOrEqual(width - 99);
        expect(y).toBeGreaterThanOrEqual(149);
        expect(y).toBeLessThanOrEqual(285);
      }
    }
    expect(nodes).toEqual(before);
  });
  it('uses the measured width rather than a fixed initial width', () => {
    const nodes = [{ x: 20, y: 0 }, { x: 30, y: 0 }];
    const narrow = fitViewport(nodes, 480), wide = fitViewport(nodes, 1200);
    expect(baseScale(480) * narrow.zoom * 10).toBeCloseTo(280);
    expect(baseScale(1200) * wide.zoom * 10).toBeCloseTo(1000);
  });
  it('keeps classic beam insertion coordinates and fits a spatial draft on opening', () => {
    expect(initialViewport([{ x: 0, y: 0 }, { x: 6, y: 0 }], 800)).toEqual(defaultViewport());
    const nodes = [{ x: 12, y: 14 }, { x: 18, y: 22 }];
    expect(initialViewport(nodes, 650)).toEqual(fitViewport(nodes, 650));
  });
});
