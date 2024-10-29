import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/core/Physics/physicsEngineComponent';
import '@babylonjs/core/Physics/Plugins/cannonJSPlugin';
import * as GUI from '@babylonjs/gui';
import { io } from 'socket.io-client';
import * as CANNON from 'cannon-es';
import '@babylonjs/inspector';
import LoadingScreen from './LoadingScreen';
import LoginScreen from './LoginScreen';

import TeamSelectionScreen from './TeamSelectionScreen'


const Game = () => {
    const canvasRef = useRef(null);
    const engineRef = useRef(null);
    const sceneRef = useRef(null);
    const socketRef = useRef(null);
    const playersRef = useRef({});
    const playersLabelsRef = useRef({}); // Referencia para las etiquetas de los jugadores
    const advancedTextureRef = useRef(null); // Referencia para la GUI
    const ballRef = useRef(null);
    const scoreTextRef = useRef(null);
    const [playerName, setPlayerName] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [sceneReady, setSceneReady] = useState(false);
    const [connectedPlayers, setConnectedPlayers] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [hasJoined, setHasJoined] = useState(false);

    // En Game.js, añade estos nuevos estados:
    const [teamSelected, setTeamSelected] = useState(false);
    const [teams, setTeams] = useState({ left: [], right: [] });
    const [currentTeam, setCurrentTeam] = useState(null);


    // Ref para rastrear si el chat está enfocado
    const chatInputFocusRef = useRef(false);

    // Nuevas referencias para el modelo del jugador y las animaciones
    const playerModelRef = useRef(null);
    const playerAnimationsRef = useRef(null);
    const currentAnimationRef = useRef(null);

    const chatMessagesRef = useRef(null);



    const createScene = useCallback((canvas) => {
        console.log('Creando escena de Babylon.js');
        const engine = new BABYLON.Engine(canvas, true);
        engineRef.current = engine;
        const scene = new BABYLON.Scene(engine);
        sceneRef.current = scene;

        // scene.debugLayer.show();

        // Crear un administrador de carga
        const assetsManager = new BABYLON.AssetsManager(scene);

        // Cargar el modelo del jugador
        const playerTask = assetsManager.addMeshTask("playerLoad", "", "/models/", "player.glb");

        playerTask.onSuccess = function (task) {
            console.log('Meshes cargados:', task.loadedMeshes);
            const playerModel = task.loadedMeshes[1];
            playerModel.setEnabled(false);
            playerModelRef.current = playerModel;

            // Guardar las animaciones
            playerAnimationsRef.current = {
                idle: task.loadedAnimationGroups.find(ag => ag.name === "idle"),
                running: task.loadedAnimationGroups.find(ag => ag.name === "running"),
                dancing: task.loadedAnimationGroups.find(ag => ag.name === "dancing"),
            };

            // Detener todas las animaciones inicialmente
            task.loadedAnimationGroups.forEach(ag => ag.stop());

            console.log('Modelo cargado exitosamente');
            setSceneReady(true);
            setIsLoading(false);
        };

        playerTask.onError = function (task, message, exception) {
            console.error('Error loading player model:', message, exception);
            setIsLoading(false); // También quitamos la pantalla de carga en caso de error
        };

        // Iniciar la carga
        assetsManager.load();

        // Configuración de la física
        const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
        const physicsPlugin = new BABYLON.CannonJSPlugin(undefined, undefined, CANNON);
        scene.enablePhysics(gravityVector, physicsPlugin);

        // Reemplaza la configuración de la cámara en createScene con esto:

        // Configuración de la cámara fija
        const camera = new BABYLON.ArcRotateCamera(
            "Camera",
            0,           // alpha (rotación horizontal)
            Math.PI / 3,   // beta (rotación vertical)
            40,          // radio (distancia)
            new BABYLON.Vector3(0, 0, 0), // punto objetivo
            scene
        );

        // Posicionar la cámara
        camera.setPosition(new BABYLON.Vector3(0, 10, -10));

        // Fijar el objetivo al centro del campo
        camera.setTarget(BABYLON.Vector3.Zero());

        // Desactivar todos los controles de la cámara para que sea completamente fija
        camera.inputs.clear();

        // Opcional: si quieres que la cámara tenga un poco de suavizado al seguir la acción
        camera.inertia = 0;
        camera.angularSensibilityX = 0;
        camera.angularSensibilityY = 0;



        // Iluminación mejorada
        const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.7;
        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
        dirLight.intensity = 0.5;

        // Crear el campo de fútbol
        const fieldWidth = 30;
        const fieldHeight = 20;
        const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: fieldWidth, height: fieldHeight }, scene);

        // Material para el campo de fútbol
        const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
        groundMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.1); // Verde césped
        ground.material = groundMaterial;

        // Añadir líneas al campo
        const drawFieldLines = () => {
            const lines = BABYLON.MeshBuilder.CreatePlane("lines", { size: 1 }, scene);
            const linesMaterial = new BABYLON.StandardMaterial("linesMat", scene);
            linesMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
            linesMaterial.alpha = 0.7;
            lines.material = linesMaterial;
            lines.rotation.x = Math.PI / 2;
            lines.position.y = 0.01; // Ligeramente por encima del campo

            const linesTexture = new BABYLON.DynamicTexture("linesTexture", { width: 1024, height: 1024 }, scene);
            const ctx = linesTexture.getContext();
            ctx.strokeStyle = "white";
            ctx.lineWidth = 5;

            // Líneas exteriores
            ctx.strokeRect(10, 10, 1004, 1004);

            // Línea central
            ctx.beginPath();
            ctx.moveTo(512, 10);
            ctx.lineTo(512, 1014);
            ctx.stroke();

            // Círculo central
            ctx.beginPath();
            ctx.arc(512, 512, 100, 0, 2 * Math.PI);
            ctx.stroke();

            // Áreas de penalti
            ctx.strokeRect(10, 337, 150, 350);
            ctx.strokeRect(864, 337, 150, 350);

            linesTexture.update();
            linesMaterial.diffuseTexture = linesTexture;
            lines.scaling = new BABYLON.Vector3(fieldWidth, fieldHeight, 1);
        };

        drawFieldLines();

        // Asignar impostor de física al suelo
        ground.physicsImpostor = new BABYLON.PhysicsImpostor(
            ground,
            BABYLON.PhysicsImpostor.BoxImpostor,
            { mass: 0, restitution: 0.9, friction: 0.1 },
            scene
        );

        // Crear la pelota con colores contrastantes
        const ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: 1 }, scene);
        const ballMaterial = new BABYLON.StandardMaterial('ballMat', scene);
        ballMaterial.diffuseTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/soccerball.png", scene);
        ball.material = ballMaterial;
        ball.position.y = 0.5;
        ballRef.current = ball;




        // Crear las porterías en los extremos correctos del campo
        const createGoal = (position) => {
            const goalFrame = new BABYLON.TransformNode("goalFrame", scene);
            goalFrame.position = position;

            const postMaterial = new BABYLON.StandardMaterial("postMat", scene);
            postMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);

            // Dimensiones de la portería
            const goalHeight = 2.44;  // Altura estándar de una portería de fútbol
            const goalWidth = 7.32;   // Ancho estándar de una portería de fútbol
            const postDiameter = 0.12;  // Diámetro aproximado de los postes

            // Postes verticales
            const createPost = (offsetZ) => {
                const post = BABYLON.MeshBuilder.CreateCylinder("post", { height: goalHeight, diameter: postDiameter }, scene);
                post.position = new BABYLON.Vector3(0, goalHeight / 2, offsetZ);
                post.material = postMaterial;
                post.parent = goalFrame;
            };
            createPost(-goalWidth / 2);
            createPost(goalWidth / 2);

            // Travesaño
            const crossbar = BABYLON.MeshBuilder.CreateCylinder("crossbar", { height: goalWidth, diameter: postDiameter }, scene);
            crossbar.rotation.x = Math.PI / 2;  // Rotación corregida
            crossbar.position.y = goalHeight;
            crossbar.position.z = 0;  // Centrar el travesaño
            crossbar.material = postMaterial;
            crossbar.parent = goalFrame;
        };

        // Crear las dos porterías en los extremos correctos
        createGoal(new BABYLON.Vector3(-fieldWidth / 2 + 0.5, 0, 0)); // Ajustar posición si es necesario
        createGoal(new BABYLON.Vector3(fieldWidth / 2 - 0.5, 0, 0));   // Ajustar posición si es necesario

        // Crear UI para el marcador
        const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');
        advancedTextureRef.current = advancedTexture; // Guardar la referencia

        const scoreBackground = new GUI.Rectangle();
        scoreBackground.width = '200px';
        scoreBackground.height = '40px';
        scoreBackground.cornerRadius = 20;
        scoreBackground.color = 'White';
        scoreBackground.thickness = 2;
        scoreBackground.background = 'Black';
        scoreBackground.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        scoreBackground.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        scoreBackground.top = '10px';
        advancedTexture.addControl(scoreBackground);

        const scoreText = new GUI.TextBlock();
        scoreText.text = '0 - 0';
        scoreText.color = 'white';
        scoreText.fontSize = 24;
        scoreBackground.addControl(scoreText);
        scoreTextRef.current = scoreText;

        setSceneReady(true);
        console.log('Escena creada exitosamente');
        return scene;
    }, []);

    const updateGameState = useCallback((gameState) => {
        if (!sceneReady || !gameState || !playerModelRef.current) {
            console.log('Esperando recursos:', {
                sceneReady,
                hasGameState: !!gameState,
                hasPlayerModel: !!playerModelRef.current,
                modelAnimations: playerAnimationsRef.current
            });
            return;
        }

        const { players, ballPosition, score, connectedPlayers } = gameState;

        // Actualizar posiciones de los jugadores
        if (players && Array.isArray(players)) {
            players.forEach((playerData) => {
                if (playerData && playerData.id && playerData.position) {
                    if (!playersRef.current[playerData.id]) {
                        // Crear mesh para el nuevo jugador
                        if (playerData.id === socketRef.current.id) {
                            // Para el jugador local, usar el modelo 3D
                            const playerInstance = playerModelRef.current.clone("playerLocal");
                            playerInstance.setEnabled(true);
                            playerInstance.scaling = new BABYLON.Vector3(0.015, 0.015, 0.015);

                            // Asegurarnos de que usamos rotation en lugar de rotationQuaternion
                            playerInstance.rotationQuaternion = null;

                            // Ajustar la rotación inicial del modelo
                            // Primero rotamos 90 grados en X para ponerlo vertical
                            // Luego rotamos en Y para orientarlo en la dirección correcta
                            playerInstance.rotation = new BABYLON.Vector3(
                                Math.PI / 2,  // Rotar 90 grados en X para ponerlo vertical
                                0,     // Rotar en Y para orientarlo hacia la dirección correcta
                                0            // No rotación en Z
                            );

                            // Crear un nodo padre para el modelo
                            const playerRoot = new BABYLON.TransformNode("playerRoot", sceneRef.current);
                            playerInstance.parent = playerRoot;

                            playersRef.current[playerData.id] = playerRoot;

                            // Iniciar animación idle por defecto
                            if (playerAnimationsRef.current.idle) {
                                playerAnimationsRef.current.idle.start(true);
                                currentAnimationRef.current = 'idle';
                            }
                        } else {
                            // Para otros jugadores, crear cubos
                            const playerMesh = BABYLON.MeshBuilder.CreateBox(
                                `player-${playerData.id}`,
                                { size: 1 },
                                sceneRef.current
                            );
                            const playerMaterial = new BABYLON.StandardMaterial(
                                `playerMat-${playerData.id}`,
                                sceneRef.current
                            );
                            playerMaterial.diffuseColor = new BABYLON.Color3(
                                Math.random(),
                                Math.random(),
                                Math.random()
                            );
                            playerMesh.material = playerMaterial;

                            playersRef.current[playerData.id] = playerMesh;
                        }

                        // Crear etiqueta para el jugador
                        const playerLabel = new GUI.Rectangle(`label-${playerData.id}`);
                        playerLabel.width = "100px";
                        playerLabel.height = "30px";
                        playerLabel.background = "black";
                        playerLabel.alpha = 0.5;
                        playerLabel.thickness = 0;
                        advancedTextureRef.current.addControl(playerLabel);

                        const nameText = new GUI.TextBlock();
                        nameText.text = playerData.name;
                        nameText.color = "white";
                        nameText.fontSize = 12;
                        nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                        nameText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
                        playerLabel.addControl(nameText);

                        // Vincular la etiqueta al mesh del jugador
                        playerLabel.linkWithMesh(playersRef.current[playerData.id]);
                        playerLabel.linkOffsetY = -130;

                        playersLabelsRef.current[playerData.id] = playerLabel;

                        // Si este es el jugador local, asignar la cámara al mesh
                        if (playerData.id === socketRef.current.id) {
                            sceneRef.current.activeCamera.lockedTarget = playersRef.current[playerData.id];
                        }


                    }

                    // Interpolación para suavizar el movimiento
                    const playerMesh = playersRef.current[playerData.id];
                    if (playerMesh) {
                        const currentPosition = playerMesh.position;
                        const targetPosition = new BABYLON.Vector3(
                            playerData.position.x,
                            0.5, // Forzar la posición Y a 0
                            playerData.position.z
                        );

                        // Interpolar entre la posición actual y la nueva posición
                        playerMesh.position = BABYLON.Vector3.Lerp(
                            currentPosition,
                            targetPosition,
                            0.3
                        );

                        // Rotar el modelo en la dirección del movimiento
                        if (playerData.id === socketRef.current.id) {
                            const deltaX = targetPosition.x - currentPosition.x;
                            const deltaZ = targetPosition.z - currentPosition.z;

                            if (Math.abs(deltaX) > 0.01 || Math.abs(deltaZ) > 0.01) {
                                const angle = Math.atan2(deltaX, deltaZ);
                                // Suavizar la rotación
                                const currentRotation = playerMesh.rotation.y;
                                const targetRotation = angle;
                                playerMesh.rotation.y = BABYLON.Scalar.Lerp(
                                    currentRotation,
                                    targetRotation,
                                    0.1
                                );
                            }
                        }

                        // Manejar las animaciones solo para el jugador local
                        if (playerData.id === socketRef.current.id && playerAnimationsRef.current) {
                            const isMoving = playerData.isMoving;
                            const currentAnim = currentAnimationRef.current;

                            if (isMoving && currentAnim !== 'running') {
                                if (playerAnimationsRef.current.idle) {
                                    playerAnimationsRef.current.idle.stop();
                                }
                                if (playerAnimationsRef.current.running) {
                                    playerAnimationsRef.current.running.start(true);
                                    currentAnimationRef.current = 'running';
                                }
                            } else if (!isMoving && currentAnim !== 'idle') {
                                if (playerAnimationsRef.current.running) {
                                    playerAnimationsRef.current.running.stop();
                                }
                                if (playerAnimationsRef.current.idle) {
                                    playerAnimationsRef.current.idle.start(true);
                                    currentAnimationRef.current = 'idle';
                                }
                            }
                        }
                    }
                }
            });

            // Eliminar meshes y etiquetas de jugadores que ya no están en el juego
            Object.keys(playersRef.current).forEach((id) => {
                if (!players.find(player => player.id === id)) {
                    // Eliminar el mesh del jugador
                    playersRef.current[id].dispose();
                    delete playersRef.current[id];

                    // Eliminar la etiqueta del jugador
                    if (playersLabelsRef.current[id]) {
                        playersLabelsRef.current[id].dispose();
                        delete playersLabelsRef.current[id];
                    }
                }
            });
        }

        // Actualizar posición de la pelota
        if (ballRef.current && ballPosition) {
            // Interpolación para suavizar el movimiento de la pelota
            const currentPosition = ballRef.current.position;
            const targetPosition = new BABYLON.Vector3(
                ballPosition.x,
                ballPosition.y,
                ballPosition.z
            );
            ballRef.current.position = BABYLON.Vector3.Lerp(
                currentPosition,
                targetPosition,
                0.3
            );
        }

        // Actualizar el marcador
        if (scoreTextRef.current && score) {
            const leftScore = score.left !== undefined ? score.left : 0;
            const rightScore = score.right !== undefined ? score.right : 0;
            scoreTextRef.current.text = `${leftScore} - ${rightScore}`;
        }

        // Actualizar la lista de jugadores conectados
        if (connectedPlayers) {
            setConnectedPlayers(connectedPlayers);
        }
    }, [sceneReady]);

    const handleJoinGame = (name) => {
        socketRef.current.emit('joinGame', { name });
        setPlayerName(name);
        setHasJoined(true);
    };

    const scrollToBottom = () => {
        if (chatMessagesRef.current) {
            const scrollHeight = chatMessagesRef.current.scrollHeight;
            const height = chatMessagesRef.current.clientHeight;
            const maxScrollTop = scrollHeight - height;
            chatMessagesRef.current.scrollTop = maxScrollTop > 0 ? maxScrollTop : 0;
        }
    };



    useEffect(() => {
        console.log('Componente Game montado');

        const canvas = canvasRef.current;
        const scene = createScene(canvas);

        engineRef.current.runRenderLoop(() => {
            scene.render();
        });

        const handleResize = () => {
            engineRef.current.resize();
        };



        window.addEventListener('resize', handleResize);

        console.log('Intentando conectar al servidor...');
        socketRef.current = io('http://localhost:4000', { transports: ['websocket'] });

        socketRef.current.on('connect', () => {
            console.log('Conectado al servidor con Socket ID:', socketRef.current.id);
            setIsConnected(true);
        });

        socketRef.current.on('gameStateUpdate', (gameState) => {
            console.log('Estado del juego recibido:', gameState);
            updateGameState(gameState);
        });

        socketRef.current.on('playersListUpdate', (playersList) => {
            console.log('Lista de jugadores actualizada:', playersList);
            setConnectedPlayers(playersList);
        });

        socketRef.current.on('chatUpdate', (chatMessage) => {
            console.log('Mensaje de chat recibido:', chatMessage);
            setChatMessages(prevMessages => [...prevMessages, chatMessage]);
            // Hacer scroll después de que el mensaje se haya añadido
            setTimeout(scrollToBottom, 100);
        });

        socketRef.current.on('disconnect', (reason) => {
            console.log('Desconectado del servidor del juego:', reason);
            setIsConnected(false);
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('Error de conexión:', error);
        });

        // Añade estos nuevos event listeners en el useEffect:
        socketRef.current.on('teamUpdate', (teamsData) => {
            setTeams(teamsData);
        });

        socketRef.current.on('teamSelected', ({ team }) => {
            setTeamSelected(true);
            setCurrentTeam(team);
        });

        const handleKeyDown = (event) => {
            if (chatInputFocusRef.current) {
                // Si el chat está enfocado, no procesar el evento para el juego
                return;
            }
            let direction = null;
            switch (event.key) {
                case "ArrowUp":
                case "w":
                    direction = "up";
                    break;
                case "ArrowDown":
                case "s":
                    direction = "down";
                    break;
                case "ArrowLeft":
                case "a":
                    direction = "left";
                    break;
                case "ArrowRight":
                case "d":
                    direction = "right";
                    break;
                default:
                    break;
            }
            if (direction && socketRef.current) {
                console.log(`Enviando inicio de movimiento: ${direction}`);
                socketRef.current.emit('playerMoveStart', { direction });
            }
        };

        const handleKeyUp = (event) => {
            if (chatInputFocusRef.current) {
                // Si el chat está enfocado, no procesar el evento para el juego
                return;
            }
            let direction = null;
            switch (event.key) {
                case "ArrowUp":
                case "w":
                    direction = "up";
                    break;
                case "ArrowDown":
                case "s":
                    direction = "down";
                    break;
                case "ArrowLeft":
                case "a":
                    direction = "left";
                    break;
                case "ArrowRight":
                case "d":
                    direction = "right";
                    break;
                default:
                    break;
            }
            if (direction && socketRef.current) {
                console.log(`Enviando detención de movimiento: ${direction}`);
                socketRef.current.emit('playerMoveStop', { direction });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            engineRef.current.dispose();
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [createScene, updateGameState]);

    // Añadir este useEffect después de los otros
    useEffect(() => {
        scrollToBottom();
    }, [chatMessages]); // Se ejecutará cada vez que chatMessages cambie

    const handleChatSubmit = (e) => {
        e.preventDefault();
        if (chatInput.trim() && socketRef.current) {
            console.log('Enviando mensaje de chat:', chatInput);
            socketRef.current.emit('chatMessage', chatInput);
            setChatInput('');
            setTimeout(scrollToBottom, 100);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden'
        }}>
            {isLoading && <LoadingScreen />}

            {!isLoading && !hasJoined && (
                <LoginScreen onJoin={handleJoinGame} />
            )}

            {!isLoading && hasJoined && !teamSelected && (
                <TeamSelectionScreen
                    onTeamSelect={(team) => {
                        socketRef.current.emit('selectTeam', { team });
                    }}
                    teams={teams}
                />
            )}

            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block'
                }}
            />

            {!isLoading && hasJoined && teamSelected && (
                <>
                    {/* Panel Superior */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        padding: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        pointerEvents: 'none'
                    }}>
                        {/* Lista de Jugadores por Equipo */}
                        <div style={{
                            color: 'white',
                            fontSize: '14px',
                            backgroundColor: 'rgba(0, 0, 0, 0.6)',
                            padding: '10px',
                            borderRadius: '8px',
                            maxWidth: '200px',
                            pointerEvents: 'auto'
                        }}>
                            <h3 style={{ margin: '0 0 8px 0' }}>Jugadores</h3>
                            {/* Equipo Azul */}
                            <div style={{ marginBottom: '10px' }}>
                                <h4 style={{
                                    margin: '0 0 4px 0',
                                    color: '#3b82f6' // Azul para equipo izquierdo
                                }}>
                                    Equipo Azul
                                </h4>
                                <ul style={{
                                    listStyleType: 'none',
                                    padding: 0,
                                    margin: 0
                                }}>
                                    {teams.left.map(player => (
                                        <li key={player.id} style={{ marginBottom: '2px' }}>
                                            {player.name}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            {/* Equipo Rojo */}
                            <div>
                                <h4 style={{
                                    margin: '0 0 4px 0',
                                    color: '#ef4444' // Rojo para equipo derecho
                                }}>
                                    Equipo Rojo
                                </h4>
                                <ul style={{
                                    listStyleType: 'none',
                                    padding: 0,
                                    margin: 0
                                }}>
                                    {teams.right.map(player => (
                                        <li key={player.id} style={{ marginBottom: '2px' }}>
                                            {player.name}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Instrucciones */}
                        <div style={{
                            color: 'white',
                            fontSize: '14px',
                            backgroundColor: 'rgba(0, 0, 0, 0.6)',
                            padding: '10px',
                            borderRadius: '8px',
                            pointerEvents: 'auto'
                        }}>
                            <h3 style={{ margin: '0 0 8px 0' }}>Controles</h3>
                            <p style={{ margin: '0 0 4px 0' }}>WASD o ↑←↓→ para moverte</p>
                            <p style={{ margin: '0' }}>Enter para enviar mensajes</p>
                        </div>
                    </div>

                    {/* Panel Inferior */}
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        pointerEvents: 'none'
                    }}>
                        {/* Info del Jugador y Conexión */}
                        <div style={{
                            display: 'flex',
                            gap: '10px',
                            pointerEvents: 'auto'
                        }}>
                            <div style={{
                                color: 'white',
                                fontSize: '14px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                {playerName || 'Desconocido'}
                                <span style={{
                                    marginLeft: '8px',
                                    color: currentTeam === 'left' ? '#3b82f6' : '#ef4444'
                                }}>
                                    ({currentTeam === 'left' ? 'Equipo Azul' : 'Equipo Rojo'})
                                </span>
                            </div>
                            <div style={{
                                color: 'white',
                                fontSize: '14px',
                                backgroundColor: isConnected ? 'rgba(39, 174, 96, 0.6)' : 'rgba(231, 76, 60, 0.6)',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                {isConnected ? 'Conectado' : 'Desconectado'}
                            </div>
                        </div>

                        {/* Chat */}
                        <div
                            style={{
                                width: '300px',
                                height: '250px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                pointerEvents: 'auto'
                            }}>
                            <div
                                ref={chatMessagesRef}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                {chatMessages.map((msg, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            marginBottom: '4px',
                                            wordBreak: 'break-word',
                                            fontSize: '14px',
                                            color: 'white'
                                        }}
                                    >
                                        <strong style={{
                                            // Determinar el color basado en los equipos actuales
                                            color: teams.left.find(p => p.id === msg.playerId) ? '#3b82f6' :
                                                teams.right.find(p => p.id === msg.playerId) ? '#ef4444' :
                                                    '#4CAF50'
                                        }}>
                                            {msg.playerName}:
                                        </strong>{' '}
                                        <span style={{ color: 'white' }}>{msg.message}</span>
                                    </div>
                                ))}
                            </div>
                            <form
                                onSubmit={handleChatSubmit}
                                style={{
                                    display: 'flex',
                                    padding: '10px',
                                    gap: '5px',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                                }}
                            >
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onFocus={() => { chatInputFocusRef.current = true; }}
                                    onBlur={() => { chatInputFocusRef.current = false; }}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        fontSize: '14px',
                                        color: 'white',
                                        outline: 'none'
                                    }}
                                    placeholder="Escribe un mensaje..."
                                />
                                <button
                                    type="submit"
                                    style={{
                                        padding: '8px 15px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        backgroundColor: '#4CAF50',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    Enviar
                                </button>
                            </form>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Game;