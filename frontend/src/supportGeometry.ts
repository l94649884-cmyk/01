import type { BeamModel } from './model';

/** The unrotated fixed symbol sits left of a member that extends to the right. */
export function fixedSupportRotation(model: Pick<BeamModel, 'nodes' | 'members'>, nodeId: string): number {
  const node = model.nodes.find(n => n.id === nodeId);
  if (!node) return 0;
  let dx = 0, dy = 0, connected = 0;
  for (const member of model.members) {
    const otherId = member.start === nodeId ? member.end : member.end === nodeId ? member.start : null;
    const other = otherId ? model.nodes.find(n => n.id === otherId) : undefined;
    if (!other) continue;
    const x = other.x - node.x, y = other.y - node.y, length = Math.hypot(x, y);
    if (length < 1e-8) continue;
    dx += x / length; dy += y / length; connected++;
  }
  if (!connected) return 0;
  // Opposite members have no unique outer side; use a foundation below the node.
  if (Math.hypot(dx, dy) < 1e-8) return -90;
  return -Math.atan2(dy, dx) * 180 / Math.PI;
}
