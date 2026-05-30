/**
 * Client-side netcode helpers:
 *  - Local player: client-side prediction (instant input response) with gentle
 *    reconciliation toward the authoritative server position, snapping on large
 *    jumps (goal/kickoff resets).
 *  - Remote players + ball: entity interpolation. Snapshots are buffered and
 *    rendered ~INTERP_DELAY_MS in the past, interpolating between the two
 *    surrounding snapshots to smooth out the 20Hz network rate and jitter.
 *
 * The server stays fully authoritative; this only hides latency on the client.
 */
import {
  getCharacterStats,
  PLAYER_SPEED,
  PLAYER_ACCEL,
  PLAYER_DECEL,
  SPRINT_SPEED_MULTIPLIER,
  FIELD_WIDTH,
  FIELD_HEIGHT,
} from '../constants/characterStats';

const INTERP_DELAY_MS = 100; // Render remote entities this far in the past.
const BUFFER_TTL_MS = 1000; // Drop snapshots older than this.
const SNAP_DISTANCE = 2.5; // Above this error, snap the local player (resets).
const RECONCILE_GAIN = 4; // Per-second pull of prediction toward authoritative.
const ROTATION_LERP = 0.2;
const MOVE_EPSILON_SQ = 0.0009; // ~0.03 units; below this we don't reorient.

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Mirrors stepPlayerVelocityXZ in game-server/physics/collisions.js.
function stepVelocity(vel, targetX, targetZ, dt) {
  const moving = targetX * targetX + targetZ * targetZ > 0.01;
  const maxDelta = (moving ? PLAYER_ACCEL : PLAYER_DECEL) * dt;
  const dx = targetX - vel.x;
  const dz = targetZ - vel.z;
  const diffLen = Math.hypot(dx, dz);
  if (diffLen <= maxDelta || diffLen === 0) {
    vel.x = targetX;
    vel.z = targetZ;
  } else {
    const scale = maxDelta / diffLen;
    vel.x += dx * scale;
    vel.z += dz * scale;
  }
}

export function createPlayerSync() {
  // id -> [{ t, x, z }]
  const remoteBuffers = new Map();
  // [{ t, x, y, z }]
  let ballBuffer = [];
  // Local predicted state.
  const local = { x: 0, z: 0, vx: 0, vz: 0, initialized: false, characterType: 'player' };

  function pushBuffer(buffer, snap) {
    buffer.push(snap);
    const cutoff = snap.t - BUFFER_TTL_MS;
    while (buffer.length > 2 && buffer[0].t < cutoff) buffer.shift();
  }

  function sampleBuffer(buffer, renderTime) {
    if (buffer.length === 0) return null;
    if (buffer.length === 1 || renderTime <= buffer[0].t) {
      return buffer[0];
    }
    const last = buffer[buffer.length - 1];
    if (renderTime >= last.t) return last; // Starved: hold latest.

    for (let i = 0; i < buffer.length - 1; i += 1) {
      const a = buffer[i];
      const b = buffer[i + 1];
      if (renderTime >= a.t && renderTime <= b.t) {
        const span = b.t - a.t || 1;
        const f = (renderTime - a.t) / span;
        return {
          x: a.x + (b.x - a.x) * f,
          y: a.y != null ? a.y + ((b.y ?? a.y) - a.y) * f : undefined,
          z: a.z + (b.z - a.z) * f,
        };
      }
    }
    return last;
  }

  /** Feed an authoritative snapshot (called at network rate, ~20Hz). */
  function ingest(gameState, localId, now) {
    const { players, ballPosition } = gameState;

    if (ballPosition) {
      pushBuffer(ballBuffer, {
        t: now,
        x: ballPosition.x,
        y: ballPosition.y != null ? ballPosition.y : 0.5,
        z: ballPosition.z,
      });
    }

    if (!Array.isArray(players)) return;
    const seen = new Set();
    players.forEach((p) => {
      if (!p?.id || !p.position) return;
      seen.add(p.id);
      if (p.id === localId) {
        if (p.characterType) local.characterType = p.characterType;
        if (!local.initialized) {
          local.x = p.position.x;
          local.z = p.position.z;
          local.initialized = true;
        }
        local.authX = p.position.x;
        local.authZ = p.position.z;
      } else {
        let buf = remoteBuffers.get(p.id);
        if (!buf) {
          buf = [];
          remoteBuffers.set(p.id, buf);
        }
        pushBuffer(buf, { t: now, x: p.position.x, z: p.position.z });
      }
    });

    // Drop buffers for players no longer present.
    for (const id of remoteBuffers.keys()) {
      if (!seen.has(id)) remoteBuffers.delete(id);
    }
  }

  function setLocalCharacter(characterType) {
    if (characterType) local.characterType = characterType;
  }

  function resetLocal() {
    local.initialized = false;
    local.vx = 0;
    local.vz = 0;
  }

  /** Advance the local prediction one frame and return the predicted position. */
  function stepLocal(dt, input, frozen) {
    if (!local.initialized) return null;

    const stats = getCharacterStats(local.characterType);
    const radius = stats.radius || 0.5;

    if (frozen) {
      // Kickoff freeze: server holds players still; mirror that locally.
      local.vx = 0;
      local.vz = 0;
    } else {
      const sprinting = input.sprint && (input.x !== 0 || input.z !== 0);
      const maxSpeed = PLAYER_SPEED * stats.speedMultiplier * (sprinting ? SPRINT_SPEED_MULTIPLIER : 1);
      stepVelocity(local, input.x * maxSpeed, input.z * maxSpeed, dt);
      local.x += local.vx * dt;
      local.z += local.vz * dt;
    }

    // Field bounds (mirror server clamping).
    local.x = clamp(local.x, -FIELD_WIDTH / 2 + radius, FIELD_WIDTH / 2 - radius);
    local.z = clamp(local.z, -FIELD_HEIGHT / 2 + radius, FIELD_HEIGHT / 2 - radius);

    // Reconcile toward authoritative position.
    if (local.authX != null) {
      const ex = local.authX - local.x;
      const ez = local.authZ - local.z;
      const err = Math.hypot(ex, ez);
      if (err > SNAP_DISTANCE) {
        local.x = local.authX;
        local.z = local.authZ;
        local.vx = 0;
        local.vz = 0;
      } else {
        const k = Math.min(1, RECONCILE_GAIN * dt);
        local.x += ex * k;
        local.z += ez * k;
      }
    }

    return { x: local.x, z: local.z };
  }

  function getRemote(id, renderTime) {
    const buf = remoteBuffers.get(id);
    return buf ? sampleBuffer(buf, renderTime) : null;
  }

  function getBall(renderTime) {
    return sampleBuffer(ballBuffer, renderTime);
  }

  function reset() {
    remoteBuffers.clear();
    ballBuffer = [];
    resetLocal();
  }

  return {
    ingest,
    stepLocal,
    getRemote,
    getBall,
    setLocalCharacter,
    resetLocal,
    reset,
    constants: { INTERP_DELAY_MS, ROTATION_LERP, MOVE_EPSILON_SQ },
  };
}
