import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createGameScene } from '../scene/createGameScene';
import { createUpdateGameState } from '../scene/updateGameState';

export function useScene(refs, isMobileRef, { onSceneReady, onLoadComplete }) {
  const onSceneReadyRef = useRef(onSceneReady);
  const onLoadCompleteRef = useRef(onLoadComplete);

  useEffect(() => { onSceneReadyRef.current = onSceneReady; }, [onSceneReady]);
  useEffect(() => { onLoadCompleteRef.current = onLoadComplete; }, [onLoadComplete]);

  const createScene = useCallback(
    (canvas) => createGameScene(canvas, {
      refs,
      isMobileRef,
      onSceneReady: () => onSceneReadyRef.current?.(),
      onLoadComplete: () => onLoadCompleteRef.current?.(),
    }),
    [refs, isMobileRef],
  );

  // createUpdateGameState closes over the refs object identity. Ref fields like
  // sceneReadyRef.current are read at invocation time, but setConnectedPlayers is
  // captured when this memo runs — safe because React guarantees setter stability.
  const updateGameState = useMemo(() => createUpdateGameState(refs), [refs]);

  return { createScene, updateGameState };
}
