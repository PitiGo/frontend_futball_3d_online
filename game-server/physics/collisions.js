/**
 * Shared physics helpers for authoritative server simulation.
 */

export const FIELD_WIDTH = 52;
export const FIELD_HEIGHT = 39;
export const GOAL_DEPTH = 8;
export const GOAL_Z_MIN = -GOAL_DEPTH / 2;
export const GOAL_Z_MAX = GOAL_DEPTH / 2;
export const GOAL_HEIGHT = 2.44;
export const GOAL_NET_DEPTH = 2.5;
export const GOAL_POST_RADIUS = 0.10;
export const BALL_RADIUS = 0.5;

// Arquetipos espejo para equilibrar equipos:
//  - Veloces (conejo / lagarto): mucha velocidad, menos control y disparo.
//  - Potentes (cerdo / tortuga): poca velocidad, mucho control y disparo.
// Cada equipo tiene exactamente un veloz y un potente con stats idénticas a su
// contraparte del otro equipo, de modo que ningún equipo tiene ventaja.
export const CHARACTER_STATS = {
  // Mamíferos (left)
  player: { speedMultiplier: 1.35, controlRadius: 1.35, shotMultiplier: 0.85, radius: 0.5 },  // veloz
  pig: { speedMultiplier: 0.82, controlRadius: 1.85, shotMultiplier: 1.3, radius: 0.58 },      // potente
  // Reptiles (right)
  lizard: { speedMultiplier: 1.35, controlRadius: 1.35, shotMultiplier: 0.85, radius: 0.5 },   // veloz (espejo de conejo)
  turtle: { speedMultiplier: 0.82, controlRadius: 1.85, shotMultiplier: 1.3, radius: 0.58 },    // potente (espejo de cerdo)
};

export function getCharacterStats(characterType) {
  return CHARACTER_STATS[characterType] || CHARACTER_STATS.player;
}

export const BALL_CONTROL_RADIUS = 1.5;
export const STEAL_RADIUS_BONUS = 1.35;
export const PICKUP_RADIUS_BONUS = 1.25;
/** Multiplicador del alcance de tackle cuando el robador está a la espalda del portador. */
export const STEAL_BEHIND_PENALTY = 0.55;

export function getStealReach(characterType, bonus = STEAL_RADIUS_BONUS) {
  const stats = getCharacterStats(characterType);
  return (stats.controlRadius || BALL_CONTROL_RADIUS) * bonus;
}

/** Alcance de entrada al portador: robar pegado por detrás aunque el balón esté adelante. */
export function getTackleReach(stealerType, controllerType, bonus = STEAL_RADIUS_BONUS) {
  const stealReach = getStealReach(stealerType, bonus);
  const stealerR = getCharacterStats(stealerType).radius || 0.5;
  const controllerR = getCharacterStats(controllerType).radius || 0.5;
  return stealReach + stealerR + controllerR * 0.55;
}

/**
 * Dirección a la que mira el portador en XZ.
 * Preferencia: cuaternión Babylon; si no hay, el balón (que se mantiene delante).
 */
export function getControllerFacingXZ(controller, ballPosition) {
  const rot = controller?.rotation;
  if (rot && typeof rot.w === 'number') {
    const { x, y, z, w } = rot;
    // Rota el vector local +Z por el cuaternión.
    const fx = 2 * (x * z + w * y);
    const fz = 1 - 2 * (x * x + y * y);
    const len = Math.hypot(fx, fz);
    if (len > 1e-4) return { x: fx / len, z: fz / len };
  }
  if (ballPosition && controller?.position) {
    const fx = ballPosition.x - controller.position.x;
    const fz = ballPosition.z - controller.position.z;
    const len = Math.hypot(fx, fz);
    if (len > 0.08) return { x: fx / len, z: fz / len };
  }
  return { x: 0, z: 1 };
}

export function isStealerBehindController(stealer, controller, ballPosition) {
  const facing = getControllerFacingXZ(controller, ballPosition);
  const sx = stealer.position.x - controller.position.x;
  const sz = stealer.position.z - controller.position.z;
  return sx * facing.x + sz * facing.z < 0;
}

