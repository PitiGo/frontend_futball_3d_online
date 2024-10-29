import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/core/Physics/physicsEngineComponent';
import '@babylonjs/core/Physics/Plugins/cannonJSPlugin';
import * as GUI from '@babylonjs/gui';
import { io } from 'socket.io-client';
import * as CANNON from 'cannon-es';
import '@babylonjs/inspector';

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

    // Ref para rastrear si el chat está enfocado
    const chatInputFocusRef = useRef(false);

    const createScene = useCallback((canvas) => {
        console.log('Creando escena de Babylon.js');
        const engine = new BABYLON.Engine(canvas, true);
        engineRef.current = engine;
        const scene = new BABYLON.Scene(engine);
        sceneRef.current = scene;

        scene.debugLayer.show();


        // Configuración de la física
        const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
        const physicsPlugin = new BABYLON.CannonJSPlugin(undefined, undefined, CANNON);
        scene.enablePhysics(gravityVector, physicsPlugin);

        // Configuración de la cámara FollowCamera
        const camera = new BABYLON.FollowCamera("FollowCam", new BABYLON.Vector3(0, 10, -10), scene);
        camera.radius = 15;
        camera.heightOffset = 7;
        camera.rotationOffset = 180;
        camera.cameraAcceleration = 0.05;
        camera.maxCameraSpeed = 10;

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
        if (!sceneReady || !gameState) {
            console.log('La escena aún no está lista o gameState es nulo.');
            return;
        }

        const { players, ballPosition, score, connectedPlayers } = gameState;
        console.log('Actualizando el estado del juego:', gameState);

        // Actualizar posiciones de los jugadores
        if (players && Array.isArray(players)) {
            players.forEach((playerData) => {
                if (playerData && playerData.id && playerData.position) {
                    if (!playersRef.current[playerData.id]) {
                        // Crear mesh para el nuevo jugador
                        const playerMesh = BABYLON.MeshBuilder.CreateBox(`player-${playerData.id}`, { size: 1 }, sceneRef.current);
                        const playerMaterial = new BABYLON.StandardMaterial(`playerMat-${playerData.id}`, sceneRef.current);
                        playerMaterial.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
                        playerMesh.material = playerMaterial;
                        playersRef.current[playerData.id] = playerMesh;

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
                        playerLabel.linkWithMesh(playerMesh);
                        playerLabel.linkOffsetY = -50; // Ajusta este valor según sea necesario

                        playersLabelsRef.current[playerData.id] = playerLabel;

                        // Si este es el jugador local, asignar la cámara al mesh
                        if (playerData.id === socketRef.current.id) {
                            sceneRef.current.activeCamera.lockedTarget = playerMesh;
                        }
                    }

                    // Interpolación para suavizar el movimiento
                    const playerMesh = playersRef.current[playerData.id];
                    if (playerMesh) {
                        const currentPosition = playerMesh.position;
                        const targetPosition = new BABYLON.Vector3(
                            playerData.position.x,
                            playerData.position.y,
                            playerData.position.z
                        );

                        // Interpolar entre la posición actual y la nueva posición
                        playerMesh.position = BABYLON.Vector3.Lerp(currentPosition, targetPosition, 0.3);
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
            const targetPosition = new BABYLON.Vector3(ballPosition.x, ballPosition.y, ballPosition.z);
            ballRef.current.position = BABYLON.Vector3.Lerp(currentPosition, targetPosition, 0.3);
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
            const name = `Player${Math.floor(Math.random() * 1000)}`;
            console.log('Conectado al servidor con Socket ID:', socketRef.current.id);
            socketRef.current.emit('joinGame', { name });
            setPlayerName(name);
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
        });

        socketRef.current.on('disconnect', (reason) => {
            console.log('Desconectado del servidor del juego:', reason);
            setIsConnected(false);
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('Error de conexión:', error);
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

    const handleChatSubmit = (e) => {
        e.preventDefault();
        if (chatInput.trim() && socketRef.current) {
            console.log('Enviando mensaje de chat:', chatInput);
            socketRef.current.emit('chatMessage', chatInput);
            setChatInput('');
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%' }}
            />

            {/* Información del Jugador */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                color: 'white',
                fontSize: '18px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                padding: '5px 10px',
                borderRadius: '5px',
                zIndex: 2
            }}>
                Jugador: {playerName || 'Desconocido'}
            </div>

            {/* Estado de Conexión */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                color: 'white',
                fontSize: '18px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                padding: '5px 10px',
                borderRadius: '5px',
                zIndex: 2
            }}>
                Estado de conexión: {isConnected ? 'Conectado' : 'Desconectado'}
            </div>

            {/* Lista de Jugadores Conectados */}
            <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                color: 'white',
                fontSize: '16px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                padding: '10px',
                borderRadius: '5px',
                zIndex: 2
            }}>
                <h3>Jugadores Conectados:</h3>
                <ul style={{ listStyleType: 'none', padding: 0 }}>
                    {connectedPlayers.map(player => (
                        <li key={player.id}>{player.name}</li>
                    ))}
                </ul>
            </div>

            {/* Chat UI */}
            <div style={{
                position: 'absolute',
                bottom: '50px',
                right: '10px',
                width: '300px',
                height: '300px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 2
            }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {chatMessages.map((msg, index) => (
                        <div key={index}>
                            <strong>{msg.playerName}:</strong> {msg.message}
                        </div>
                    ))}
                </div>
                <form onSubmit={handleChatSubmit} style={{ display: 'flex', padding: '10px' }}>
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onFocus={() => { chatInputFocusRef.current = true; }}
                        onBlur={() => { chatInputFocusRef.current = false; }}
                        style={{ flex: 1, marginRight: '5px' }}
                        placeholder="Write a message..."
                    />
                    <button type="submit">Enviar</button>
                </form>
            </div>
        </div>
    );
};

export default Game;