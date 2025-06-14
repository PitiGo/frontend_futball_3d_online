// characterManager.js
import * as BABYLON from '@babylonjs/core';

class CharacterManager {
    constructor(scene) {
        this.scene = scene;
        this.charactersData = {
            player: {
                modelPath: '/models/conejo.glb',
                animations: {
                    idle: 'idle',
                    running: 'running',
                    dancing: 'dancing'
                },
                scale: 0.014,
                name: 'Conejo',
                description: 'El jugador más rápido del campo'
            },
            pig: {
                modelPath: '/models/elvis.glb',
                animations: {
                    idle: 'idle',
                    running: 'running',
                    dancing: 'dancing'
                },
                scale: 0.014,
                name: 'Cerdo',
                description: 'Vieja gloria del Rock reconvertido a futbolista, ¡no lo subestimes!'
            },
            lizard: {
                modelPath: '/models/lizard.glb',
                animations: {
                    idle: 'idle',
                    running: 'running',
                    dancing: 'dancing'
                },
                scale: 0.013,
                name: 'Lizard',
                description: 'Agil'
            },
            turtle: {
                modelPath: '/models/turtle.glb',
                animations: {
                    idle: 'idle',
                    running: 'running',
                    dancing: 'dancing'
                },
                scale: 0.014,
                name: 'Turtle',
                description: 'Fuerte y resistente, domina el campo'
            }
        };

        this.loadedCharacters = new Map();
        this.playerInstances = new Map();
        this.animationGroups = new Map();
    }

    async loadCharacter(characterType) {
        if (this.loadedCharacters.has(characterType)) {
            return this.loadedCharacters.get(characterType);
        }

        const characterData = this.charactersData[characterType];
        if (!characterData) {
            throw new Error(`Tipo de personaje ${characterType} no encontrado`);
        }

        return new Promise((resolve, reject) => {
            const assetsManager = new BABYLON.AssetsManager(this.scene);
            const task = assetsManager.addMeshTask(
                `load-${characterType}`,
                "",
                "",
                characterData.modelPath
            );

            task.onSuccess = (task) => {
                console.log(`Modelo ${characterType} cargado exitosamente`);
                console.log('Animaciones disponibles:', task.loadedAnimationGroups.map(g => g.name));

                const rootMesh = task.loadedMeshes[0];
                rootMesh.setEnabled(false);

                let skeleton = task.loadedSkeletons.length > 0 ? task.loadedSkeletons[0] : null;

                // Mapear las animaciones usando los nombres exactos definidos en charactersData
                const animations = {};
                const expectedAnimations = this.charactersData[characterType].animations;

                task.loadedAnimationGroups.forEach(group => {
                    // Buscar la animación correspondiente
                    for (const [key, expectedName] of Object.entries(expectedAnimations)) {
                        if (group.name === expectedName) {
                            animations[key] = group;
                            console.log(`Asignada animación ${group.name} como ${key}`);
                            break;
                        }
                    }
                });

                // Verificar que todas las animaciones necesarias están presentes
                const missingAnimations = Object.keys(expectedAnimations)
                    .filter(key => !animations[key]);

                if (missingAnimations.length > 0) {
                    console.warn(`Animaciones faltantes para ${characterType}:`, missingAnimations);
                }

                this.loadedCharacters.set(characterType, {
                    mesh: rootMesh,
                    skeleton: skeleton,
                    animationGroups: animations
                });

                this.animationGroups.set(characterType, animations);

                resolve({
                    mesh: rootMesh,
                    skeleton: skeleton,
                    animationGroups: animations
                });
            };

            task.onError = (task, message, exception) => {
                console.error(`Error cargando personaje ${characterType}:`, message, exception);
                reject(new Error(`Error al cargar personaje ${characterType}: ${message}`));
            };

            assetsManager.load();
        });
    }

