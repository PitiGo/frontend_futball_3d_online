/** Mirror of game-server/physics/collisions.js CHARACTER_STATS for client visuals. */
export const CHARACTER_STATS = {
  player: { speedMultiplier: 1.15, controlRadius: 1.5, shotMultiplier: 1.0, radius: 0.5 },
  pig: { speedMultiplier: 0.95, controlRadius: 1.6, shotMultiplier: 1.2, radius: 0.55 },
  lizard: { speedMultiplier: 1.05, controlRadius: 1.4, shotMultiplier: 1.05, radius: 0.48 },
  turtle: { speedMultiplier: 0.85, controlRadius: 1.7, shotMultiplier: 0.9, radius: 0.58 },
};

export function getCharacterStats(characterType) {
  return CHARACTER_STATS[characterType] || CHARACTER_STATS.player;
}

// --- Movement constants mirrored from game-server/server.js + physics/collisions.js.
// Used for client-side prediction of the local player. Keep in sync with the server.
export const PLAYER_SPEED = 5;
export const PLAYER_ACCEL = 28;
export const PLAYER_DECEL = 22;
export const SPRINT_SPEED_MULTIPLIER = 1.55;
export const FIELD_WIDTH = 40;
export const FIELD_HEIGHT = 30;

/** Visual Y offset for player meshes (matches server collision radius). */
export function getPlayerVisualY(characterType) {
  return getCharacterStats(characterType).radius;
}
