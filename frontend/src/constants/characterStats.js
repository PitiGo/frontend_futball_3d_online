/** Mirror of game-server/physics/collisions.js CHARACTER_STATS for client visuals. */
export const CHARACTER_STATS = {
  player: { speedMultiplier: 1.35, controlRadius: 1.35, shotMultiplier: 0.85, radius: 0.5 },
  pig: { speedMultiplier: 0.82, controlRadius: 1.85, shotMultiplier: 1.3, radius: 0.58 },
  lizard: { speedMultiplier: 1.35, controlRadius: 1.35, shotMultiplier: 0.85, radius: 0.5 },
  turtle: { speedMultiplier: 0.82, controlRadius: 1.85, shotMultiplier: 1.3, radius: 0.58 },
};

export function getCharacterStats(characterType) {
  return CHARACTER_STATS[characterType] || CHARACTER_STATS.player;
}

/** Visual Y offset for player meshes (matches server collision radius). */
export function getPlayerVisualY(characterType) {
  return getCharacterStats(characterType).radius;
}
