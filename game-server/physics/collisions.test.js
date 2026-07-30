import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBallPostCollision,
  resolveBallGoalPostCollisions,
  isBallInGoal,
  getCharacterStats,
  findPassAssistDirection,
  findPassTarget,
  findAdvancedTeammate,
  stepPlayerVelocityXZ,
  isWithinStealReach,
  FIELD_WIDTH,
  BALL_RADIUS,
} from './collisions.js';

test('resolveBallPostCollision pushes ball out of post', () => {
  const pos = { x: -FIELD_WIDTH / 2 + 0.05, y: 0.5, z: -3.5 };
  const vel = { x: -2, y: 0, z: 0 };
  const post = { x: -FIELD_WIDTH / 2, z: -3.5, r: 0.10 };

  const hit = resolveBallPostCollision(pos, vel, post, 0.6);
  assert.equal(hit, true);
  const dist = Math.hypot(pos.x - post.x, pos.z - post.z);
  assert.ok(dist >= BALL_RADIUS + post.r - 0.001);
  assert.ok(vel.x > -2);
});

test('resolveBallGoalPostCollisions handles multiple posts', () => {
  const pos = { x: FIELD_WIDTH / 2 - 0.02, y: 0.5, z: 3.5 };
  const vel = { x: 3, y: 0, z: 0 };
  const hit = resolveBallGoalPostCollisions(pos, vel);
  assert.equal(hit, true);
});

test('isBallInGoal detects scoring position', () => {
  assert.equal(isBallInGoal({ x: FIELD_WIDTH / 2, y: 0.5, z: 0 }), true);
  assert.equal(isBallInGoal({ x: FIELD_WIDTH / 2, y: 0.5, z: 10 }), false);
});

test('getCharacterStats falls back to player defaults', () => {
  const stats = getCharacterStats('unknown');
  assert.equal(stats.speedMultiplier, getCharacterStats('player').speedMultiplier);
});

test('findPassAssistDirection points directly toward teammate in cone', () => {
  const dir = findPassAssistDirection(
    'a',
    'left',
    { x: 0, y: 0, z: 0 },
    { x: 1, z: 0 },
    [
      { id: 'a', team: 'left', position: { x: 0, y: 0.5, z: 0 } },
      { id: 'b', team: 'left', position: { x: 10, y: 0.5, z: 1 } },
    ],
  );
  const expectedLength = Math.hypot(10, 1);
  assert.ok(Math.abs(dir.x - 10 / expectedLength) < 0.0001);
  assert.ok(Math.abs(dir.z - 1 / expectedLength) < 0.0001);
});

test('findPassAssistDirection ignores opponents', () => {
  const dir = findPassAssistDirection(
    'a',
    'left',
    { x: 0, y: 0, z: 0 },
    { x: 1, z: 0 },
    [
      { id: 'a', team: 'left', position: { x: 0, y: 0.5, z: 0 } },
      { id: 'x', team: 'right', position: { x: 10, y: 0.5, z: 0 } },
    ],
  );
  assert.equal(dir.x, 1);
  assert.equal(dir.z, 0);
});

test('findPassTarget chooses the most aligned teammate and returns its id', () => {
  const target = findPassTarget(
    'a',
    'left',
    { x: 0, y: 0.5, z: 0 },
    { x: 1, z: 0 },
    [
      { id: 'a', team: 'left', position: { x: 0, y: 0.5, z: 0 } },
      { id: 'near', team: 'left', position: { x: 6, y: 0.5, z: 1 } },
      { id: 'aligned', team: 'left', position: { x: 12, y: 0.5, z: 0.2 } },
    ],
  );

  assert.equal(target.targetId, 'aligned');
  assert.ok(target.distance > 12);
});

test('findPassTarget ignores teammates outside cone or maximum distance', () => {
  const target = findPassTarget(
    'a',
    'left',
    { x: 0, y: 0.5, z: 0 },
    { x: 1, z: 0 },
    [
      { id: 'wide', team: 'left', position: { x: 5, y: 0.5, z: 5 } },
      { id: 'far', team: 'left', position: { x: 23, y: 0.5, z: 0 } },
    ],
  );

  assert.equal(target, null);
});

test('findPassTarget ignores stunned teammates', () => {
  const target = findPassTarget(
    'a',
    'left',
    { x: 0, y: 0.5, z: 0 },
    { x: 1, z: 0 },
    [
      {
        id: 'stunned',
        team: 'left',
        position: { x: 8, y: 0.5, z: 0 },
        stunnedUntil: 5000,
      },
    ],
    { now: 1000 },
  );

  assert.equal(target, null);
});

test('findAdvancedTeammate selects a teammate with meaningful goal progress', () => {
  const target = findAdvancedTeammate(
    'carrier',
    'left',
    { x: -15, y: 0.5, z: 0 },
    FIELD_WIDTH / 2,
    [
      { id: 'carrier', team: 'left', position: { x: -15, y: 0.5, z: 0 } },
      { id: 'sideways', team: 'left', position: { x: -14, y: 0.5, z: 8 } },
      { id: 'advanced', team: 'left', position: { x: -4, y: 0.5, z: 2 } },
    ],
  );

  assert.equal(target.targetId, 'advanced');
  assert.ok(target.goalGain >= 4);
});

test('findAdvancedTeammate rejects teammates without enough progress', () => {
  const target = findAdvancedTeammate(
    'carrier',
    'right',
    { x: 4, y: 0.5, z: 0 },
    -FIELD_WIDTH / 2,
    [
      { id: 'carrier', team: 'right', position: { x: 4, y: 0.5, z: 0 } },
      { id: 'level', team: 'right', position: { x: 2, y: 0.5, z: 3 } },
      { id: 'behind', team: 'right', position: { x: 8, y: 0.5, z: 0 } },
    ],
  );

  assert.equal(target, null);
});

test('stepPlayerVelocityXZ eases toward target speed', () => {
  const vel = { x: 0, y: 0, z: 0 };
  stepPlayerVelocityXZ(vel, 5, 0, 1 / 60);
  assert.ok(vel.x > 0 && vel.x < 5);
  assert.equal(vel.y, 0);
});

test('isWithinStealReach allows frontal tackle when pressing the carrier', () => {
  const stealer = { characterType: 'player', position: { x: 0, z: 1.2 } };
  const controller = {
    characterType: 'player',
    position: { x: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 }, // mirando +Z
  };
  const ball = { x: 0, z: 1.05 };

  assert.equal(isWithinStealReach(stealer, controller, ball), true);
});

test('isWithinStealReach requires closer contact from behind', () => {
  const controller = {
    characterType: 'player',
    position: { x: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 }, // mirando +Z
  };
  const ball = { x: 0, z: 1.05 };

  // A ~1.8u por detrás: antes entraba; ahora la penalización lo niega.
  const farBehind = { characterType: 'player', position: { x: 0, z: -1.8 } };
  assert.equal(isWithinStealReach(farBehind, controller, ball), false);

  // Pegado a la espalda: sigue siendo válido.
  const closeBehind = { characterType: 'player', position: { x: 0, z: -0.9 } };
  assert.equal(isWithinStealReach(closeBehind, controller, ball), true);
});

test('isWithinStealReach still requires real proximity to ball or carrier', () => {
  const stealer = { characterType: 'player', position: { x: 0, z: -6 } };
  const controller = { characterType: 'player', position: { x: 0, z: 0 } };
  const ball = { x: 0, z: 1.05 };

  assert.equal(isWithinStealReach(stealer, controller, ball), false);
});
