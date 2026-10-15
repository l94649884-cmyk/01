import { describe, expect, it } from 'vitest';
import { inferLoadDirection } from './loadDirection';

describe('new load direction suggestion', () => {
  it.each([
    [{ x: 0, y: 0 }, { x: 6, y: 0 }, 'y'],
    [{ x: 0, y: 0 }, { x: 0, y: 3 }, 'x'],
    [{ x: 3, y: 4 }, { x: 4, y: 8 }, 'x'],
    [{ x: 3, y: 4 }, { x: 8, y: 5 }, 'y'],
    [{ x: 3, y: 4 }, { x: 0, y: 1 }, 'y'],
  ] as const)('suggests a global axis from member orientation, including a vertical tie rule', (a, b, expected) => {
    expect(inferLoadDirection(a, b)).toBe(expected);
    expect(inferLoadDirection(b, a)).toBe(expected);
  });
});
