import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { getPlayerVisualY } from '../constants/characterStats';
import { playKick } from '../services/sound';

// Stamina bar colors by remaining fraction.
function staminaColor(fraction) {
  if (fraction > 0.5) return 'linear-gradient(90deg, #22c55e, #86efac)';
  if (fraction > 0.2) return 'linear-gradient(90deg, #f59e0b, #fcd34d)';
  return 'linear-gradient(90deg, #ef4444, #fca5a5)';
}

export function createUpdateGameState(refs) {
  const {
    sceneReadyRef,
    isMobileRef,
    characterManagerRef,
    playersRef,
    playersLabelsRef,
    advancedTextureRef,
    ballRef,
    itemsRef,
    scoreTextRef,
    controlEffectsRef,
    socketRef,
    sceneRef,
    playerMetaRef,
    setConnectedPlayers,
    staminaFillRef,
    staminaContainerRef,
    setMatchTimeLeft,
    lastMatchSecondRef,
    chargeFillRef,
    chargeContainerRef,
    fxRef,
  } = refs;

  // Tracks players whose mesh is being created asynchronously, to avoid
  // spawning duplicates across ticks while createPlayerInstance is in flight.
  const creatingPlayers = new Set();

  // Closure state to detect sudden ball acceleration (kicks/shots) for SFX.
  let prevBallPos = null;
  let prevBallStep = 0;

  return (gameState) => {
    if (!sceneReadyRef.current || !gameState || !characterManagerRef.current) {
      return;
    }

    const {
      players,
      roster,
      ballPosition,
      score,
      connectedPlayers,
      controllingPlayerId,
      controlRemainingMs,
      matchTimeLeftMs,
      shotCharge,
      items,
    } = gameState;
    const isMobileView = isMobileRef.current;

    // Match timer: push to React state only when the whole second changes
    // (avoids 20Hz re-renders).
    if (setMatchTimeLeft && typeof matchTimeLeftMs === 'number') {
      const sec = Math.max(0, Math.ceil(matchTimeLeftMs / 1000));
      if (lastMatchSecondRef && lastMatchSecondRef.current !== sec) {
        lastMatchSecondRef.current = sec;
        setMatchTimeLeft(sec);
      }
    }

    if (players && Array.isArray(players)) {
      players.forEach(async (playerData) => {
        if (!playerData?.id || !playerData?.position) return;

        // Persist static fields (sent on first send / keyframes) into meta so the
        // mesh is created with the correct character/team even if teamUpdate is late.
        if (playerData.characterType || playerData.team) {
          playerMetaRef.current[playerData.id] = {
            ...playerMetaRef.current[playerData.id],
            ...(playerData.characterType ? { characterType: playerData.characterType } : {}),
            ...(playerData.team ? { team: playerData.team } : {}),
          };
        }

        const meta = playerMetaRef.current[playerData.id] || {};
        const knownCharacter = playerData.characterType || meta.characterType;
        const knownTeam = playerData.team || meta.team;
        const desiredCharacter = knownCharacter || 'player';
        const desiredTeam = knownTeam;

        // If the rendered mesh no longer matches the player's character/team
        // (e.g. they switched team or character between matches), tear it down so
        // it is rebuilt below with the correct model and team color. We only act
        // when both character and team are actually known, to avoid rebuilding to
        // a default model while a selection is still pending.
        const rendered = characterManagerRef.current.getInstanceInfo?.(playerData.id);
        if (
          playersRef.current[playerData.id] &&
          rendered &&
          knownCharacter &&
          knownTeam &&
          (rendered.characterType !== knownCharacter || rendered.team !== knownTeam)
        ) {
          try {
            characterManagerRef.current.removePlayer(playerData.id);
            delete playersRef.current[playerData.id];
            if (playersLabelsRef.current[playerData.id]) {
              playersLabelsRef.current[playerData.id].dispose();
              delete playersLabelsRef.current[playerData.id];
            }
          } catch (error) {
            console.error('Error reconstruyendo jugador:', error);
          }
        }

        if (!playersRef.current[playerData.id] && !creatingPlayers.has(playerData.id)) {
          creatingPlayers.add(playerData.id);
          try {
            const characterType = desiredCharacter;
            const team = desiredTeam;
            const name = playerData.name || meta.name || '';

            const playerInstance = await characterManagerRef.current.createPlayerInstance(
              playerData.id,
              characterType,
              team,
            );
            playersRef.current[playerData.id] = playerInstance;

            const playerLabel = new GUI.Rectangle(`label-${playerData.id}`);
            playerLabel.width = isMobileView ? '80px' : '120px';
            playerLabel.height = isMobileView ? '20px' : '30px';
            playerLabel.background = team === 'left'
              ? 'rgba(59, 130, 246, 0.8)'
              : 'rgba(239, 68, 68, 0.8)';
            playerLabel.cornerRadius = isMobileView ? 10 : 15;
            playerLabel.thickness = 1;
            playerLabel.color = 'white';
            playerLabel.isPointerBlocker = false;
            playerLabel.scaling = new BABYLON.Vector3(isMobileView ? 0.5 : 1, isMobileView ? 0.5 : 1, isMobileView ? 0.5 : 1);
            advancedTextureRef.current.addControl(playerLabel);

            const nameText = new GUI.TextBlock();
            nameText.text = name;
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
          } finally {
            creatingPlayers.delete(playerData.id);
          }
        }

        const playerInstance = playersRef.current[playerData.id];
        if (playerInstance) {
          const visualY = getPlayerVisualY(desiredCharacter);
          const currentPosition = playerInstance.position;
          const targetPosition = new BABYLON.Vector3(
            playerData.position.x,
            visualY,
            playerData.position.z,
          );

          // No movemos la malla aquí (20 Hz). Guardamos el objetivo del servidor y
          // el bucle de render interpola hacia él a 60 fps (movimiento fluido, sin
          // saltos al ir con boost). Primer paquete: posicionar de golpe.
          if (!playerInstance.netTarget) {
            playerInstance.position.set(targetPosition.x, visualY, targetPosition.z);
          }
          playerInstance.netTarget = { x: targetPosition.x, y: visualY, z: targetPosition.z };

          const deltaX = targetPosition.x - currentPosition.x;
          const deltaZ = targetPosition.z - currentPosition.z;
          if (Math.abs(deltaX) > 0.01 || Math.abs(deltaZ) > 0.01) {
            const angle = Math.atan2(deltaX, deltaZ);
            // LerpAngle interpola por el camino angular más corto (maneja el wrap
            // en ±π), evitando que el cuerpo gire por el lado largo al cambiar de
            // sentido. Factor más alto = giro más ágil y menos "arrastre".
            playerInstance.rotation.y = BABYLON.Scalar.LerpAngle(
              playerInstance.rotation.y,
              angle,
              0.35,
            );
          }

          characterManagerRef.current.updatePlayerAnimation(
            playerData.id,
            playerData.isMoving,
          );
        }
      });

      // With delta compression, `players` only carries changed entries. Use the
      // authoritative `roster` (all current ids) to decide removals; fall back to
      // `players` if roster is absent (older server).
      const activeIds = Array.isArray(roster)
        ? roster
        : players.map((p) => p.id);
      Object.keys(playersRef.current).forEach((id) => {
        if (!activeIds.includes(id)) {
          try {
            characterManagerRef.current.removePlayer(id);
            delete playersRef.current[id];
            delete playerMetaRef.current[id];
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

    if (ballPosition) {
      // Detect a sudden jump in the ball's authoritative step (shot/strong hit) → kick SFX.
      if (prevBallPos) {
        const dx = ballPosition.x - prevBallPos.x;
        const dz = ballPosition.z - prevBallPos.z;
        const step = Math.hypot(dx, dz);
        // Plausible shot range: ignore tiny drift and huge teleports (kickoff resets).
        if (step > 0.8 && step < 4 && prevBallStep < 0.5) {
          playKick();
          // Impact feedback: spark burst at the ball + a tiny camera nudge,
          // scaled by how hard the shot was.
          const punch = Math.min(1, (step - 0.8) / 2.4);
          fxRef?.current?.kickBurst?.(ballPosition);
          fxRef?.current?.shakeCamera?.(0.08 + punch * 0.14);
        }
        prevBallStep = step;
      }
      prevBallPos = { x: ballPosition.x, z: ballPosition.z };
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
      // Igual que los jugadores: guardamos objetivo y el render interpola a 60 fps.
      if (!ballRef.current.netTarget) {
        ballRef.current.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
      }
      ballRef.current.netTarget = { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z };
    }

    // Ítems de velocidad: crear/posicionar/eliminar según el estado autoritativo.
    if (itemsRef && sceneRef.current && Array.isArray(items)) {
      const scene = sceneRef.current;
      const activeIds = new Set();
      items.forEach((it) => {
        if (!it?.id) return;
        activeIds.add(it.id);
        let mesh = itemsRef.current[it.id];
        if (!mesh) {
          // Octaedro brillante tipo "power-up".
          mesh = BABYLON.MeshBuilder.CreatePolyhedron(`item-${it.id}`, { type: 1, size: 0.45 }, scene);
          const mat = new BABYLON.StandardMaterial(`itemMat-${it.id}`, scene);
          mat.emissiveColor = new BABYLON.Color3(0.2, 0.9, 1);
          mat.diffuseColor = new BABYLON.Color3(0.2, 0.9, 1);
          mat.specularColor = new BABYLON.Color3(0, 0, 0);
          mat.disableLighting = true;
          mesh.material = mat;
          mesh.isPickable = false;
          itemsRef.current[it.id] = mesh;
        }
        mesh.position.set(it.x, 0.9, it.z);
      });
      Object.keys(itemsRef.current).forEach((id) => {
        if (!activeIds.has(id)) {
          const mesh = itemsRef.current[id];
          if (mesh) {
            if (mesh.material) mesh.material.dispose();
            mesh.dispose();
          }
          delete itemsRef.current[id];
        }
      });
    }

    if (scoreTextRef.current && score) {
      scoreTextRef.current.left.text = (score.left ?? 0).toString();
      scoreTextRef.current.right.text = (score.right ?? 0).toString();
    }

    if (controlEffectsRef.current && ballRef.current) {
      const hasControl = !!controllingPlayerId && controlRemainingMs > 0;
      const controllingName = playerMetaRef.current[controllingPlayerId]?.name || '';
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
        controlEffectsRef.current.controlPlayerNameText.text = controllingName;
        controlEffectsRef.current.controlTimeText.text = `${seconds.toFixed(1)}s`;
        // Float the labels above the ball (negative offset = up) so they don't
        // cover it. `top` stays at 0; vertical placement uses linkOffsetY.
        controlEffectsRef.current.controlPlayerNameText.top = '0px';
        controlEffectsRef.current.controlTimeText.top = '0px';
        controlEffectsRef.current.controlPlayerNameText.linkOffsetY = isMobileView ? -52 : -70;
        controlEffectsRef.current.controlTimeText.linkOffsetY = isMobileView ? -34 : -48;
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

    // Update local player's stamina bar (direct DOM write to avoid 20Hz React re-renders).
    if (staminaFillRef?.current && staminaContainerRef?.current) {
      const selfId = socketRef.current?.id;
      const self = selfId && Array.isArray(players)
        ? players.find((p) => p.id === selfId)
        : null;
      // With delta compression `self` may be absent on ticks where nothing changed;
      // in that case we keep the last rendered value instead of hiding the bar.
      if (self && typeof self.stamina === 'number') {
        const fraction = Math.max(0, Math.min(1, self.stamina));
        staminaContainerRef.current.style.display = 'block';
        staminaFillRef.current.style.width = `${(fraction * 100).toFixed(1)}%`;
        staminaFillRef.current.style.background = staminaColor(fraction);
        staminaFillRef.current.style.boxShadow = self.isSprinting
          ? '0 0 10px rgba(56, 189, 248, 0.8)'
          : 'none';
      }
    }

    // Update local player's shot charge bar (visible only while controlling the ball).
    if (chargeFillRef?.current && chargeContainerRef?.current) {
      const selfId = socketRef.current?.id;
      if (selfId && controllingPlayerId === selfId) {
        const fraction = Math.max(0, Math.min(1, typeof shotCharge === 'number' ? shotCharge : 0));
        chargeContainerRef.current.style.display = 'block';
        chargeFillRef.current.style.width = `${(fraction * 100).toFixed(1)}%`;
      } else {
        chargeContainerRef.current.style.display = 'none';
      }
    }
  };
}
