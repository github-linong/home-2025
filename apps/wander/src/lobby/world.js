import { randomBytes } from "node:crypto";

export const PLAYER_COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#46f0f0", "#f032e6", "#bcf60c", "#008080", "#9a6324",
  "#800000", "#aaffc3", "#808000", "#000075", "#ffe119",
];

export function pickColor(usedColors) {
  const free = PLAYER_COLORS.find((c) => !usedColors.has(c));
  return free ?? `#${randomBytes(3).toString("hex")}`;
}

/** Clamp integer coordinates into the current [0, w-1] x [0, h-1] bounds. */
export function clampToWorld(x, y, world) {
  const nx = Math.max(0, Math.min(world.w - 1, Math.trunc(x)));
  const ny = Math.max(0, Math.min(world.h - 1, Math.trunc(y)));
  return { x: nx, y: ny };
}

export const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  // Diagonals — added so the grid supports smooth 8-directional movement.
  // dx/dy are still unit steps; clampToWorld keeps each axis in bounds, so a
  // diagonal into a wall slides along the free axis instead of stalling.
  "up-left": { dx: -1, dy: -1 },
  "up-right": { dx: 1, dy: -1 },
  "down-left": { dx: -1, dy: 1 },
  "down-right": { dx: 1, dy: 1 },
};

export function isDir(d) {
  return Object.prototype.hasOwnProperty.call(DIRS, d);
}

/**
 * Server-authoritative discrete grid step.
 * - `facing` always updates to the requested direction (so turning against a
 *   wall still faces that way).
 * - `x`/`y` only change when the target cell is inside the current world.
 * Returns { moved, player, error? }.
 */
export function stepPlayer(player, dir, world) {
  const d = DIRS[dir];
  if (!d) return { moved: false, player, error: "INVALID_DIR" };
  const target = clampToWorld(player.x + d.dx, player.y + d.dy, world);
  const moved = target.x !== player.x || target.y !== player.y;
  player.facing = dir;
  if (moved) {
    player.x = target.x;
    player.y = target.y;
    player.lastMoveAt = Date.now();
  }
  return { moved, player };
}
