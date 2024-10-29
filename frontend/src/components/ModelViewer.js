

import React, { useEffect, useRef } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const ModelViewer = () => {
    const canvasRef = useRef(null);
    const modelRef = useRef(null);
    const inputMap = useRef({});

    useEffect(() => {
        const canvas = canvasRef.current;
        const engine = new BABYLON.Engine(canvas, true);
        const scene = new BABYLON.Scene(engine);

        // Configurar la cámara
        const camera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI / 2,
            Math.PI / 2.5,
            15,
            BABYLON.Vector3.Zero(),
            scene
        );
        camera.attachControl(canvas, true);

        // Añadir una luz
        const light = new BABYLON.HemisphericLight(
            "light",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );

        // Crear el suelo con un tamaño adecuado
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);

        // Cargar el modelo
        BABYLON.SceneLoader.ImportMesh(
            "",
            "/models/",
            "player.glb",
            scene,
            (meshes, particleSystems, skeletons, animationGroups) => {
                if (meshes.length === 0) {
                    console.error("No se cargaron meshes.");
                    return;
                }

                // Crear un nodo padre vacío para agrupar todos los meshes
                const parent = new BABYLON.TransformNode("parent", scene);
                meshes.forEach(mesh => {
                    mesh.parent = parent;
                });

                modelRef.current = parent;

                // Ajustar el tamaño del modelo
                parent.scaling = new BABYLON.Vector3(0.02, 0.02, 0.02);

                // Rotar el modelo para que esté de pie (90 grados alrededor del eje X)
                parent.rotation.x = Math.PI / 2; // Ajusta este valor si es necesario

                // Posicionar el modelo en el centro
                parent.position = new BABYLON.Vector3(0, 0, 0);

                // Manejar las animaciones
                const animations = {
                    idle: null,
                    running: null,
                    dancing: null
                };

                animationGroups.forEach((animationGroup) => {
                    const animName = animationGroup.name.toLowerCase();
                    if (animName.includes("idle")) {
                        animations.idle = animationGroup;
                    } else if (animName.includes("run")) {
                        animations.running = animationGroup;
                    } else if (animName.includes("dance")) {
                        animations.dancing = animationGroup;
                    }
                });

                // Iniciar con la animación idle
                if (animations.idle) {
                    animations.idle.start(true);
                }

                // Guardar las animaciones
                parent.animations = animations;

                console.log("Animaciones cargadas:", animations);
            }
        );

        // Mapa de entrada
        const handleKeyDown = (event) => {
            inputMap.current[event.key.toLowerCase()] = true;
        };

        const handleKeyUp = (event) => {
            inputMap.current[event.key.toLowerCase()] = false;
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        // Función de actualización de movimiento
        const updateMovement = () => {
            const parent = modelRef.current;
            if (!parent) return;

            const animations = parent.animations || {};
            const input = inputMap.current;

            let moveDirection = BABYLON.Vector3.Zero();
            let isMoving = false;

            // Determinar la dirección de movimiento
            if (input["arrowup"] || input["w"]) {
                moveDirection.z += 1;
                isMoving = true;
            }
            if (input["arrowdown"] || input["s"]) {
                moveDirection.z -= 1;
                isMoving = true;
            }
            if (input["arrowleft"] || input["a"]) {
                moveDirection.x -= 1;
                isMoving = true;
            }
            if (input["arrowright"] || input["d"]) {
                moveDirection.x += 1;
                isMoving = true;
            }

            if (isMoving) {
                // Normalizar y escalar la dirección para controlar la velocidad
                moveDirection.normalize();
                moveDirection.scaleInPlace(0.1); // Ajusta este valor para cambiar la velocidad

                // Mover el modelo
                parent.position.addInPlace(moveDirection);

                // Calcular el ángulo de rotación usando atan2
                const angle = Math.atan2(moveDirection.x, moveDirection.z);
                parent.rotation.y = angle;

                // Depuración: Mostrar dirección y ángulo
                console.log("Dirección de movimiento:", moveDirection.toString());
                console.log("Ángulo de rotación (rad):", angle);

                // Control de animaciones: correr
                if (animations.running && !animations.running.isPlaying) {
                    if (animations.idle) animations.idle.stop();
                    if (animations.dancing) animations.dancing.stop();
                    animations.running.start(true);
                }
            } else {
                // Control de animaciones: idle
                if (animations.idle && !animations.idle.isPlaying) {
                    if (animations.running) animations.running.stop();
                    if (animations.dancing) animations.dancing.stop();
                    animations.idle.start(true);
                }
            }

            // Control de animaciones: bailar
            if (input["b"]) {
                if (animations.dancing && !animations.dancing.isPlaying) {
                    if (animations.idle) animations.idle.stop();
                    if (animations.running) animations.running.stop();
                    animations.dancing.start(true);
                }
            }
        };

        // Añadir el observador de renderizado
        scene.onBeforeRenderObservable.add(updateMovement);

        // Iniciar el render loop
        engine.runRenderLoop(() => {
            scene.render();
        });

        // Manejar el redimensionamiento de la ventana
        window.addEventListener('resize', () => engine.resize());

        // Cleanup al desmontar el componente
        return () => {
            engine.dispose();
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    return (
        <canvas ref={canvasRef} style={{ width: '100%', height: '100vh' }} />
    );
};

export default ModelViewer;