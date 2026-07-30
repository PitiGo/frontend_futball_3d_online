import { getCharacterStats } from '../constants/characterStats';
import { playKick } from '../services/sound';

// Mirror of game-server release constants (keep in sync with server.js).
const BALL_RELEASE_MIN = 13;
const BALL_RELEASE_MAX = 22;
const PASS_RELEASE_MIN = 8;
const PASS_RELEASE_MAX = 19;
const PASS_SPEED_PER_UNIT = 0.9;
const BALL_RADIUS = 0.5;
const FRICTION = 0.98;
const FRICTION_COOLDOWN_MS = 320;
const PREDICTION_MAX_MS = 900;
const RECONCILE_BLEND = 0.35;
const RECONCILE_DONE_DIST_SQ = 1.2 * 1.2;

function normalizeXZ(x, z) {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 1 };
  return { x: x / len, z: z / len };
}

function releaseSpeed({ shotCharge, passDistance, characterType, isPass }) {
  const stats = getCharacterStats(characterType);
  if (isPass && Number.isFinite(passDistance)) {
    return Math.max(
      PASS_RELEASE_MIN,
      Math.min(PASS_RELEASE_MAX, passDistance * PASS_SPEED_PER_UNIT),
    );
  }
  const charge = Math.max(0, Math.min(1, Number(shotCharge) || 0));
  return (BALL_RELEASE_MIN + (BALL_RELEASE_MAX - BALL_RELEASE_MIN) * charge)
    * (stats.shotMultiplier || 1);
}

/**
 * Arranca predicción local del disparo/pase al soltar la acción.
 * Devuelve true si se activó.
 */
export function beginPredictedRelease({
  predictedKickRef,
  releaseIntentRef,
  controllingPlayerIdRef,
  ballRef,
  playersRef,
  playerMetaRef,
  socketId,
  fxRef,
  chargeContainerRef,
  controlEffectsRef,
}) {
  if (!predictedKickRef || !socketId) return false;
  if (predictedKickRef.current?.active) return false;
  if (controllingPlayerIdRef?.current !== socketId) return false;

  const intent = releaseIntentRef?.current;
  const dirIn = intent?.direction;
  if (!dirIn || !Number.isFinite(dirIn.x) || !Number.isFinite(dirIn.z)) return false;

  const ball = ballRef?.current;
  if (!ball) return false;

  const characterType = intent.characterType
    || playerMetaRef?.current?.[socketId]?.characterType
    || 'player';
  const stats = getCharacterStats(characterType);
  const dir = normalizeXZ(dirIn.x, dirIn.z);

  let passDistance = null;
  const passTargetId = intent.passTargetId || null;
  if (passTargetId && playersRef?.current?.[passTargetId] && playersRef.current[socketId]) {
    const from = playersRef.current[socketId].position;
    const to = playersRef.current[passTargetId].position;
    passDistance = Math.hypot(to.x - from.x, to.z - from.z);
  }

  const speed = releaseSpeed({
    shotCharge: intent.shotCharge,
    passDistance,
    characterType,
    isPass: !!passTargetId,
  });

  const sep = (stats.radius || 0.5) + BALL_RADIUS + 0.8;
  const startX = (ball.netTarget?.x ?? ball.position.x) + dir.x * sep;
  const startZ = (ball.netTarget?.z ?? ball.position.z) + dir.z * sep;
  const startY = BALL_RADIUS;

  predictedKickRef.current = {
    active: true,
    startedAt: performance.now(),
    x: startX,
    y: startY,
    z: startZ,
    vx: dir.x * speed,
    vz: dir.z * speed,
  };

  if (controllingPlayerIdRef) controllingPlayerIdRef.current = null;

  ball.position.set(startX, startY, startZ);
  ball.netTarget = { x: startX, y: startY, z: startZ };

  if (chargeContainerRef?.current) {
    chargeContainerRef.current.style.display = 'none';
  }
  if (controlEffectsRef?.current) {
    const fx = controlEffectsRef.current;
    fx.aimDirection = null;
    fx.passTargetId = null;
    fx.aimArrowRoot?.setEnabled(false);
    fx.setPassAim?.(false);
    if (fx.passTargetRing) fx.passTargetRing.isVisible = false;
    if (fx.passTargetLabel) fx.passTargetLabel.isVisible = false;
    if (fx.ballHalo) fx.ballHalo.isVisible = false;
    if (fx.controlRing) fx.controlRing.isVisible = false;
    if (fx.controlTimeText) fx.controlTimeText.isVisible = false;
    if (fx.controlPlayerNameText) fx.controlPlayerNameText.isVisible = false;
    fx.stopParticles?.();
  }

  playKick();
  fxRef?.current?.kickBurst?.({ x: startX, y: startY, z: startZ });
  fxRef?.current?.shakeCamera?.(0.1 + Math.min(1, speed / 22) * 0.12);

  return true;
}

/** Integra la predicción un frame (fricción alineada al servidor tras cooldown). */
export function stepPredictedRelease(predicted, dtSec) {
  if (!predicted?.active) return predicted;
  const elapsed = performance.now() - predicted.startedAt;
  if (elapsed > PREDICTION_MAX_MS) {
    predicted.active = false;
    return predicted;
  }

  if (elapsed >= FRICTION_COOLDOWN_MS) {
    const factor = FRICTION ** (dtSec / (1 / 60));
    predicted.vx *= factor;
    predicted.vz *= factor;
  }

  predicted.x += predicted.vx * dtSec;
  predicted.z += predicted.vz * dtSec;
  predicted.y = BALL_RADIUS;
  return predicted;
}

/**
 * Reconcilia predicción con el estado del servidor.
 * @returns {boolean} true si la predicción sigue activa
 */
export function reconcilePredictedRelease(predicted, {
  selfId,
  controllingPlayerId,
  ballPosition,
}) {
  if (!predicted?.active) return false;

  const elapsed = performance.now() - predicted.startedAt;
  if (elapsed > PREDICTION_MAX_MS) {
    predicted.active = false;
    return false;
  }

  // Paquetes viejos: el servidor aún cree que controlamos → ignorar posesión local.
  if (controllingPlayerId === selfId) {
    return true;
  }

  // Otro jugador tomó el balón → cortar predicción.
  if (controllingPlayerId && controllingPlayerId !== selfId) {
    predicted.active = false;
    return false;
  }

  // Servidor ya soltó: acercar predicción al estado autoritativo.
  if (ballPosition && Number.isFinite(ballPosition.x) && Number.isFinite(ballPosition.z)) {
    const dx = ballPosition.x - predicted.x;
    const dz = ballPosition.z - predicted.z;
    const distSq = dx * dx + dz * dz;

    // Teleport enorme (saque/gol): abandonar predicción.
    if (distSq > 36) {
      predicted.active = false;
      return false;
    }

    predicted.x += dx * RECONCILE_BLEND;
    predicted.z += dz * RECONCILE_BLEND;

    if (distSq < RECONCILE_DONE_DIST_SQ && elapsed > 120) {
      predicted.active = false;
      return false;
    }
  }

  return true;
}