export function isWithinStealReach(stealer, controller, ballPosition, bonus = STEAL_RADIUS_BONUS) {
  const stealReach = getStealReach(stealer.characterType, bonus);
  const stealReachSq = stealReach * stealReach;
  const behind = isStealerBehindController(stealer, controller, ballPosition);

  // Contacto directo con el balón: desde atrás exige más cercanía (~70%).
  const ballReachSq = behind ? stealReachSq * 0.49 : stealReachSq;
  const bdx = ballPosition.x - stealer.position.x;
  const bdz = ballPosition.z - stealer.position.z;
  if (bdx * bdx + bdz * bdz <= ballReachSq) return true;

  // Tackle al cuerpo: desde la espalda el alcance cae ~45%.
  const cdx = controller.position.x - stealer.position.x;
  const cdz = controller.position.z - stealer.position.z;
  const tackleReach = getTackleReach(stealer.characterType, controller.characterType, bonus)
    * (behind ? STEAL_BEHIND_PENALTY : 1);
  return cdx * cdx + cdz * cdz <= tackleReach * tackleReach;
}

export const PASS_ASSIST_ANGLE_DEG = 20;
export const PASS_ASSIST_MAX_DIST = 22;

export const PLAYER_ACCEL = 28;
export const PLAYER_DECEL = 22;

/**
 * Select the teammate most closely aligned with the requested direction.
 * The server uses this both for the preview sent to clients and for the
 * authoritative release, so the indicator always matches the real pass.
 */
export function findPassTarget(
  shooterId,
  shooterTeam,
  shooterPos,
  shotDir,
  players,
  {
    maxDist = PASS_ASSIST_MAX_DIST,
    angleDeg = PASS_ASSIST_ANGLE_DEG,
    now = 0,
  } = {},
) {
  const cosThreshold = Math.cos((angleDeg * Math.PI) / 180);
  const maxDistSq = maxDist * maxDist;
  let bestDot = -1;
  let bestDistSq = Infinity;
  let bestTarget = null;

  for (const mate of players) {
    if (mate.id === shooterId || mate.team !== shooterTeam) continue;
    if (now < (mate.stunnedUntil || 0)) continue;
    const dx = mate.position.x - shooterPos.x;
    const dz = mate.position.z - shooterPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < 0.25 || distSq > maxDistSq) continue;
    const dist = Math.sqrt(distSq);
    const dot = (shotDir.x * dx + shotDir.z * dz) / dist;
    const moreAligned = dot > bestDot + 0.0001;
    const sameAlignmentAndCloser = Math.abs(dot - bestDot) <= 0.0001 && distSq < bestDistSq;
    if (dot >= cosThreshold && (moreAligned || sameAlignmentAndCloser)) {
      bestDot = dot;
      bestDistSq = distSq;
      bestTarget = {
        targetId: mate.id,
        direction: { x: dx / dist, z: dz / dist },
        distance: dist,
      };
    }
  }

  return bestTarget;
}

/**
 * Backwards-compatible direction helper. Passes now snap directly to the
 * selected teammate instead of applying the old, invisible 40% correction.
 */
export function findPassAssistDirection(...args) {
  const shotDir = args[3];
  return findPassTarget(...args)?.direction || shotDir;
}

/**
 * Pick a teammate who is meaningfully closer to the attacking goal.
 * Used by bots to progress play instead of blindly dribbling from deep.
 */
