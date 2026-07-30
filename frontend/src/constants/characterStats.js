/** Mirror of game-server/physics/collisions.js for client visuals. */
export const STEAL_RADIUS_BONUS = 1.35;
export const PICKUP_RADIUS_BONUS = 1.25;
export const BALL_CONTROL_RADIUS = 1.5;
export const STEAL_BEHIND_PENALTY = 0.55;

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

export function getStealReach(characterType, bonus = STEAL_RADIUS_BONUS) {
  const stats = getCharacterStats(characterType);
  return (stats.controlRadius || BALL_CONTROL_RADIUS) * bonus;
}

export function getStealRadius(characterType) {
  return getStealReach(characterType);
}

export function getPickupRadius(characterType) {
  const stats = getCharacterStats(characterType);
  return (stats.controlRadius || BALL_CONTROL_RADIUS) * PICKUP_RADIUS_BONUS;
}

export function getTackleReach(stealerType, controllerType, bonus = STEAL_RADIUS_BONUS) {
  const stealReach = getStealReach(stealerType, bonus);
  const stealerR = getCharacterStats(stealerType).radius || 0.5;
  const controllerR = getCharacterStats(controllerType).radius || 0.5;
  return stealReach + stealerR + controllerR * 0.55;
}

/** El balón se mantiene delante del portador: si no hay rotación, sirve como facing. */
export function getControllerFacingXZ(controllerPos, ballPos) {
  const fx = ballPos.x - controllerPos.x;
  const fz = ballPos.z - controllerPos.z;
  const len = Math.hypot(fx, fz);
  if (len > 0.08) return { x: fx / len, z: fz / len };
  return { x: 0, z: 1 };
}

export function isStealerBehindController(stealerPos, controllerPos, ballPos) {
  const facing = getControllerFacingXZ(controllerPos, ballPos);
  const sx = stealerPos.x - controllerPos.x;
  const sz = stealerPos.z - controllerPos.z;
  return sx * facing.x + sz * facing.z < 0;
}

export function isWithinStealReach(stealerPos, stealerType, controllerPos, controllerType, ballPos) {
  const stealReach = getStealReach(stealerType);
  const stealReachSq = stealReach * stealReach;
  const behind = isStealerBehindController(stealerPos, controllerPos, ballPos);

  const ballReachSq = behind ? stealReachSq * 0.49 : stealReachSq;
  const bdx = ballPos.x - stealerPos.x;
  const bdz = ballPos.z - stealerPos.z;
  if (bdx * bdx + bdz * bdz <= ballReachSq) return true;

  const cdx = controllerPos.x - stealerPos.x;
  const cdz = controllerPos.z - stealerPos.z;
  const tackleReach = getTackleReach(stealerType, controllerType)
    * (behind ? STEAL_BEHIND_PENALTY : 1);
  return cdx * cdx + cdz * cdz <= tackleReach * tackleReach;
}

/** Visual Y offset for player meshes (matches server collision radius). */
export function getPlayerVisualY(characterType) {
  return getCharacterStats(characterType).radius;
}
