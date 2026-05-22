/**
 * Shared physics helpers for authoritative server simulation.
 */

export const FIELD_WIDTH = 40;
export const FIELD_HEIGHT = 30;
export const GOAL_DEPTH = 7;
export const GOAL_Z_MIN = -GOAL_DEPTH / 2;
export const GOAL_Z_MAX = GOAL_DEPTH / 2;
export const GOAL_HEIGHT = 2.44;
export const GOAL_NET_DEPTH = 2.5;
export const GOAL_POST_RADIUS = 0.10;
export const BALL_RADIUS = 0.5;

export const CHARACTER_STATS = {
  player: { speedMultiplier: 1.15, controlRadius: 1.5, shotMultiplier: 1.0, radius: 0.5 },
  pig: { speedMultiplier: 0.95, controlRadius: 1.6, shotMultiplier: 1.2, radius: 0.55 },
  lizard: { speedMultiplier: 1.05, controlRadius: 1.4, shotMultiplier: 1.05, radius: 0.48 },
  turtle: { speedMultiplier: 0.85, controlRadius: 1.7, shotMultiplier: 0.9, radius: 0.58 },
};

export function getCharacterStats(characterType) {
  return CHARACTER_STATS[characterType] || CHARACTER_STATS.player;
}

export const PASS_ASSIST_ANGLE_DEG = 20;
export const PASS_ASSIST_MAX_DIST = 22;
export const PASS_ASSIST_BLEND = 0.4;

export const PLAYER_ACCEL = 28;
export const PLAYER_DECEL = 22;

/**
 * Blend shot direction toward a nearby teammate inside the pass cone.
 * @returns {{ x: number, z: number }} normalized XZ direction
 */
export function findPassAssistDirection(
  shooterId,
  shooterTeam,
  shooterPos,
  shotDir,
  players,
  {
    maxDist = PASS_ASSIST_MAX_DIST,
    angleDeg = PASS_ASSIST_ANGLE_DEG,
    blend = PASS_ASSIST_BLEND,
  } = {},
) {
  const cosThreshold = Math.cos((angleDeg * Math.PI) / 180);
  const maxDistSq = maxDist * maxDist;
  let bestDot = -1;
  let bestDir = null;

  for (const mate of players) {
    if (mate.id === shooterId || mate.team !== shooterTeam) continue;
    const dx = mate.position.x - shooterPos.x;
    const dz = mate.position.z - shooterPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < 0.25 || distSq > maxDistSq) continue;
    const dist = Math.sqrt(distSq);
    const dot = (shotDir.x * dx + shotDir.z * dz) / dist;
    if (dot >= cosThreshold && dot > bestDot) {
      bestDot = dot;
      bestDir = { x: dx / dist, z: dz / dist };
    }
  }

  if (!bestDir) return shotDir;

  const bx = shotDir.x + (bestDir.x - shotDir.x) * blend;
  const bz = shotDir.z + (bestDir.z - shotDir.z) * blend;
  const len = Math.hypot(bx, bz);
  if (len < 0.001) return shotDir;
  return { x: bx / len, z: bz / len };
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

/** Goal post centers in world XZ (matches client goalWidth=7, posts at ±3.5 on Z). */
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
