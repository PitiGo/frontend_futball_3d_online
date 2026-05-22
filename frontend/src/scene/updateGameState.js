import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { getPlayerVisualY } from '../constants/characterStats';

export function createUpdateGameState(refs) {
  const {
    sceneReadyRef,
    isMobileRef,
    characterManagerRef,
    playersRef,
    playersLabelsRef,
    advancedTextureRef,
    ballRef,
    scoreTextRef,
    controlEffectsRef,
    socketRef,
    sceneRef,
    setConnectedPlayers,
  } = refs;

  return (gameState) => {
    if (!sceneReadyRef.current || !gameState || !characterManagerRef.current) {
      return;
    }

    const {
      players,
      ballPosition,
      score,
      connectedPlayers,
      controllingPlayerId,
      controlRemainingMs,
    } = gameState;
    const isMobileView = isMobileRef.current;

    if (players && Array.isArray(players)) {
      players.forEach(async (playerData) => {
        if (!playerData?.id || !playerData?.position) return;

        if (!playersRef.current[playerData.id]) {
          try {
            const playerInstance = await characterManagerRef.current.createPlayerInstance(
              playerData.id,
              playerData.characterType || 'player',
              playerData.team,
            );
            playersRef.current[playerData.id] = playerInstance;

            const playerLabel = new GUI.Rectangle(`label-${playerData.id}`);
            playerLabel.width = isMobileView ? '80px' : '120px';
            playerLabel.height = isMobileView ? '20px' : '30px';
            playerLabel.background = playerData.team === 'left'
              ? 'rgba(59, 130, 246, 0.8)'
              : 'rgba(239, 68, 68, 0.8)';
            playerLabel.cornerRadius = isMobileView ? 10 : 15;
            playerLabel.thickness = 1;
            playerLabel.color = 'white';
            playerLabel.isPointerBlocker = false;
            playerLabel.scaling = new BABYLON.Vector3(isMobileView ? 0.5 : 1, isMobileView ? 0.5 : 1, isMobileView ? 0.5 : 1);
            advancedTextureRef.current.addControl(playerLabel);

            const nameText = new GUI.TextBlock();
            nameText.text = playerData.name;
            nameText.color = 'white';
            nameText.fontSize = isMobileView ? 10 : 14;
            nameText.fontWeight = 'bold';
            nameText.fontFamily = 'Arial';
            nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
            nameText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            playerLabel.addControl(nameText);
            playerLabel.linkWithMesh(playerInstance);
            playerLabel.linkOffsetY = isMobileView ? -50 : -120;
            playerLabel.zIndex = 1;
            playersLabelsRef.current[playerData.id] = playerLabel;

            if (playerData.id === socketRef.current?.id) {
              sceneRef.current.activeCamera.lockedTarget = playerInstance;
            }
          } catch (error) {
            console.error('Error creando instancia de jugador:', error);
          }
        }

        const playerInstance = playersRef.current[playerData.id];
        if (playerInstance) {
          const visualY = getPlayerVisualY(playerData.characterType);
          const currentPosition = playerInstance.position;
          const targetPosition = new BABYLON.Vector3(
            playerData.position.x,
            visualY,
            playerData.position.z,
          );

          playerInstance.position = BABYLON.Vector3.Lerp(currentPosition, targetPosition, 0.3);

          const deltaX = targetPosition.x - currentPosition.x;
          const deltaZ = targetPosition.z - currentPosition.z;
          if (Math.abs(deltaX) > 0.01 || Math.abs(deltaZ) > 0.01) {
            const angle = Math.atan2(deltaX, deltaZ);
            playerInstance.rotation.y = BABYLON.Scalar.Lerp(
              playerInstance.rotation.y,
              angle,
              0.1,
            );
          }

          characterManagerRef.current.updatePlayerAnimation(
            playerData.id,
            playerData.isMoving,
          );
        }
      });

      Object.keys(playersRef.current).forEach((id) => {
        if (!players.find((player) => player.id === id)) {
          try {
            characterManagerRef.current.removePlayer(id);
            delete playersRef.current[id];
            if (playersLabelsRef.current[id]) {
              playersLabelsRef.current[id].dispose();
              delete playersLabelsRef.current[id];
            }
          } catch (error) {
            console.error('Error removiendo jugador:', error);
          }
        }
      });
    }

    if (ballRef.current && ballPosition) {
      const currentPosition = ballRef.current.position;
      const targetPosition = new BABYLON.Vector3(
        ballPosition.x,
        ballPosition.y || 0.5,
        ballPosition.z,
      );
      const velocity = targetPosition.subtract(currentPosition);
      const speed = velocity.length();
      const rotationAxis = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), velocity.normalize());
      if (speed > 0.01) {
        ballRef.current.rotate(rotationAxis, speed * 8, BABYLON.Space.WORLD);
      }
      ballRef.current.position = BABYLON.Vector3.Lerp(currentPosition, targetPosition, 0.3);
    }

    if (scoreTextRef.current && score) {
      scoreTextRef.current.left.text = (score.left ?? 0).toString();
      scoreTextRef.current.right.text = (score.right ?? 0).toString();
    }

    if (controlEffectsRef.current && ballRef.current) {
      const hasControl = !!controllingPlayerId && controlRemainingMs > 0;
      const controllingPlayer = players?.find((p) => p.id === controllingPlayerId);
      controlEffectsRef.current.ballHalo.isVisible = hasControl;
      controlEffectsRef.current.controlRing.isVisible = hasControl;
      controlEffectsRef.current.controlTimeText.isVisible = hasControl;
      controlEffectsRef.current.controlPlayerNameText.isVisible = hasControl;
      if (hasControl) {
        const controllingMesh = playersRef.current[controllingPlayerId];
        if (controllingMesh) {
          controlEffectsRef.current.controlRing.position = controllingMesh.position.clone();
          controlEffectsRef.current.controlRing.position.y = 0.1;
        }
        const seconds = Math.ceil(controlRemainingMs / 100) / 10;
        controlEffectsRef.current.controlPlayerNameText.text = controllingPlayer?.name || '';
        controlEffectsRef.current.controlTimeText.text = `${seconds.toFixed(1)}s`;
        controlEffectsRef.current.controlPlayerNameText.top = isMobileView ? '20px' : '0px';
        controlEffectsRef.current.controlTimeText.top = isMobileView ? '40px' : '20px';
        controlEffectsRef.current.controlPlayerNameText.linkWithMesh(ballRef.current);
        controlEffectsRef.current.controlTimeText.linkWithMesh(ballRef.current);
      } else {
        controlEffectsRef.current.stopParticles();
        controlEffectsRef.current.controlTimeText.text = '';
        controlEffectsRef.current.controlPlayerNameText.text = '';
      }
    }

    if (connectedPlayers) {
      setConnectedPlayers(connectedPlayers);
    }
  };
}
