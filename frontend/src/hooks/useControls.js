import { useCallback, useEffect, useRef } from 'react';

const KEEPALIVE_MS = 500;
const MOVEMENT_EMIT_MIN_MS = 50;
const VECTOR_EPSILON = 0.05;

const vectorsApproximatelyEqual = (a, b, epsilon = VECTOR_EPSILON) =>
  Math.abs(a.x - b.x) < epsilon && Math.abs(a.z - b.z) < epsilon;

/**
 * Keyboard + keepalive movement for the local player.
 */
export function useControls({ socketRef, gameStarted, isConnected, chatInputFocusRef }) {
  const keysPressed = useRef({ up: false, down: false, left: false, right: false });
  const joystickMoveRef = useRef({ x: 0, z: 0 });
  const lastEmittedMoveRef = useRef({ x: 0, z: 0 });
  const lastEmitTimeRef = useRef(0);
  const gameStartedRef = useRef(gameStarted);

  useEffect(() => {
    gameStartedRef.current = gameStarted;
  }, [gameStarted]);

  const sendMovement = useCallback(() => {
    if (!socketRef.current || !gameStartedRef.current) return;

    let moveX = 0;
    let moveZ = 0;
    if (keysPressed.current.up) moveZ += 1;
    if (keysPressed.current.down) moveZ -= 1;
    if (keysPressed.current.left) moveX -= 1;
    if (keysPressed.current.right) moveX += 1;
    moveX += joystickMoveRef.current.x;
    moveZ += joystickMoveRef.current.z;

    const length = Math.hypot(moveX, moveZ);
    const move = length > 0 ? { x: moveX / length, z: moveZ / length } : { x: 0, z: 0 };

    const now = performance.now();
    const vectorChanged = !vectorsApproximatelyEqual(move, lastEmittedMoveRef.current);
    const shouldEmit =
      (vectorChanged && now - lastEmitTimeRef.current > MOVEMENT_EMIT_MIN_MS) ||
      now - lastEmitTimeRef.current > KEEPALIVE_MS;

    if (shouldEmit) {
      socketRef.current.volatile.emit('playerMove', move);
      lastEmittedMoveRef.current = move;
      lastEmitTimeRef.current = now;
    }
  }, [socketRef]);

  const handleDirectionChange = useCallback(
    (direction) => {
      if (!gameStartedRef.current) return;
      let moveVector = { x: 0, z: 0 };
      if (typeof direction === 'string') {
        switch (direction) {
          case 'up': moveVector.z = 1; break;
          case 'down': moveVector.z = -1; break;
          case 'left': moveVector.x = -1; break;
          case 'right': moveVector.x = 1; break;
          default: break;
        }
      } else if (
        direction &&
        typeof direction.x === 'number' &&
        typeof direction.z === 'number'
      ) {
        moveVector = { x: direction.x, z: direction.z };
      }
      joystickMoveRef.current = moveVector;
      sendMovement();
    },
    [sendMovement]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (chatInputFocusRef.current) return;
      if (!socketRef.current || !isConnected || !gameStartedRef.current) return;

      let keyChanged = false;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          if (!keysPressed.current.up) { keysPressed.current.up = true; keyChanged = true; }
          break;
        case 's':
        case 'arrowdown':
          if (!keysPressed.current.down) { keysPressed.current.down = true; keyChanged = true; }
          break;
        case 'a':
        case 'arrowleft':
          if (!keysPressed.current.left) { keysPressed.current.left = true; keyChanged = true; }
          break;
        case 'd':
        case 'arrowright':
          if (!keysPressed.current.right) { keysPressed.current.right = true; keyChanged = true; }
          break;
        case ' ':
          // ballControl must stay non-volatile — possession start/end must not be dropped.
          socketRef.current.emit('ballControl', { control: true });
          break;
        default:
          break;
      }
      if (keyChanged) sendMovement();
    },
    [chatInputFocusRef, isConnected, sendMovement, socketRef]
  );

  const handleKeyUp = useCallback(
    (e) => {
      if (chatInputFocusRef.current) return;
      if (!socketRef.current || !isConnected) return;

      let keyChanged = false;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          if (keysPressed.current.up) { keysPressed.current.up = false; keyChanged = true; }
          break;
        case 's':
        case 'arrowdown':
          if (keysPressed.current.down) { keysPressed.current.down = false; keyChanged = true; }
          break;
        case 'a':
        case 'arrowleft':
          if (keysPressed.current.left) { keysPressed.current.left = false; keyChanged = true; }
          break;
        case 'd':
        case 'arrowright':
          if (keysPressed.current.right) { keysPressed.current.right = false; keyChanged = true; }
          break;
        case ' ':
          // ballControl must stay non-volatile — possession start/end must not be dropped.
          socketRef.current.emit('ballControl', { control: false });
          break;
        default:
          break;
      }
      if (keyChanged) sendMovement();
    },
    [chatInputFocusRef, isConnected, sendMovement, socketRef]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const keepaliveId = setInterval(sendMovement, KEEPALIVE_MS);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(keepaliveId);
    };
  }, [handleKeyDown, handleKeyUp, sendMovement]);

  const resetMovement = useCallback(() => {
    keysPressed.current = { up: false, down: false, left: false, right: false };
    joystickMoveRef.current = { x: 0, z: 0 };
  }, []);

  return { handleDirectionChange, sendMovement, resetMovement };
}