export function findAdvancedTeammate(
  passerId,
  passerTeam,
  passerPos,
  goalX,
  players,
  {
    maxDist = PASS_ASSIST_MAX_DIST,
    minGoalGain = 4,
    now = 0,
  } = {},
) {
  const passerGoalDistance = Math.hypot(goalX - passerPos.x, passerPos.z);
  const maxDistSq = maxDist * maxDist;
  let best = null;
  let bestScore = -Infinity;

  for (const mate of players) {
    if (mate.id === passerId || mate.team !== passerTeam) continue;
    if (now < (mate.stunnedUntil || 0)) continue;

    const dx = mate.position.x - passerPos.x;
    const dz = mate.position.z - passerPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < 1 || distSq > maxDistSq) continue;

    const distance = Math.sqrt(distSq);
    const mateGoalDistance = Math.hypot(goalX - mate.position.x, mate.position.z);
    const goalGain = passerGoalDistance - mateGoalDistance;
    if (goalGain < minGoalGain) continue;

    // Prioritize real territorial gain, using pass length as a tie-breaker.
    const score = goalGain * 2 - distance * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = {
        targetId: mate.id,
        direction: { x: dx / distance, z: dz / distance },
        distance,
        goalGain,
      };
    }
  }

  return best;
}

/** Ease player velocity toward target on the XZ plane (arcade inertia). */
export function stepPlayerVelocityXZ(
  velocity,
  targetX,
  targetZ,
  dt,
  { accel = PLAYER_ACCEL, decel = PLAYER_DECEL } = {},
) {
  const moving = targetX * targetX + targetZ * targetZ > 0.01;
  const maxDelta = (moving ? accel : decel) * dt;
  const dx = targetX - velocity.x;
  const dz = targetZ - velocity.z;
  const diffLen = Math.hypot(dx, dz);

  if (diffLen <= maxDelta || diffLen === 0) {
    velocity.x = targetX;
    velocity.z = targetZ;
  } else {
    const scale = maxDelta / diffLen;
    velocity.x += dx * scale;
    velocity.z += dz * scale;
  }
  velocity.y = 0;
}

/** Goal post centers in world XZ (matches client goalWidth=GOAL_DEPTH, posts at ±GOAL_DEPTH/2 on Z). */
export function getGoalPosts() {
  const goalX = FIELD_WIDTH / 2;
  const postZ = GOAL_DEPTH / 2;
  return [
    { x: -goalX, z: -postZ, r: GOAL_POST_RADIUS },
    { x: -goalX, z: postZ, r: GOAL_POST_RADIUS },
    { x: goalX, z: -postZ, r: GOAL_POST_RADIUS },
    { x: goalX, z: postZ, r: GOAL_POST_RADIUS },
  ];
}

/**
 * Circle-circle collision between ball and a vertical goal post.
 * Mutates ballPosition and ballVelocity in place.
 * @returns {boolean} true if a collision was resolved
 */
export function resolveBallPostCollision(ballPosition, ballVelocity, post, restitution = 0.6) {
  const combinedRadius = BALL_RADIUS + post.r;
  const dx = ballPosition.x - post.x;
  const dz = ballPosition.z - post.z;
  const distSq = dx * dx + dz * dz;

  if (distSq >= combinedRadius * combinedRadius || distSq === 0) {
    return false;
  }

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const nz = dz / dist;

  ballPosition.x = post.x + nx * combinedRadius;
  ballPosition.z = post.z + nz * combinedRadius;

  const velDotN = ballVelocity.x * nx + ballVelocity.z * nz;
  if (velDotN < 0) {
    ballVelocity.x -= (1 + restitution) * velDotN * nx;
    ballVelocity.z -= (1 + restitution) * velDotN * nz;
  }

  return true;
}

/** Apply collisions against all four goal posts. */
export function resolveBallGoalPostCollisions(ballPosition, ballVelocity, restitution = 0.6) {
  let hit = false;
  for (const post of getGoalPosts()) {
    if (resolveBallPostCollision(ballPosition, ballVelocity, post, restitution)) {
      hit = true;
    }
  }
  return hit;
}

/** Returns true when the ball crossed the goal line inside the frame. */
export function isBallInGoal(ballPosition) {
  if (Math.abs(ballPosition.x) < FIELD_WIDTH / 2 - BALL_RADIUS) return false;
  const inGoalWidth = ballPosition.z >= GOAL_Z_MIN && ballPosition.z <= GOAL_Z_MAX;
  const inGoalHeight = ballPosition.y < GOAL_HEIGHT;
  return inGoalWidth && inGoalHeight;
}
