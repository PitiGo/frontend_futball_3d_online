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
import MobileJoystick from './MobileJoystick';  // <-- Añadir esta línea
import LanguageSelector from '../i18n/LanguageSelector';
import { useTranslation } from '../i18n/LanguageContext';


const Game = () => {


    const { t } = useTranslation();
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
    const [score, setScore] = useState({ left: 0, right: 0 });

    const [showingEndMessage, setShowingEndMessage] = useState(false);

    // Añadir nuevo estado para el personaje
    const [selectedCharacter, setSelectedCharacter] = useState(null);
    const [currentDirection, setCurrentDirection] = useState(null);

    // En Game.js, añade estos nuevos estados:
    const [teamSelected, setTeamSelected] = useState(false);
    const [teams, setTeams] = useState({ left: [], right: [] });
    const [currentTeam, setCurrentTeam] = useState(null);

    // Añadir estos estados que faltaban:
    const [gameStarted, setGameStarted] = useState(false);

    const [readyState, setReadyState] = useState({ left: [], right: [] });

    // Añadir nueva referencia para el CharacterManager
    const characterManagerRef = useRef(null);

    const controlEffectsRef = useRef(null);


    // Añadir detección de dispositivo móvil
    const [isMobile, setIsMobile] = useState(false);


    const [chatExpanded, setChatExpanded] = useState(true)


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
    // Añadir estado para el chat móvil
    const [chatVisible, setChatVisible] = useState(false);
    const [isMobileChatExpanded, setIsMobileChatExpanded] = useState(false);

    const createControlEffect = (scene, advancedTexture) => {
        // Crear un anillo alrededor del jugador
        const controlRing = BABYLON.MeshBuilder.CreateTorus("controlRing", {
            diameter: 3,
            thickness: 0.2,
            tessellation: 32
        }, scene);

        const ringMaterial = new BABYLON.StandardMaterial("ringMaterial", scene);
        ringMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.8, 1);
        ringMaterial.alpha = 0.6;
        controlRing.material = ringMaterial;
        controlRing.isVisible = false;

        // Crear un sistema de partículas personalizado usando esferas pequeñas
        const particles = [];
        const maxParticles = 20;

        for (let i = 0; i < maxParticles; i++) {
            const particle = BABYLON.MeshBuilder.CreateSphere("particle" + i, {
                diameter: 0.1,
                segments: 8
            }, scene);

            const particleMaterial = new BABYLON.StandardMaterial("particleMat" + i, scene);
            particleMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.8, 1);
            particleMaterial.alpha = 0.6;
            particle.material = particleMaterial;
            particle.isVisible = false;

            // Agregar propiedades de animación
            particle.life = 0;
            particle.maxLife = 0.5 + Math.random() * 0.5; // Entre 0.5 y 1 segundo
            particle.velocity = new BABYLON.Vector3(0, 0, 0);

            particles.push(particle);
        }

        // Función para animar las partículas
        const animateParticles = (ballPosition) => {
            particles.forEach(particle => {
                if (particle.life > 0) {
                    // Actualizar posición
                    particle.position.addInPlace(particle.velocity);

                    // Actualizar vida y opacidad
                    particle.life -= scene.getEngine().getDeltaTime() / 1000;
                    particle.material.alpha = (particle.life / particle.maxLife) * 0.6;

                    if (particle.life <= 0) {
                        particle.isVisible = false;
                    }
                } else if (Math.random() < 0.1) { // Probabilidad de emisión
                    // Reiniciar partícula
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 0.5;

                    particle.position = new BABYLON.Vector3(
                        ballPosition.x + Math.cos(angle) * radius,
                        ballPosition.y,
                        ballPosition.z + Math.sin(angle) * radius
                    );

                    particle.velocity = new BABYLON.Vector3(
                        (Math.random() - 0.5) * 0.1,
                        0.05,
                        (Math.random() - 0.5) * 0.1
                    );

                    particle.life = particle.maxLife;
                    particle.isVisible = true;
                    particle.material.alpha = 0.6;
                }
            });
        };

        // Detener animación
        const stopParticles = () => {
            particles.forEach(particle => {
                particle.isVisible = false;
                particle.life = 0;
            });
        };

        // Texto flotante para el tiempo de control
        const controlTimeText = new GUI.TextBlock();
        controlTimeText.text = "";
        controlTimeText.color = "white";
        controlTimeText.fontSize = 14;
        controlTimeText.fontWeight = "bold";
        controlTimeText.isVisible = false;
        advancedTexture.addControl(controlTimeText);

        // Crear un halo alrededor del balón
        const ballHalo = BABYLON.MeshBuilder.CreateTorus("ballHalo", {
            diameter: 1.2,
            thickness: 0.1,
            tessellation: 32
        }, scene);

        const haloMaterial = new BABYLON.StandardMaterial("haloMaterial", scene);
        haloMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.8, 1);
        haloMaterial.alpha = 0.4;
        ballHalo.material = haloMaterial;
        ballHalo.isVisible = false;

        return {
            controlRing,
            animateParticles,
            stopParticles,
            controlTimeText,
            ballHalo,
            particles // Necesario para la limpieza
        };
    };



    const createScene = useCallback((canvas) => {
        console.log('Creando escena de Babylon.js');
        const engine = new BABYLON.Engine(canvas, true);
        // En el createScene
        if (isMobile) {
            engine.setHardwareScalingLevel(1.5); // Reducir resolución en móviles
            engine.adaptToDeviceRatio = false;
        }
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
                    characterManagerRef.current.loadCharacter('lizard'),
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
        camera.setPosition(new BABYLON.Vector3(0, 15, -20));

        if (isMobile) {
            camera.setPosition(new BABYLON.Vector3(0, 20, -25)); // Vista más elevada
            camera.fov = 0.8; // Campo de visión más amplio
        }
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
        const fieldWidth = 40;
        const fieldHeight = 30;
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

            // Dimensiones coherentes con el servidor
            const goalHeight = 3;  // Altura estándar de portería
            const goalWidth = 7;      // Igual a GOAL_DEPTH del servidor
            const postDiameter = 0.15;

            // Crear los postes verticales
            const createPost = (offsetZ) => {
                const post = BABYLON.MeshBuilder.CreateCylinder("post", {
                    height: goalHeight,
                    diameter: postDiameter
                }, scene);
                post.position = new BABYLON.Vector3(0, goalHeight / 2, offsetZ);
                post.material = postMaterial;
                post.parent = goalFrame;

                // Añadir física a los postes
                post.physicsImpostor = new BABYLON.PhysicsImpostor(
                    post,
                    BABYLON.PhysicsImpostor.CylinderImpostor,
                    { mass: 0, restitution: 0.1 },
                    scene
                );
            };

            // Crear postes en las posiciones correctas
            createPost(-goalWidth / 2);  // Poste izquierdo
            createPost(goalWidth / 2);   // Poste derecho

            // Travesaño
            const crossbar = BABYLON.MeshBuilder.CreateCylinder("crossbar", {
                height: goalWidth,
                diameter: postDiameter
            }, scene);
            crossbar.rotation.x = Math.PI / 2;
            crossbar.position.y = goalHeight;
            crossbar.position.z = 0;
            crossbar.material = postMaterial;
            crossbar.parent = goalFrame;

            // Añadir física al travesaño
            crossbar.physicsImpostor = new BABYLON.PhysicsImpostor(
                crossbar,
                BABYLON.PhysicsImpostor.CylinderImpostor,
                { mass: 0, restitution: 0.1 },
                scene
            );

            return goalFrame;
        };

        createGoal(new BABYLON.Vector3(-fieldWidth / 2 + 0.1, 0, 0));  // Portería izquierda
        createGoal(new BABYLON.Vector3(fieldWidth / 2 - 0.1, 0, 0));   // Portería derecha

        // UI del marcador
        const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');
        advancedTextureRef.current = advancedTexture;

        // Inicializar los efectos de control después de crear la textura
        controlEffectsRef.current = createControlEffect(scene, advancedTexture);


        // Solo crear el marcador de Babylon si NO es móvil
        if (!isMobile) {
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
        }

        sceneRef.current.registerBeforeRender(() => {
            if (ballRef.current && controlEffectsRef.current) {
                // Actualizar posición del halo
                controlEffectsRef.current.ballHalo.position = ballRef.current.position.clone();
                controlEffectsRef.current.ballHalo.rotation.y += 0.02; // Rotación suave

                // Animar partículas si están visibles
                if (controlEffectsRef.current.ballHalo.isVisible) {
                    controlEffectsRef.current.animateParticles(ballRef.current.position);
                }
            }
        });

        controlEffectsRef.current = createControlEffect(scene, advancedTexture);

        return scene;
    }, [isMobile]);

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
                        playerLabel.width = isMobile ? "80px" : "120px";  // Más pequeño en móvil
                        playerLabel.height = isMobile ? "20px" : "30px";  // Más pequeño en móvil
                        playerLabel.background = playerData.team === 'left' ? "rgba(59, 130, 246, 0.8)" : "rgba(239, 68, 68, 0.8)";
                        playerLabel.cornerRadius = isMobile ? 10 : 15;
                        playerLabel.thickness = 1;
                        playerLabel.color = "white";
                        playerLabel.isPointerBlocker = false;

                        const scale = isMobile ? 0.5 : 1; // Reducir tamaño en móvil
                        playerLabel.scaling = new BABYLON.Vector3(scale, scale, scale);


                        advancedTextureRef.current.addControl(playerLabel);


                        const nameText = new GUI.TextBlock();
                        nameText.text = playerData.name;
                        nameText.color = "white";
                        nameText.fontSize = isMobile ? 10 : 14;
                        nameText.fontWeight = "bold";
                        nameText.fontFamily = "Arial";
                        nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                        nameText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
                        playerLabel.addControl(nameText);

                        playerLabel.linkWithMesh(playerInstance);
                        playerLabel.linkOffsetY = isMobile ? -50 : -120;;
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

    const handleChatToggle = () => {
        setChatVisible(!chatVisible);
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


        const isDev = process.env.NODE_ENV === 'development';
        const baseUrl = isDev
            ? `http://localhost`
            : process.env.REACT_APP_BASE_URL;

            

        // Obtener la sala de la URL actual
        const path = window.location.pathname;
        const roomId = path.includes('sala2') ? 'sala2' : 'sala1';

        console.log('Intentando conectar al servidor...');
        console.log('Conectando al servidor de la sala:', roomId);


        if (isDev) {
            // Configuración para desarrollo local
            const url = `${baseUrl}:${roomId === 'sala1' ? '4000' : '4001'}`;
            socketRef.current = io(url, {
                transports: ['websocket']
            });
        } else {
            // Configuración para producción
            socketRef.current = io(baseUrl, {
                transports: ['websocket'],
                path: `/${roomId}/socket.io`,
                secure: true
            });
        }

        socketRef.current.on('connect', () => {
            console.log('Conectado al servidor con Socket ID:', socketRef.current.id);
            setIsConnected(true);
        });

        socketRef.current.on('gameStateUpdate', (gameState) => {
            if (gameState.score) {
                setScore(gameState.score);
            }

            // Agregar log para verificar el estado de animación
            const localPlayer = gameState.players?.find(p => p.id === socketRef.current.id);
            if (localPlayer) {
                console.log('Estado de movimiento:', localPlayer.isMoving);
            }

            updateGameState(gameState);


            // Actualizar efectos visuales de control
            gameState.players.forEach(player => {
                if (player.isControllingBall) {
                    const playerMesh = playersRef.current[player.id];
                    if (playerMesh && controlEffectsRef.current) {
                        // Actualizar posición del anillo
                        controlEffectsRef.current.controlRing.position = playerMesh.position.clone();
                        controlEffectsRef.current.controlRing.position.y = 0.1;
                        controlEffectsRef.current.controlRing.isVisible = true;

                        // Mostrar halo alrededor del balón
                        controlEffectsRef.current.ballHalo.isVisible = true;

                        // Actualizar tiempo de control
                        const controlDuration = (Date.now() - player.ballControlTime) / 1000;
                        const timeLeft = Math.max(0, 3 - controlDuration).toFixed(1);
                        controlEffectsRef.current.controlTimeText.text = `${timeLeft}s`;
                        controlEffectsRef.current.controlTimeText.linkWithMesh(playerMesh);
                        controlEffectsRef.current.controlTimeText.linkOffsetY = -90;
                        controlEffectsRef.current.controlTimeText.isVisible = true;
                    }
                }
            });

            // Ocultar efectos si nadie está controlando
            if (!gameState.players.some(p => p.isControllingBall) && controlEffectsRef.current) {
                controlEffectsRef.current.controlRing.isVisible = false;
                controlEffectsRef.current.controlTimeText.isVisible = false;
                controlEffectsRef.current.ballHalo.isVisible = false;
                controlEffectsRef.current.stopParticles();
            }

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
                    playerLabel.width = isMobile ? "80px" : "120px";
                    playerLabel.height = isMobile ? "20px" : "30px";
                    playerLabel.background = team === 'left' ? "rgba(59, 130, 246, 0.8)" : "rgba(239, 68, 68, 0.8)";
                    playerLabel.cornerRadius = isMobile ? 10 : 15;
                    playerLabel.thickness = 1;
                    playerLabel.color = "white";
                    playerLabel.isPointerBlocker = false;

                    const scale = isMobile ? 0.5 : 1;
                    playerLabel.scaling = new BABYLON.Vector3(scale, scale, scale);

                    advancedTextureRef.current.addControl(playerLabel);

                    const nameText = new GUI.TextBlock();
                    nameText.text = name;
                    nameText.color = "white";
                    nameText.fontSize = isMobile ? 10 : 14;
                    nameText.fontWeight = "bold";
                    nameText.fontFamily = "Arial";
                    nameText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                    nameText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
                    playerLabel.addControl(nameText);

                    playerLabel.linkWithMesh(playerInstance);
                    playerLabel.linkOffsetY = isMobile ? -50 : -120;
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
            const flashScreen = new GUI.Rectangle("goalFlash");
            flashScreen.width = "100%";
            flashScreen.height = "100%";
            flashScreen.thickness = 0;
            flashScreen.background = team === 'left' ? "#3b82f680" : "#ef444480";
            flashScreen.zIndex = 999;
            advancedTextureRef.current.addControl(flashScreen);

            const goalText = new GUI.TextBlock();
            goalText.text = t('gameUI.goal');
            goalText.color = "white";
            goalText.fontSize = isMobile ? 80 : 120;
            goalText.fontWeight = "bold";
            goalText.outlineWidth = isMobile ? 2 : 3;
            goalText.outlineColor = "black";
            goalText.shadowColor = "black";
            goalText.shadowBlur = isMobile ? 5 : 10;
            goalText.shadowOffsetX = isMobile ? 3 : 5;
            goalText.shadowOffsetY = isMobile ? 3 : 5;
            advancedTextureRef.current.addControl(goalText);

            const teamText = new GUI.TextBlock();
            teamText.text = team === 'left'
                ? t('gameUI.mammalTeam')
                : t('gameUI.reptileTeam');
            teamText.color = team === 'left' ? "#3b82f6" : "#ef4444";
            teamText.fontSize = isMobile ? 40 : 60;
            teamText.fontWeight = "bold";
            teamText.top = isMobile ? "60px" : "80px";
            teamText.outlineWidth = isMobile ? 1 : 2;
            teamText.outlineColor = "black";
            advancedTextureRef.current.addControl(teamText);

            let scaleStep = 0;
            const scaleInterval = setInterval(() => {
                scaleStep++;
                const scaleAmount = isMobile ? 0.15 : 0.2;
                goalText.scaleX = 1 + Math.sin(scaleStep * 0.2) * scaleAmount;
                goalText.scaleY = 1 + Math.sin(scaleStep * 0.2) * scaleAmount;
                if (scaleStep >= 20) clearInterval(scaleInterval);
            }, 50);

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
                const isBlueTeam = winningTeam === 'left';
                const teamColor = isBlueTeam ? '#3b82f6' : '#ef4444';
                const teamName = isBlueTeam
                    ? t('gameUI.mammalTeam')
                    : t('gameUI.reptileTeam');

                const fullscreenBg = new GUI.Rectangle("fullscreenBg");
                fullscreenBg.width = "100%";
                fullscreenBg.height = "100%";
                fullscreenBg.background = "rgba(0, 0, 0, 0.85)";
                fullscreenBg.thickness = 0;
                advancedTextureRef.current.addControl(fullscreenBg);

                const victoryMessage = new GUI.Rectangle("victoryMessage");
                victoryMessage.width = isMobile ? "90%" : "600px";
                victoryMessage.height = isMobile ? "250px" : "300px";
                victoryMessage.thickness = 2;
                victoryMessage.color = teamColor;
                victoryMessage.background = "rgba(0, 0, 0, 0.9)";
                victoryMessage.cornerRadius = isMobile ? 15 : 20;
                victoryMessage.shadowColor = teamColor;
                victoryMessage.shadowBlur = isMobile ? 10 : 15;
                advancedTextureRef.current.addControl(victoryMessage);

                const titleText = new GUI.TextBlock();
                titleText.text = t('gameUI.victory');
                titleText.color = teamColor;
                titleText.fontSize = isMobile ? 36 : 48;
                titleText.fontFamily = "Arial";
                titleText.fontWeight = "bold";
                titleText.top = isMobile ? "-60px" : "-80px";
                victoryMessage.addControl(titleText);

                const subtitleText = new GUI.TextBlock();
                subtitleText.text = teamName;
                subtitleText.color = teamColor;
                subtitleText.fontSize = isMobile ? 28 : 36;
                subtitleText.fontFamily = "Arial";
                subtitleText.fontWeight = "bold";
                subtitleText.top = isMobile ? "-20px" : "-30px";
                victoryMessage.addControl(subtitleText);

                const line = new GUI.Rectangle("line");
                line.width = isMobile ? "80%" : "400px";
                line.height = "2px";
                line.background = teamColor;
                line.top = isMobile ? "5px" : "10px";
                victoryMessage.addControl(line);

                if (finalScore) {
                    const scoreText = new GUI.TextBlock();
                    scoreText.text = t('gameUI.finalScore');
                    scoreText.color = "white";
                    scoreText.fontSize = isMobile ? 20 : 24;
                    scoreText.top = isMobile ? "30px" : "40px";
                    victoryMessage.addControl(scoreText);

                    const scoreNumbers = new GUI.TextBlock();
                    scoreNumbers.text = `${finalScore.left} - ${finalScore.right}`;
                    scoreNumbers.color = "white";
                    scoreNumbers.fontSize = isMobile ? 48 : 64;
                    scoreNumbers.fontWeight = "bold";
                    scoreNumbers.top = isMobile ? "70px" : "90px";
                    victoryMessage.addControl(scoreNumbers);
                }

                // Fade animations remain the same
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
            if (chatInputFocusRef.current || isMobile) {
                return;
            }


            console.log("Key pressed:", event.key);

            let direction = null;
            switch (event.key.toLowerCase()) { // Añadir toLowerCase()
                case "arrowup":
                case "w":
                    direction = "up";
                    break;
                case "arrowdown":
                case "s":
                    direction = "down";
                    break;
                case "arrowleft":
                case "a":
                    direction = "left";
                    break;
                case "arrowright":
                case "d":
                    direction = "right";
                    break;
                case " ":
                    console.log("Iniciando control del balón - Tecla espacio presionada");
                    if (!event.repeat) { // Evitar repetición al mantener presionado
                        socketRef.current.emit('ballControl', { control: true, shooting: false });
                    }
                    break;
                default:
                    break;
            }
            if (direction && socketRef.current) {
                socketRef.current.volatile.emit('playerMoveStart', { direction });
            }
        };

        const handleKeyUp = (event) => {
            if (chatInputFocusRef.current || isMobile) {
                return;
            }

            let direction = null;
            switch (event.key.toLowerCase()) { // Añadir toLowerCase()
                case "arrowup":
                case "w":
                    direction = "up";
                    break;
                case "arrowdown":
                case "s":
                    direction = "down";
                    break;
                case "arrowleft":
                case "a":
                    direction = "left";
                    break;
                case "arrowright":
                case "d":
                    direction = "right";
                    break;
                case " ":
                    socketRef.current.emit('ballControl', { control: false, shooting: true });
                    break;

                default:
                    break;
            }
            if (direction && socketRef.current) {
                socketRef.current.volatile.emit('playerMoveStop', { direction });
            }
        };


        // Agregar manejador para cuando la ventana pierde el foco
        const handleBlur = () => {
            if (isMobile && socketRef.current) {
                // Detener todos los movimientos cuando la ventana pierde el foco
                ['up', 'down', 'left', 'right'].forEach(direction => {
                    socketRef.current.volatile.emit('playerMoveStop', { direction });
                });
            }
        };

        // Agregar manejador para cuando el dispositivo cambia de orientación
        const handleOrientationChange = () => {
            if (isMobile && socketRef.current) {
                // Detener todos los movimientos cuando el dispositivo rota
                ['up', 'down', 'left', 'right'].forEach(direction => {
                    socketRef.current.volatile.emit('playerMoveStop', { direction });
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('orientationchange', handleOrientationChange);;

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

            if (controlEffectsRef.current) {
                controlEffectsRef.current.particles.forEach(particle => particle.dispose());
                controlEffectsRef.current.controlRing.dispose();
                controlEffectsRef.current.ballHalo.dispose();
                // El controlTimeText se limpiará con advancedTexture
            }

            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('orientationchange', handleOrientationChange);
        };
    }, [createScene, updateGameState]);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Añadir también un useEffect para manejar la visibilidad de la página
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && socketRef.current) {
                // Detener todos los movimientos cuando la página no está visible
                ['up', 'down', 'left', 'right'].forEach(direction => {
                    socketRef.current.volatile.emit('playerMoveStop', { direction });
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

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

    // Modificar la gestión de movimiento para soportar controles táctiles
    const handleDirectionChange = useCallback((direction) => {
        if (!socketRef.current) return;

        // Detener inmediatamente la dirección anterior
        if (currentDirection && direction !== currentDirection) {
            socketRef.current.volatile.emit('playerMoveStop', {
                direction: currentDirection
            });
        }

        // Iniciar inmediatamente la nueva dirección
        if (direction) {
            socketRef.current.volatile.emit('playerMoveStart', { direction });
        }

        setCurrentDirection(direction);
    }, [currentDirection]);


    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            WebkitTapHighlightColor: 'transparent',
            WebkitTouchCallout: 'none',
            userSelect: 'none',
            touchAction: 'none'
        }}>


            {/* Agregar el selector de idioma aquí */}
            <LanguageSelector />


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
                        isMobile={isMobile}
                    />
                </div>
            )}

            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    touchAction: 'none'
                }}
            />

            {!isLoading && hasJoined && teamSelected && (
                isMobile ? (
                    // Layout móvil
                    <>
                        {/* Scoreboard y status */}
                        <div style={{
                            position: 'absolute',
                            top: '8px',
                            left: '0',
                            right: '0',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px',
                            zIndex: 10
                        }}>

                            {/* Lista de jugadores móvil */}
                            <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '8px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                padding: '8px',
                                borderRadius: '8px',
                                fontSize: '10px',
                                zIndex: 10
                            }}>
                                <div style={{
                                    color: '#3b82f6',
                                    marginBottom: '4px'
                                }}>
                                    {teams.left.map(player => (
                                        <div key={player.id}>{player.name}</div>
                                    ))}
                                </div>
                                <div style={{
                                    color: '#ef4444'
                                }}>
                                    {teams.right.map(player => (
                                        <div key={player.id}>{player.name}</div>
                                    ))}
                                </div>
                            </div>


                            {/* Status de conexión, nombre y equipo */}
                            <div style={{
                                position: 'absolute',
                                right: '8px',
                                top: '0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                zIndex: 10
                            }}>
                                <div style={{
                                    backgroundColor: isConnected ? 'rgba(39, 174, 96, 0.6)' : 'rgba(231, 76, 60, 0.6)',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '10px'
                                }}>
                                    {isConnected ? '●' : '○'}
                                </div>
                                <div style={{
                                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    display: 'flex',
                                    gap: '4px'
                                }}>
                                    <span style={{ color: 'white' }}>{playerName}</span>
                                    <span style={{ color: currentTeam === 'left' ? '#3b82f6' : '#ef4444' }}>
                                        {currentTeam === 'left' ? t('teamSelection.mammals') : t('teamSelection.reptiles')}
                                    </span>
                                </div>
                            </div>

                            {/* Marcador */}
                            <div style={{
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                display: 'flex',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <span style={{ color: '#3b82f6', fontSize: '24px' }}>
                                    {score.left}
                                </span>
                                <span style={{ color: 'white', fontSize: '24px' }}>-</span>
                                <span style={{ color: '#ef4444', fontSize: '24px' }}>
                                    {score.right}
                                </span>
                            </div>
                        </div>



                        {/* Instrucciones móviles */}
                        <div style={{
                            position: 'absolute',
                            top: '120px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: 'rgba(0, 0, 0, 0.6)',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '12px',
                            textAlign: 'center',
                            zIndex: 10,
                            opacity: 0.8,
                            pointerEvents: 'none'
                        }}>
                            <h3 style={{ margin: '0 0 8px 0' }}>{t('gameUI.controls')}</h3>
                            <p style={{ margin: '0 0 4px 0' }}>
                                {isMobile
                                    ? t('gameUI.mobileMovementInstructions')
                                    : t('gameUI.moveInstructions')}
                            </p>
                            <p style={{ margin: '0' }}>
                                {isMobile
                                    ? t('gameUI.mobileChatInstructions')
                                    : t('gameUI.ballControlInstructions')}
                            </p>
                        </div>

                        {/* Joystick */}
                        {gameStarted && (
                            <div style={{
                                position: 'fixed',
                                bottom: '40px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                touchAction: 'none',
                                zIndex: 20,
                                width: '180px',
                                height: '180px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center'
                            }}>
                                <MobileJoystick
                                    onDirectionChange={(direction) => {
                                        console.log('Dirección:', direction);
                                        handleDirectionChange(direction);
                                    }}
                                />
                            </div>
                        )}

                        {/* Chat minimizable móvil */}
                        <div style={{
                            position: 'fixed',
                            bottom: isMobileChatExpanded ? '80px' : '16px',
                            right: '16px',
                            width: isMobileChatExpanded ? '80%' : '40px',
                            height: isMobileChatExpanded ? '200px' : '40px',
                            maxWidth: '300px',
                            backgroundColor: 'rgba(0, 0, 0, 0.6)',
                            borderRadius: '8px',
                            zIndex: 30,
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <button
                                onClick={() => setIsMobileChatExpanded(!isMobileChatExpanded)}
                                style={{
                                    width: '100%',
                                    height: isMobileChatExpanded ? '40px' : '100%',
                                    padding: '8px',
                                    color: 'white',
                                    fontSize: '16px',
                                    textAlign: 'center',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    borderBottom: isMobileChatExpanded ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                {isMobileChatExpanded ? t('gameUI.chat') : '💬'}
                            </button>

                            {isMobileChatExpanded && (
                                <>
                                    <div style={{
                                        height: '160px',
                                        overflowY: 'auto',
                                        padding: '8px'
                                    }}>
                                        {chatMessages.map((msg, index) => {
                                            const messageColor = teams.left.find(p => p.id === msg.playerId)
                                                ? '#3b82f6'
                                                : teams.right.find(p => p.id === msg.playerId)
                                                    ? '#ef4444'
                                                    : '#4CAF50';

                                            return (
                                                <div
                                                    key={index}
                                                    style={{
                                                        marginBottom: '4px',
                                                        wordBreak: 'break-word',
                                                        fontSize: '14px',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <strong style={{ color: messageColor }}>{msg.playerName}: </strong>
                                                    {msg.message}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <form
                                        onSubmit={handleChatSubmit}
                                        style={{
                                            display: 'flex',
                                            padding: '8px',
                                            gap: '4px'
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
                                                padding: '6px',
                                                borderRadius: '4px',
                                                border: 'none',
                                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                color: 'white',
                                                fontSize: '12px'
                                            }}
                                            placeholder={t('gameUI.chatPlaceholder')}
                                        />
                                        <button
                                            type="submit"
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '4px',
                                                border: 'none',
                                                backgroundColor: '#4CAF50',
                                                color: 'white',
                                                fontSize: '12px'
                                            }}
                                        >
                                            →
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    // Layout desktop original
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
                                <h3 style={{ margin: '0 0 8px 0' }}>{t('gameUI.players')}</h3>
                                {/* Equipo Mamíferos */}
                                <div style={{ marginBottom: '10px' }}>
                                    <h4 style={{
                                        margin: '0 0 4px 0',
                                        color: '#3b82f6'
                                    }}>
                                        {`${t('teamSelection.team')} ${t('teamSelection.mammals')}`}
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
                                        color: '#ef4444'
                                    }}>
                                        {`${t('teamSelection.team')} ${t('teamSelection.reptiles')}`}
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
                                <h3 style={{ margin: '0 0 8px 0' }}>{t('gameUI.controls')}</h3>
                                <p style={{ margin: '0 0 4px 0' }}>
                                    {isMobile
                                        ? t('gameUI.mobileMovementInstructions')
                                        : t('gameUI.moveInstructions')}
                                </p>
                                <p style={{ margin: '0' }}>
                                    {isMobile
                                        ? t('gameUI.mobileChatInstructions')
                                        : t('gameUI.ballControlInstructions')}
                                </p>
                                <p style={{ margin: '0' }}>
                                    {isMobile ? '' : t('gameUI.enterToSend')}
                                </p>
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
                                    {playerName || t('gameUI.unknown')}
                                    <span style={{
                                        marginLeft: '8px',
                                        color: currentTeam === 'left' ? '#3b82f6' : '#ef4444'
                                    }}>
                                        {currentTeam === 'left' ? t('teamSelection.mammals') : t('teamSelection.reptiles')}
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
                                    {isConnected ? t('gameUI.connected') : t('gameUI.disconnected')}
                                </div>
                            </div>

                            {/* Chat Desktop */}
                            <div style={{
                                position: 'absolute',
                                bottom: 10,
                                right: 10,
                                width: chatExpanded ? '300px' : '50px',
                                height: chatExpanded ? '250px' : '50px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'all 0.3s ease',
                                pointerEvents: 'auto'
                            }}>
                                <button
                                    onClick={() => setChatExpanded(!chatExpanded)}
                                    style={{
                                        width: '100%',
                                        height: chatExpanded ? '30px' : '100%',
                                        padding: '8px',
                                        backgroundColor: 'transparent',
                                        border: 'none',
                                        borderBottom: chatExpanded ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {chatExpanded ? t('gameUI.chatExpanded') : '💬'}
                                </button>

                                {chatExpanded && (
                                    <>
                                        <div
                                            ref={chatMessagesRef}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                overflowY: 'auto'
                                            }}
                                        >
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
                                                    <strong
                                                        style={{
                                                            color: teams.left.find(p => p.id === msg.playerId)
                                                                ? '#3b82f6'
                                                                : teams.right.find(p => p.id === msg.playerId)
                                                                    ? '#ef4444'
                                                                    : '#4CAF50'
                                                        }}
                                                    >
                                                        {msg.playerName}:
                                                    </strong>{' '}
                                                    <span>{msg.message}</span>
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
                                                    color: 'white'
                                                }}
                                                placeholder={t('gameUI.writeMessage')}
                                            />
                                            <button
                                                type="submit"
                                                style={{
                                                    padding: '8px 15px',
                                                    borderRadius: '4px',
                                                    border: 'none',
                                                    backgroundColor: '#4CAF50',
                                                    color: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                →
                                            </button>
                                        </form>
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )
            )}
        </div>
    );
};

export default Game;