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
import CharacterManager from '../services/characterManager';
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
    const [gameInProgress, setGameInProgress] = useState(false);

    const [showingEndMessage, setShowingEndMessage] = useState(false);

    // Añadir nuevo estado para el personaje
    const [selectedCharacter, setSelectedCharacter] = useState(null);

    // En Game.js, añade estos nuevos estados:
    const [teamSelected, setTeamSelected] = useState(false);
    const [teams, setTeams] = useState({ left: [], right: [] });
    const [currentTeam, setCurrentTeam] = useState(null);

    // Añadir estos estados que faltaban:
    const [gameStarted, setGameStarted] = useState(false);

    const [readyState, setReadyState] = useState({ left: [], right: [] });

    // Añadir nueva referencia para el CharacterManager
    const characterManagerRef = useRef(null);


    // Añadir la función handleToggleReady que faltaba:
    const handleToggleReady = useCallback(() => {
        if (socketRef.current) {
            console.log('Enviando toggleReady');
            socketRef.current.emit('toggleReady');
        }
    }, []);

    // Ref para rastrear si el chat está enfocado
    const chatInputFocusRef = useRef(false);


    const chatMessagesRef = useRef(null);


    const createScene = useCallback((canvas) => {
        console.log('Creando escena de Babylon.js');
        const engine = new BABYLON.Engine(canvas, true);
        engineRef.current = engine;
        const scene = new BABYLON.Scene(engine);
        sceneRef.current = scene;

        // Inicializar CharacterManager
        characterManagerRef.current = new CharacterManager(scene);

        // Cargar los tres modelos
        const loadCharacters = async () => {
            try {
                await Promise.all([
                    characterManagerRef.current.loadCharacter('player'),
                    characterManagerRef.current.loadCharacter('pig'),
                    characterManagerRef.current.loadCharacter('croc'),
                    characterManagerRef.current.loadCharacter('turtle')
                ]);
                console.log('Todos los modelos cargados exitosamente');
                setSceneReady(true);
                setIsLoading(false);
            } catch (error) {
                console.error('Error cargando modelos:', error);
                setIsLoading(false);
            }
        };

        loadCharacters();

        // Configuración de la física
        const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
        const physicsPlugin = new BABYLON.CannonJSPlugin(undefined, undefined, CANNON);
        scene.enablePhysics(gravityVector, physicsPlugin);

        // Configuración de la cámara fija
        const camera = new BABYLON.ArcRotateCamera(
            "Camera",
            0,           // alpha (rotación horizontal)
            Math.PI / 3, // beta (rotación vertical)
            40,          // radio (distancia)
            new BABYLON.Vector3(0, 0, 0), // punto objetivo
            scene
        );

        // Posicionar la cámara
        camera.setPosition(new BABYLON.Vector3(0, 10, -10));
        camera.setTarget(BABYLON.Vector3.Zero());
        camera.inputs.clear();
        camera.inertia = 0;
        camera.angularSensibilityX = 0;
        camera.angularSensibilityY = 0;

        // Iluminación
        const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.7;
        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
        dirLight.intensity = 0.5;

        // Campo de fútbol
        const fieldWidth = 30;
        const fieldHeight = 20;
        const ground = BABYLON.MeshBuilder.CreateGround('ground', {
            width: fieldWidth,
            height: fieldHeight
        }, scene);

        const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
        groundMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.1);
        ground.material = groundMaterial;

        // Líneas del campo
        const drawFieldLines = () => {
            const lines = BABYLON.MeshBuilder.CreatePlane("lines", { size: 1 }, scene);
            const linesMaterial = new BABYLON.StandardMaterial("linesMat", scene);
            linesMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
            linesMaterial.alpha = 0.7;
            lines.material = linesMaterial;
            lines.rotation.x = Math.PI / 2;
            lines.position.y = 0.01;

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

        // Física del suelo
        ground.physicsImpostor = new BABYLON.PhysicsImpostor(
            ground,
            BABYLON.PhysicsImpostor.BoxImpostor,
            { mass: 0, restitution: 0.9, friction: 0.1 },
            scene
        );

        // Pelota
        const ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: 1 }, scene);
        const ballMaterial = new BABYLON.StandardMaterial('ballMat', scene);
        ballMaterial.diffuseTexture = new BABYLON.Texture("soccerball.png", scene);
        ball.material = ballMaterial;
        ball.position.y = 0.5;
        ballRef.current = ball;

        // Crear porterías
        const createGoal = (position) => {
            const goalFrame = new BABYLON.TransformNode("goalFrame", scene);
            goalFrame.position = position;

            const postMaterial = new BABYLON.StandardMaterial("postMat", scene);
            postMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);

            const goalHeight = 2.44;
            const goalWidth = 7.32;
            const postDiameter = 0.12;

            const createPost = (offsetZ) => {
                const post = BABYLON.MeshBuilder.CreateCylinder("post", {
                    height: goalHeight,
                    diameter: postDiameter
                }, scene);
                post.position = new BABYLON.Vector3(0, goalHeight / 2, offsetZ);
                post.material = postMaterial;
                post.parent = goalFrame;
            };

            createPost(-goalWidth / 2);
            createPost(goalWidth / 2);

            const crossbar = BABYLON.MeshBuilder.CreateCylinder("crossbar", {
                height: goalWidth,
                diameter: postDiameter
            }, scene);
            crossbar.rotation.x = Math.PI / 2;
            crossbar.position.y = goalHeight;
            crossbar.position.z = 0;
            crossbar.material = postMaterial;
            crossbar.parent = goalFrame;
        };

        createGoal(new BABYLON.Vector3(-fieldWidth / 2 + 0.5, 0, 0));
        createGoal(new BABYLON.Vector3(fieldWidth / 2 - 0.5, 0, 0));

        // UI del marcador
        const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');
        advancedTextureRef.current = advancedTexture;

        const scoreBackground = new GUI.Rectangle();
        scoreBackground.width = '300px';  // Aumentado de 200px
        scoreBackground.height = '40px';
        scoreBackground.cornerRadius = 20;
        scoreBackground.color = 'White';
        scoreBackground.thickness = 2;
        scoreBackground.background = 'Black';
        scoreBackground.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        scoreBackground.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        scoreBackground.top = '10px';
        advancedTexture.addControl(scoreBackground);

        // Marcador equipo izquierdo (Mamíferos)
        const leftScoreText = new GUI.TextBlock();
        leftScoreText.text = "0";
        leftScoreText.color = '#3b82f6';  // Mamíferos
        leftScoreText.fontSize = 24;
        leftScoreText.left = "-40px";
        scoreBackground.addControl(leftScoreText);

        // Separador
        const separator = new GUI.TextBlock();
        separator.text = "-";
        separator.color = 'white';
        separator.fontSize = 24;
        scoreBackground.addControl(separator);

        // Marcador equipo derecho (Reptiles)
        const rightScoreText = new GUI.TextBlock();
        rightScoreText.text = "0";
        rightScoreText.color = '#ef4444';  // Reptiles
        rightScoreText.fontSize = 24;
        rightScoreText.left = "40px";
        scoreBackground.addControl(rightScoreText);

        // Actualizar la referencia
        scoreTextRef.current = { left: leftScoreText, right: rightScoreText };

        return scene;
    }, []);

    const updateGameState = useCallback((gameState) => {
        if (!sceneReady || !gameState || !characterManagerRef.current) {
            console.log('Esperando recursos:', {
                sceneReady,
                hasGameState: !!gameState,
                hasCharacterManager: !!characterManagerRef.current
            });
            return;
        }

        const { players, ballPosition, score, connectedPlayers } = gameState;

        // Actualizar jugadores
        if (players && Array.isArray(players)) {
            players.forEach(async (playerData) => {
                if (!playerData || !playerData.id || !playerData.position) return;

                if (!playersRef.current[playerData.id]) {
                    try {
                        console.log(`Creando instancia para jugador ${playerData.id} con personaje ${playerData.characterType}`);

                        const playerInstance = await characterManagerRef.current.createPlayerInstance(
                            playerData.id,
                            playerData.characterType || 'player', // Fallback al modelo por defecto
                            playerData.team
                        );

                        playersRef.current[playerData.id] = playerInstance;

                        // En Game.js, cuando se crean las etiquetas de los jugadores
                        const playerLabel = new GUI.Rectangle(`label-${playerData.id}`);
                        playerLabel.width = "120px";
                        playerLabel.height = "30px";
                        playerLabel.background = playerData.team === 'left' ? "rgba(59, 130, 246, 0.8)" : "rgba(239, 68, 68, 0.8)";
                        playerLabel.cornerRadius = 15;
                        playerLabel.thickness = 1;
                        playerLabel.color = "white";
                        playerLabel.isPointerBlocker = false;
                        advancedTextureRef.current.addControl(playerLabel);


                        const nameText = new GUI.TextBlock();
                        nameText.text = playerData.name;
                        nameText.color = "white";
                        nameText.fontSize = 14;
                        nameText.fontWeight = "bold";
                        nameText.fontFamily = "Arial";
                        nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                        nameText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
                        playerLabel.addControl(nameText);

                        playerLabel.linkWithMesh(playerInstance);
                        playerLabel.linkOffsetY = -170;
                        playerLabel.zIndex = 1;

                        playersLabelsRef.current[playerData.id] = playerLabel;

                        // Si es el jugador local, configurar la cámara
                        if (playerData.id === socketRef.current.id) {
                            sceneRef.current.activeCamera.lockedTarget = playerInstance;
                        }

                    } catch (error) {
                        console.error('Error creando instancia de jugador:', error);
                    }
                }

                // Actualizar posición y animación
                const playerInstance = playersRef.current[playerData.id];
                if (playerInstance) {
                    const currentPosition = playerInstance.position;
                    const targetPosition = new BABYLON.Vector3(
                        playerData.position.x,
                        0.5,
                        playerData.position.z
                    );

                    // Interpolar posición
                    playerInstance.position = BABYLON.Vector3.Lerp(
                        currentPosition,
                        targetPosition,
                        0.3
                    );

                    // Calcular rotación basada en el movimiento
                    const deltaX = targetPosition.x - currentPosition.x;
                    const deltaZ = targetPosition.z - currentPosition.z;

                    if (Math.abs(deltaX) > 0.01 || Math.abs(deltaZ) > 0.01) {
                        const angle = Math.atan2(deltaX, deltaZ);
                        const currentRotation = playerInstance.rotation.y;
                        const targetRotation = angle;

                        // Interpolar rotación
                        playerInstance.rotation.y = BABYLON.Scalar.Lerp(
                            currentRotation,
                            targetRotation,
                            0.1
                        );
                    }

                    // Actualizar animación
                    characterManagerRef.current.updatePlayerAnimation(
                        playerData.id,
                        playerData.isMoving
                    );
                }
            });

            // Limpiar jugadores desconectados
            Object.keys(playersRef.current).forEach((id) => {
                if (!players.find(player => player.id === id)) {
                    console.log(`Removiendo jugador desconectado: ${id}`);

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

        // Actualizar posición de la pelota
        if (ballRef.current && ballPosition) {
            const currentPosition = ballRef.current.position;
            const targetPosition = new BABYLON.Vector3(
                ballPosition.x,
                ballPosition.y || 0.5,
                ballPosition.z
            );

            // Calcular velocidad
            const velocity = targetPosition.subtract(currentPosition);
            const speed = velocity.length();

            // Calcular ejes de rotación
            const rotationAxis = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), velocity.normalize());

            // Aplicar rotación solo si hay movimiento significativo
            if (speed > 0.01) {
                // La velocidad de rotación es proporcional a la velocidad de movimiento
                const rotationSpeed = speed * 8;

                // Rotar alrededor del eje calculado
                ballRef.current.rotate(rotationAxis, rotationSpeed, BABYLON.Space.WORLD);
            }

            // Interpolar posición
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
            scoreTextRef.current.left.text = leftScore.toString();
            scoreTextRef.current.right.text = rightScore.toString();
        }

        // Actualizar lista de jugadores conectados
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
        // socketRef.current = io('http://localhost:4000', { transports: ['websocket'] });
        // Nueva línea en Game.js
        socketRef.current = io('https://football-online-3d.dantecollazzi.com', {
            transports: ['websocket']
        });

        socketRef.current.on('connect', () => {
            console.log('Conectado al servidor con Socket ID:', socketRef.current.id);
            setIsConnected(true);
        });

        socketRef.current.on('gameStateUpdate', (gameState) => {
            //  console.log('Estado del juego recibido:', gameState);
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

        socketRef.current.on('gameInProgress', () => {
            setGameInProgress(true);
        });

        socketRef.current.on('gameStateInfo', ({ currentState }) => {
            setGameInProgress(currentState === 'playing');
        });

        socketRef.current.on('gameStart', () => {
            setGameStarted(true);
            setTeamSelected(true);
            setGameInProgress(true);
        });

        socketRef.current.on('readyUpdate', (readyStatus) => {
            console.log('Ready status recibido:', readyStatus);
            setReadyState(readyStatus);
        });

        socketRef.current.on('playerUpdate', async ({ id, name, characterType, team }) => {
            console.log(`Actualización de jugador recibida:`, { id, name, characterType, team });

            const isLocalPlayer = id === socketRef.current.id;
            const currentCamera = sceneRef.current?.activeCamera;
            let previousPosition = null;

            // Si el jugador existe, guardar su posición y limpiarlo
            if (playersRef.current[id]) {
                previousPosition = playersRef.current[id].position.clone();
                characterManagerRef.current.removePlayer(id);
                delete playersRef.current[id];

                if (playersLabelsRef.current[id]) {
                    playersLabelsRef.current[id].dispose();
                    delete playersLabelsRef.current[id];
                }
            }

            // Crear jugador si tiene un tipo de personaje
            if (characterType) {
                try {
                    const playerInstance = await characterManagerRef.current.createPlayerInstance(
                        id,
                        characterType,
                        team
                    );

                    // Usar posición previa o posición inicial según el equipo
                    if (previousPosition) {
                        playerInstance.position = previousPosition;
                    } else {
                        playerInstance.position = new BABYLON.Vector3(
                            team === 'left' ? -15 : 15,
                            0.5,
                            0
                        );
                    }

                    playersRef.current[id] = playerInstance;

                    // Crear etiqueta del jugador
                    const playerLabel = new GUI.Rectangle(`label-${id}`);
                    playerLabel.width = "120px";
                    playerLabel.height = "30px";
                    playerLabel.background = team === 'left' ? "rgba(59, 130, 246, 0.8)" : "rgba(239, 68, 68, 0.8)";
                    playerLabel.cornerRadius = 15;
                    playerLabel.thickness = 1;
                    playerLabel.color = "white";
                    playerLabel.isPointerBlocker = false;
                    advancedTextureRef.current.addControl(playerLabel);

                    const nameText = new GUI.TextBlock();
                    nameText.text = name;
                    nameText.color = "white";
                    nameText.fontSize = 14;
                    nameText.fontWeight = "bold";
                    nameText.fontFamily = "Arial";
                    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                    nameText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
                    playerLabel.addControl(nameText);

                    playerLabel.linkWithMesh(playerInstance);
                    playerLabel.linkOffsetY = -170;
                    playerLabel.zIndex = 1;

                    playersLabelsRef.current[id] = playerLabel;

                    // Configurar cámara para el jugador local
                    if (isLocalPlayer && currentCamera) {
                        currentCamera.lockedTarget = playerInstance;
                    }
                } catch (error) {
                    console.error('Error al actualizar instancia de jugador:', error);
                }
            }
        });


        // En Game.js, añadir el listener para el evento de gol
        socketRef.current.on('goalScored', ({ team, score }) => {
            // Efecto de flash en la pantalla
            const flashScreen = new GUI.Rectangle("goalFlash");
            flashScreen.width = "100%";
            flashScreen.height = "100%";
            flashScreen.thickness = 0;
            flashScreen.background = team === 'left' ? "#3b82f680" : "#ef444480";
            flashScreen.zIndex = 999;
            advancedTextureRef.current.addControl(flashScreen);

            // Texto de GOL
            const goalText = new GUI.TextBlock();
            goalText.text = "¡GOL!";
            goalText.color = "white";
            goalText.fontSize = 120;
            goalText.fontWeight = "bold";
            goalText.outlineWidth = 3;
            goalText.outlineColor = "black";
            goalText.shadowColor = "black";
            goalText.shadowBlur = 10;
            goalText.shadowOffsetX = 5;
            goalText.shadowOffsetY = 5;
            advancedTextureRef.current.addControl(goalText);

            // Texto del equipo
            const teamText = new GUI.TextBlock();
            teamText.text = team === 'left' ? "¡EQUIPO AZUL!" : "¡EQUIPO ROJO!";
            teamText.color = team === 'left' ? "#3b82f6" : "#ef4444";
            teamText.fontSize = 60;
            teamText.fontWeight = "bold";
            teamText.top = "80px";
            teamText.outlineWidth = 2;
            teamText.outlineColor = "black";
            advancedTextureRef.current.addControl(teamText);

            // Animación
            let scaleStep = 0;
            const scaleInterval = setInterval(() => {
                scaleStep++;
                goalText.scaleX = 1 + Math.sin(scaleStep * 0.2) * 0.2;
                goalText.scaleY = 1 + Math.sin(scaleStep * 0.2) * 0.2;

                if (scaleStep >= 20) {
                    clearInterval(scaleInterval);
                }
            }, 50);

            // Remover elementos después de 2 segundos
            setTimeout(() => {
                flashScreen.dispose();
                goalText.dispose();
                teamText.dispose();
            }, 1000);


        });


        // En Game.js, dentro del useEffect donde se configuran los sockets
        socketRef.current.on('gameEnd', ({ reason, finalScore, winningTeam }) => {
            setShowingEndMessage(true);
            setSelectedCharacter(null);
            setTeamSelected(false);
            setCurrentTeam(null);

            socketRef.current.emit('selectCharacter', { characterType: null });

            // Limpiar visualización del personaje
            const playerData = playersRef.current[socketRef.current.id];
            if (playerData) {
                characterManagerRef.current.removePlayer(socketRef.current.id);
                delete playersRef.current[socketRef.current.id];
            }

            if (advancedTextureRef.current) {
                // Determinar el equipo ganador de manera segura
                const isBlueTeam = winningTeam === 'left';
                const teamColor = isBlueTeam ? '#3b82f6' : '#ef4444';
                const teamName = isBlueTeam ? "EQUIPO MAMÍFEROS" : "EQUIPO REPTILES";

                // Fondo oscuro semi-transparente
                const fullscreenBg = new GUI.Rectangle("fullscreenBg");
                fullscreenBg.width = "100%";
                fullscreenBg.height = "100%";
                fullscreenBg.background = "rgba(0, 0, 0, 0.7)";
                fullscreenBg.thickness = 0;
                advancedTextureRef.current.addControl(fullscreenBg);

                // Contenedor principal ajustado
                const victoryMessage = new GUI.Rectangle("victoryMessage");
                victoryMessage.width = "600px";
                victoryMessage.height = "300px";
                victoryMessage.thickness = 2;
                victoryMessage.color = teamColor;
                victoryMessage.background = "rgba(0, 0, 0, 0.9)";
                victoryMessage.cornerRadius = 20;
                victoryMessage.shadowColor = teamColor;
                victoryMessage.shadowBlur = 15;
                victoryMessage.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                victoryMessage.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
                advancedTextureRef.current.addControl(victoryMessage);

                // Título principal ajustado
                const titleText = new GUI.TextBlock();
                titleText.text = "¡VICTORIA!";
                titleText.color = teamColor;
                titleText.fontSize = 48;
                titleText.fontFamily = "Arial";
                titleText.fontWeight = "bold";
                titleText.top = "-80px";
                victoryMessage.addControl(titleText);

                // Subtítulo del equipo ganador
                const subtitleText = new GUI.TextBlock();
                subtitleText.text = teamName;
                subtitleText.color = teamColor;
                subtitleText.fontSize = 36;
                subtitleText.fontFamily = "Arial";
                subtitleText.fontWeight = "bold";
                subtitleText.top = "-30px";
                victoryMessage.addControl(subtitleText);

                // Línea decorativa ajustada
                const line = new GUI.Rectangle("line");
                line.width = "400px";
                line.height = "2px";
                line.background = teamColor;
                line.top = "10px";
                victoryMessage.addControl(line);

                // Score ajustado
                if (finalScore) {
                    const scoreText = new GUI.TextBlock();
                    scoreText.text = "RESULTADO FINAL";
                    scoreText.color = "white";
                    scoreText.fontSize = 24;
                    scoreText.top = "40px";
                    victoryMessage.addControl(scoreText);

                    const scoreNumbers = new GUI.TextBlock();
                    scoreNumbers.text = `${finalScore.left} - ${finalScore.right}`;
                    scoreNumbers.color = "white";
                    scoreNumbers.fontSize = 64;
                    scoreNumbers.fontWeight = "bold";
                    scoreNumbers.top = "90px";
                    victoryMessage.addControl(scoreNumbers);
                }

                // Animaciones
                victoryMessage.alpha = 0;
                let alpha = 0;
                const fadeIn = setInterval(() => {
                    alpha += 0.05;
                    victoryMessage.alpha = alpha;
                    fullscreenBg.alpha = alpha;
                    if (alpha >= 1) clearInterval(fadeIn);
                }, 50);

                setTimeout(() => {
                    let alpha = 1;
                    const fadeOut = setInterval(() => {
                        alpha -= 0.05;
                        victoryMessage.alpha = alpha;
                        fullscreenBg.alpha = alpha;
                        if (alpha <= 0) {
                            clearInterval(fadeOut);
                            if (advancedTextureRef.current) {
                                victoryMessage.dispose();
                                fullscreenBg.dispose();
                            }
                            setShowingEndMessage(false);
                            setGameStarted(false);
                            setGameInProgress(false);
                        }
                    }, 50);
                }, 4500);
            }
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
            if (characterManagerRef.current) {
                characterManagerRef.current.dispose();
            }
            if (engineRef.current) {
                engineRef.current.dispose();
            }
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
            overflow: 'auto'
        }}>
            {isLoading && <LoadingScreen />}

            {!isLoading && !hasJoined && (
                <LoginScreen onJoin={handleJoinGame} />
            )}


            {!isLoading && hasJoined && !gameStarted && !showingEndMessage && (

                <div style={{ maxHeight: '100%', overflow: 'auto' }}>
                    <TeamSelectionScreen
                        onTeamSelect={(team) => {
                            console.log('Seleccionando equipo:', team);
                            socketRef.current.emit('selectTeam', { team });
                        }}
                        onCharacterSelect={(characterType) => {
                            console.log('Seleccionando personaje:', characterType);
                            setSelectedCharacter(characterType);
                            socketRef.current.emit('selectCharacter', { characterType });
                        }}
                        teams={teams}
                        readyState={readyState}
                        onToggleReady={handleToggleReady}
                        currentTeam={currentTeam}
                        playerName={playerName}
                        gameInProgress={gameInProgress}
                        selectedCharacter={selectedCharacter}
                    />

                </div>

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
                            {/* Equipo Mamíferos */}
                            <div style={{ marginBottom: '10px' }}>
                                <h4 style={{
                                    margin: '0 0 4px 0',
                                    color: '#3b82f6' // Mamíferos para equipo izquierdo
                                }}>
                                    Equipo Mamíferos
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
                            {/* Equipo Reptiles */}
                            <div>
                                <h4 style={{
                                    margin: '0 0 4px 0',
                                    color: '#ef4444' // Reptiles para equipo derecho
                                }}>
                                    Equipo Reptiles
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
                                    ({currentTeam === 'left' ? 'Equipo Mamíferos' : 'Equipo Reptiles'})
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