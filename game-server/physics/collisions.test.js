import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBallPostCollision,
  resolveBallGoalPostCollisions,
  isBallInGoal,
  getCharacterStats,
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
