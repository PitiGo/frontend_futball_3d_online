// characterManager.js
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

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

        const path = characterData.modelPath;
        const slash = path.lastIndexOf('/') + 1;
        const rootUrl = path.substring(0, slash);
        const fileName = path.substring(slash);

        // Cargamos en un AssetContainer (no se añade a la escena). Cada jugador se
        // crea con `instantiateModelsToScene`, que clona malla, ESQUELETO y
        // animaciones de forma independiente por instancia. Esto evita que dos
        // jugadores del mismo personaje compartan el esqueleto (y, por tanto, la
        // misma animación).
        const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
            rootUrl,
            fileName,
            this.scene,
        );

        // Detener las animaciones del contenedor para que no se reproduzcan en los
        // originales ni se "filtren" a las instancias recién creadas.
        container.animationGroups.forEach((group) => {
            group.stop();
            group.reset();
        });

        const entry = { container };
        this.loadedCharacters.set(characterType, entry);
        return entry;
    }

    async createPlayerInstance(playerId, characterType, team) {
        try {
            const { container } = await this.loadCharacter(characterType);
            const scale = this.charactersData[characterType].scale;
            const expectedAnimations = this.charactersData[characterType].animations;

            // `doNotInstantiate: true` fuerza CLONES completos (con su propio
            // esqueleto), no instancias GPU que compartirían el esqueleto. Es la
            // base para que cada jugador anime de forma independiente.
            const instanced = container.instantiateModelsToScene(
                (name) => `${name}-${playerId}`,
                false,
                { doNotInstantiate: true },
            );

            const playerRoot = new BABYLON.TransformNode(`player-root-${playerId}`, this.scene);
            playerRoot.scaling = new BABYLON.Vector3(scale, scale, scale);

            const rootNode = instanced.rootNodes[0];
            rootNode.parent = playerRoot;
            rootNode.rotationQuaternion = null;
            rootNode.rotation = new BABYLON.Vector3(0, Math.PI, 0);
            rootNode.position.y = 1.0; // Corrige el hundimiento del modelo.

            // Mapear las animaciones instanciadas (propias de esta instancia) a
            // las claves lógicas idle/running/dancing.
            const animations = {};
            instanced.animationGroups.forEach((group) => {
                for (const [key, expectedName] of Object.entries(expectedAnimations)) {
                    if (group.name === expectedName || group.name.includes(expectedName)) {
                        animations[key] = group;
                        break;
                    }
                }
                group.stop();
                group.reset();
            });

            this.playerInstances.set(playerId, {
                root: playerRoot,
                mesh: rootNode,
                instanced,
                animations,
                currentAnimation: null,
                characterType,
                team,
            });

            // Iniciar con la animación idle
            this.startAnimation(playerId, 'idle');

            return playerRoot;

        } catch (error) {
            console.error('Error al crear instancia de jugador:', error);
            throw error;
        }
    }

    // Información del modelo actualmente renderizado para un jugador. Permite a
    // updateGameState detectar cambios de personaje/equipo y reconstruir la malla.
    getInstanceInfo(playerId) {
        const data = this.playerInstances.get(playerId);
        return data ? { characterType: data.characterType, team: data.team } : null;
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
        if (!playerData) return;

        const safe = (fn) => { try { fn(); } catch (e) { /* noop */ } };

        // Las animaciones mapeadas son un subconjunto de las instanciadas; se
        // detienen y se liberan todas desde `instanced` para no dejar grupos
        // huérfanos animando un esqueleto ya eliminado.
        if (playerData.instanced) {
            (playerData.instanced.animationGroups || []).forEach((g) => safe(() => { g.stop(); g.dispose(); }));
            (playerData.instanced.skeletons || []).forEach((s) => safe(() => s.dispose()));
            (playerData.instanced.rootNodes || []).forEach((n) => safe(() => n.dispose(false, true)));
        } else {
            Object.values(playerData.animations).forEach((animation) => safe(() => { animation.stop(); animation.dispose(); }));
            if (playerData.mesh) safe(() => playerData.mesh.dispose());
        }

        if (playerData.root) safe(() => playerData.root.dispose());
        this.playerInstances.delete(playerId);
    }

    dispose() {
        this.playerInstances.forEach((_, playerId) => {
            this.removePlayer(playerId);
        });

        this.loadedCharacters.forEach((entry) => {
            if (entry?.container) {
                try { entry.container.dispose(); } catch (e) { /* noop */ }
            }
        });

        this.loadedCharacters.clear();
        this.playerInstances.clear();
        this.animationGroups.clear();
    }
}

export default CharacterManager;