    async createPlayerInstance(playerId, characterType, team) {
        try {
            console.log(`Creando instancia para jugador ${playerId} con personaje ${characterType}`);
            const characterData = await this.loadCharacter(characterType);

            const playerRoot = new BABYLON.TransformNode(`player-root-${playerId}`, this.scene);
            const playerInstance = characterData.mesh.clone(`player-${playerId}`);
            playerInstance.setEnabled(true);
            playerInstance.parent = playerRoot;

            playerRoot.scaling = new BABYLON.Vector3(
                this.charactersData[characterType].scale,
                this.charactersData[characterType].scale,
                this.charactersData[characterType].scale
            );

            // Ajustar rotación
            playerInstance.rotationQuaternion = null;
            playerInstance.rotation = new BABYLON.Vector3(
                0,       // No rotación en X para mantenerlo vertical
                Math.PI, // Rotación en Y para orientarlo hacia la dirección correcta
                0        // No rotación en Z
            );

            // Ajustar posición vertical para corregir el hundimiento
            playerInstance.position.y = 1.0; // Ajusta este valor si es necesario

            // --- CÓDIGO MEJORADO para clonar animaciones ---
            const playerAnimations = {};
            if (characterData.animationGroups) {
                Object.entries(characterData.animationGroups).forEach(([name, group]) => {
                    if (!group) {
                        console.warn(`El grupo de animación '${name}' está nulo o indefinido para el personaje.`);
                        return; // Saltar este grupo de animación
                    }

                    // Re-apunta las animaciones a la nueva malla y su esqueleto
                    const clonedGroup = group.clone(`anim-group-${playerId}-${name}`);

                    // La propiedad `targetedAnimations` contiene las animaciones individuales y sus objetivos.
                    // Tenemos que re-dirigir cada una de ellas.
                    clonedGroup.targetedAnimations.forEach(targetedAnim => {
                        const originalTarget = targetedAnim.target;

                        // Si el objetivo original es la malla raíz, el nuevo objetivo es la instancia clonada.
                        if (originalTarget === characterData.mesh) {
                            targetedAnim.target = playerInstance;
                        }
                        // Si no, es probable que sea un hueso o un nodo hijo.
                        // Buscamos un descendiente en la nueva instancia con el mismo nombre.
                        else {
                            const newTarget = playerInstance.getDescendants(false).find(d => d.name === originalTarget.name);
                            if (newTarget) {
                                targetedAnim.target = newTarget;
                            } else {
                                console.warn(`No se pudo encontrar el nuevo target para la animación '${targetedAnim.animation.name}' en el target original '${originalTarget.name}'`);
                            }
                        }
                    });

                    clonedGroup.stop(); // Detener la animación clonada por defecto.
                    playerAnimations[name] = clonedGroup;
                    console.log(`Clonada y re-dirigida la animación ${name} para el jugador ${playerId}`);
                });
            }

            this.playerInstances.set(playerId, {
                root: playerRoot,
                mesh: playerInstance,
                animations: playerAnimations,
                currentAnimation: null,
                characterType,
                team
            });

            // Iniciar con la animación idle
            this.startAnimation(playerId, 'idle');

            return playerRoot;

        } catch (error) {
            console.error('Error al crear instancia de jugador:', error);
            throw error;
        }
    }

    startAnimation(playerId, animationName, loop = true) {
        const playerData = this.playerInstances.get(playerId);
        if (!playerData) {
            console.warn(`No se encontró el jugador ${playerId}`);
            return;
        }

        if (playerData.currentAnimation === animationName) {
            return; // No cambiar si ya está reproduciendo la misma animación
        }

        // Detener animación actual
        if (playerData.currentAnimation && playerData.animations[playerData.currentAnimation]) {
            playerData.animations[playerData.currentAnimation].stop();
        }

        // Iniciar nueva animación
        if (playerData.animations[animationName]) {
            console.log(`Iniciando animación ${animationName} para jugador ${playerId}`);
            playerData.animations[animationName].start(loop);
            playerData.currentAnimation = animationName;
        } else {
            console.warn(`Animación ${animationName} no encontrada para jugador ${playerId}`);
            // Intentar usar idle como fallback
            if (animationName !== 'idle' && playerData.animations['idle']) {
                console.log('Usando animación idle como fallback');
                playerData.animations['idle'].start(true);
                playerData.currentAnimation = 'idle';
            }
        }
    }

    updatePlayerAnimation(playerId, isMoving) {
        const playerData = this.playerInstances.get(playerId);
        if (!playerData) return;

        const animationName = isMoving ? 'running' : 'idle';
        this.startAnimation(playerId, animationName);
    }

    removePlayer(playerId) {
        const playerData = this.playerInstances.get(playerId);
        if (playerData) {
            Object.values(playerData.animations).forEach(animation => {
                animation.stop();
                animation.dispose();
            });
            playerData.mesh.dispose();
            playerData.root.dispose();
            this.playerInstances.delete(playerId);
        }
    }

    dispose() {
        this.playerInstances.forEach((_, playerId) => {
            this.removePlayer(playerId);
        });

        this.loadedCharacters.forEach((characterData) => {
            characterData.mesh.dispose();
        });

        this.loadedCharacters.clear();
        this.playerInstances.clear();
        this.animationGroups.clear();
    }
}

export default CharacterManager;