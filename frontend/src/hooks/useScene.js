import { useCallback, useMemo } from 'react';
import { createGameScene } from '../scene/createGameScene';
import { createUpdateGameState } from '../scene/updateGameState';

export function useScene(refs, isMobileRef, { onSceneReady, onLoadComplete }) {
  const createScene = useCallback(
    (canvas) => createGameScene(canvas, {
      refs,
      isMobileRef,
      onSceneReady,
      onLoadComplete,
    }),
    [refs, isMobileRef, onSceneReady, onLoadComplete],
  );

  const updateGameState = useMemo(() => createUpdateGameState(refs), [refs]);

  return { createScene, updateGameState };
}
