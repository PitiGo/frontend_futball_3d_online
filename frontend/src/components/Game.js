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
import { useSearchParams } from 'react-router-dom';


const Game = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Get roomId from query parameter and validate (parametrizable por env)
    const roomParam = searchParams.get('room');
    const roomPrefix = process.env.REACT_APP_ROOM_PREFIX || 'room';
    const availableRooms = (process.env.REACT_APP_ROOMS || '1,2').split(',').map(s => `${roomPrefix}${s.trim()}`);
    const roomId = roomParam ? `${roomPrefix}${roomParam}` : null;

    // Debug logging
    console.group('Game Component URL Parameters');
    console.log('URL actual:', window.location.href);
    console.log('Search params:', Object.fromEntries(searchParams));
    console.log('Room parameter:', roomParam);
    console.log('Computed roomId:', roomId);
    console.groupEnd();

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
    const [, setConnectedPlayers] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [hasJoined, setHasJoined] = useState(false);
    const [gameInProgress, setGameInProgress] = useState(false);
    const [score, setScore] = useState({ left: 0, right: 0 });

    const [showingEndMessage, setShowingEndMessage] = useState(false);

    // Feedback visual para goles
    const [goalFeedback, setGoalFeedback] = useState({ visible: false, team: null });
    const goalTimeoutRef = useRef(null);
    const confettiCanvasRef = useRef(null);
    const confettiAnimRef = useRef(null);
    const rootRef = useRef(null);
    const [shakeScreen, setShakeScreen] = useState(false);
    const isRedirectingRef = useRef(false);

    const startConfetti = useCallback((team) => {
        const canvas = confettiCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width = window.innerWidth;
        const h = canvas.height = window.innerHeight;

        const colors = team === 'left'
            ? ['#3b82f6', '#60a5fa', '#93c5fd', '#1e40af']
            : ['#ef4444', '#f87171', '#fecaca', '#7f1d1d'];

        const particles = Array.from({ length: Math.min(200, Math.floor((w * h) / 20000)) }).map(() => ({
            x: Math.random() * w,
            y: -20 - Math.random() * 200,
            size: 4 + Math.random() * 6,
            speedY: 2 + Math.random() * 3,
            speedX: -2 + Math.random() * 4,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (-0.2 + Math.random() * 0.4),
            color: colors[Math.floor(Math.random() * colors.length)],
            shape: Math.random() > 0.5 ? 'rect' : 'circle'
        }));

        let start = performance.now();
        const duration = 1800; // ms

        const step = (t) => {
            const elapsed = t - start;
            ctx.clearRect(0, 0, w, h);
            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;
                p.rotation += p.rotationSpeed;
                if (p.y > h + 20) p.y = -20;
                if (p.x < -20) p.x = w + 20;
                if (p.x > w + 20) p.x = -20;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                if (p.shape === 'rect') {
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            });
            if (elapsed < duration) {
                confettiAnimRef.current = requestAnimationFrame(step);
            } else {
                ctx.clearRect(0, 0, w, h);
                confettiAnimRef.current = null;
            }
        };

        if (confettiAnimRef.current) cancelAnimationFrame(confettiAnimRef.current);
        confettiAnimRef.current = requestAnimationFrame(step);
    }, []);

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
    // const [chatVisible, setChatVisible] = useState(false);
    const [isMobileChatExpanded, setIsMobileChatExpanded] = useState(false);

    // Mantener estado de teclas presionadas para movimiento combinado
    const keysPressed = useRef({
        up: false,
        down: false,
        left: false,
        right: false,
    });

    // Vector analógico del joystick (móvil)
    const joystickMoveRef = useRef({ x: 0, z: 0 });
    // Último vector emitido y control de keepalive
    const lastEmittedMoveRef = useRef({ x: 0, z: 0 });
    const lastEmitTimeRef = useRef(0);

    const vectorsApproximatelyEqual = (a, b, epsilon = 0.01) => {
        return Math.abs(a.x - b.x) < epsilon && Math.abs(a.z - b.z) < epsilon;
    };

    const sendMovement = useCallback(() => {
        if (!socketRef.current || !gameStarted) return;
        // Combinar teclado + joystick
        let moveX = 0;
        let moveZ = 0;
        if (keysPressed.current.up) moveZ += 1;
        if (keysPressed.current.down) moveZ -= 1;
        if (keysPressed.current.left) moveX -= 1;
        if (keysPressed.current.right) moveX += 1;
        // Sumar joystick (ya es vector en rango [-1,1])
        moveX += joystickMoveRef.current.x;
        moveZ += joystickMoveRef.current.z;

        // Normalizar
        const length = Math.hypot(moveX, moveZ);
        let move = { x: 0, z: 0 };
        if (length > 0) {
            move = { x: moveX / length, z: moveZ / length };
        }

        // Enviar solo si cambió o cada 150ms como keepalive
        const now = performance.now();
        const shouldEmit = !vectorsApproximatelyEqual(move, lastEmittedMoveRef.current) || (now - lastEmitTimeRef.current) > 150;
        if (shouldEmit) {
            socketRef.current.volatile.emit('playerMove', move);
            lastEmittedMoveRef.current = move;
            lastEmitTimeRef.current = now;
        }
    }, [gameStarted]);

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

        // Definir las dimensiones del campo como constantes al inicio
        const FIELD_WIDTH = 40;
        const FIELD_HEIGHT = 30;

        // Reemplazar la creación actual del campo con esta versión mejorada
        const createProceduralField = (scene) => {
            // Usar las constantes definidas arriba
            const ground = BABYLON.MeshBuilder.CreateGround('ground', {
                width: FIELD_WIDTH,
                height: FIELD_HEIGHT,
                subdivisions: 64 // Mantener misma calidad en móvil
            }, scene);

            // Generar textura de césped procedural
            const grassTexture = new BABYLON.DynamicTexture("proceduralGrass", 1024, scene);
            const ctx = grassTexture.getContext();

            // Color base del césped
            ctx.fillStyle = "#2a6321";
            ctx.fillRect(0, 0, grassTexture.getSize().width, grassTexture.getSize().height);

            // Paleta de colores para variaciones
            const colors = [
                "#2a6321", // Verde base
                "#225219", // Verde oscuro
                "#337a27", // Verde claro
                "#1e4a16", // Verde más oscuro
                "#2d6d23"  // Verde medio
            ];

            // Generar variaciones de color
            for (let i = 0; i < 2000; i++) {
                const x = Math.random() * grassTexture.getSize().width;
                const y = Math.random() * grassTexture.getSize().height;
                const radius = 5 + Math.random() * 15;
                const color = colors[Math.floor(Math.random() * colors.length)];

                ctx.beginPath();
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.3 + Math.random() * 0.4;
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Añadir líneas de corte
            const linesCount = 20;
            for (let i = 0; i < linesCount; i++) {
                const y = (i / linesCount) * grassTexture.getSize().height;
                ctx.beginPath();
                ctx.strokeStyle = i % 2 === 0 ? "#2d7023" : "#225219";
                ctx.lineWidth = 10;
                ctx.globalAlpha = 0.2;
                ctx.moveTo(0, y);
                ctx.lineTo(grassTexture.getSize().width, y);
                ctx.stroke();
            }

            // Actualizar y configurar la textura
            grassTexture.update();
            grassTexture.wrapU = grassTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;

            // Crear y configurar el material
            const grassMaterial = new BABYLON.StandardMaterial("grassMat", scene);
            grassMaterial.diffuseTexture = grassTexture;
            grassMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            grassMaterial.diffuseTexture.uScale = 5;
            grassMaterial.diffuseTexture.vScale = 4;

            ground.material = grassMaterial;

            // Añadir líneas del campo
            const linesTexture = new BABYLON.DynamicTexture("linesTexture",
                { width: 1024, height: 1024 }, scene);
            const linesCtx = linesTexture.getContext();

            // Dibujar líneas del campo
            linesCtx.strokeStyle = "white";
            linesCtx.lineWidth = 5;

            // Líneas exteriores
            linesCtx.strokeRect(10, 10, linesTexture.getSize().width - 20,
                linesTexture.getSize().height - 20);

            // Línea central
            const center = linesTexture.getSize().width / 2;
            linesCtx.beginPath();
            linesCtx.moveTo(center, 10);
            linesCtx.lineTo(center, linesTexture.getSize().height - 10);
            linesCtx.stroke();

            // Círculo central
            linesCtx.beginPath();
            linesCtx.arc(center, center, linesTexture.getSize().width / 10,
                0, Math.PI * 2);
            linesCtx.stroke();

            linesTexture.update();

            const lines = BABYLON.MeshBuilder.CreatePlane("lines", { size: 1 }, scene);
            const linesMaterial = new BABYLON.StandardMaterial("linesMat", scene);
            linesMaterial.diffuseTexture = linesTexture;
            linesMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
            linesMaterial.alpha = 0.7;
            lines.material = linesMaterial;
            lines.rotation.x = Math.PI / 2;
            lines.position.y = 0.01;
            lines.scaling = new BABYLON.Vector3(FIELD_WIDTH, FIELD_HEIGHT, 1);

            // Configurar física
            ground.physicsImpostor = new BABYLON.PhysicsImpostor(
                ground,
                BABYLON.PhysicsImpostor.BoxImpostor,
                { mass: 0, restitution: 0.9, friction: 0.1 },
                scene
            );

            return ground;
        };

        // Crear el campo
        createProceduralField(scene);

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

        createGoal(new BABYLON.Vector3(-FIELD_WIDTH / 2 + 0.1, 0, 0));  // Portería izquierda
        createGoal(new BABYLON.Vector3(FIELD_WIDTH / 2 - 0.1, 0, 0));   // Portería derecha

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

        const { players, ballPosition, score, connectedPlayers, controllingPlayerId, controlRemainingMs } = gameState;

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

        // Mostrar feedback de control de balón (halo/partículas/texto)
        if (controlEffectsRef.current && ballRef.current) {
            const hasControl = !!controllingPlayerId && controlRemainingMs > 0;
            controlEffectsRef.current.ballHalo.isVisible = hasControl;
            controlEffectsRef.current.controlRing.isVisible = hasControl;
            controlEffectsRef.current.controlTimeText.isVisible = hasControl;
            if (hasControl) {
                // Position halo already updated in beforeRender; update ring to follow controlling player if available
                const controllingMesh = playersRef.current[controllingPlayerId];
                if (controllingMesh) {
                    controlEffectsRef.current.controlRing.position = controllingMesh.position.clone();
                    controlEffectsRef.current.controlRing.position.y = 0.1;
                }
                const seconds = Math.ceil(controlRemainingMs / 100) / 10; // one decimal
                controlEffectsRef.current.controlTimeText.text = `${seconds.toFixed(1)}s`;
                controlEffectsRef.current.controlTimeText.top = isMobile ? '40px' : '20px';
                controlEffectsRef.current.controlTimeText.linkWithMesh(ballRef.current);
            } else {
                controlEffectsRef.current.stopParticles();
                controlEffectsRef.current.controlTimeText.text = '';
            }
        }

        // Actualizar lista de jugadores conectados
        if (connectedPlayers) {
            setConnectedPlayers(connectedPlayers);
        }
    }, [sceneReady, isMobile]);

    const handleJoinGame = (name) => {
        socketRef.current.emit('joinGame', { name: name.trim(), roomId: roomId });
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

    // const handleChatToggle = () => {
    //     setChatVisible(!chatVisible);
    // };

    // Validate room and redirect if invalid (usa REACT_APP_ROOMS)
    useEffect(() => {
        console.group('Room Validation');
        console.log('Validando sala:', roomId);
        const isValidRoom = !!roomId && availableRooms.includes(roomId);

        if (!isValidRoom) {
            const firstRoom = (process.env.REACT_APP_ROOMS || '1,2').split(',')[0].trim();
            console.warn('Sala no válida, redirigiendo a', `${roomPrefix}${firstRoom}`);
            isRedirectingRef.current = true;
            setSearchParams({ room: firstRoom || '1' });
            console.groupEnd();
            return;
        }

        console.log('Sala válida:', isValidRoom);
        isRedirectingRef.current = false;
        console.groupEnd();
    }, [roomId, setSearchParams, availableRooms, roomPrefix]);

    // Modified socket setup
    const setupSocket = useCallback(() => {
        console.group('Socket Setup (Nginx Path)');
        if (!roomId) {
            console.error('Error: roomId no está definido al intentar configurar el socket');
            console.groupEnd();
            return null;
        }

        const publicGameUrl = process.env.REACT_APP_GAME_SERVER_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : 'https://football-online-3d.dantecollazzi.com');
        console.log('Configurando socket con (Nginx Path):', { publicGameUrl, roomId });

        try {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const socket = io(publicGameUrl, {
                // En local permitimos fallback a polling; en VPS solo websocket
                transports: isLocalhost ? ['websocket', 'polling'] : ['websocket'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                withCredentials: true,
            });

            // 5. OPCIONAL: Actualiza este log
            console.log('Socket Options Effective (Default Path):', JSON.stringify(socket.io.opts, null, 2)); // <-- CAMBIO SUGERIDO

            socket.on('connect', () => {
                console.log('Socket conectado exitosamente (Nginx Path):', {
                    id: socket.id,
                    opts: socket.io.opts,
                    roomId
                });
                setIsConnected(true);
            });

            socket.on('connect_error', (error) => {
                console.error('Error de conexión del socket (Nginx Path):', {
                    error: error.message || error,
                    roomId,
                    urlAttempted: publicGameUrl,
                    pathAttempted: '/socket.io/'
                });
                if (error.description) console.error('Descripción del error:', error.description);
                if (error.context) console.error('Contexto del error:', error.context);
                setIsConnected(false);
            });

            console.groupEnd();
            return socket;
        } catch (error) {
            console.error('Error al crear el socket:', error);
            console.log('Error details:', error); // Añade más detalles del error si lo hay
            console.groupEnd();
            return null;
        }
    }, [roomId]);

    // First, ensure these handlers are defined outside the useEffect
    const handleTeamSelect = useCallback((team) => {
        console.log('Intentando seleccionar equipo:', {
            team,
            socketExists: !!socketRef.current,
            socketConnected: socketRef.current?.connected
        });
        if (!socketRef.current?.connected) {
            console.error('Socket no conectado');
            return;
        }
        socketRef.current.emit('selectTeam', { team });
        console.log('Evento selectTeam emitido');
    }, []); // Empty dependencies as it only uses stable ref

    // Main useEffect for socket connection and listeners
    useEffect(() => {
        console.group('Game Initialization Effect (Socket Focus)');
        console.log('Ejecutando useEffect principal. RoomId:', roomId);

        if (!roomId) {
            if (!isRedirectingRef.current) {
                console.warn('roomId no definido...');
            }
            console.groupEnd();
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) {
            console.error('Canvas no encontrado.');
            console.groupEnd();
            return;
        }

        let engine = engineRef.current;
        if (!engine) {
            console.log("Inicializando Babylon Engine...");
            createScene(canvas);
            engine = engineRef.current;
        }

        let socket = socketRef.current;
        if (!socket || (!socket.connected && !socket.connecting)) {
            console.log("Socket no existe o está desconectado, creando/reconectando...");
            if (socket) socket.disconnect();
            socket = setupSocket();
            socketRef.current = socket;
        }

        if (!socket) {
            console.error("Fallo al crear/obtener el socket.");
            console.groupEnd();
            return;
        }

        console.log(`Socket ${socket.id} listo, adjuntando/verificando listeners...`);

        // Event handlers
        const handleConnect = () => {
            console.log('>>> Socket conectado:', socket.id);
            setIsConnected(true);
            if (hasJoined && playerName) {
                console.log("Emitiendo joinGame al (re)conectar.");
                socket.emit('joinGame', { name: playerName });
            }
        };

        const handleConnectError = (error) => {
            console.error('>>> Error de conexión:', error);
            setIsConnected(false);
        };

        const handleTeamSelected = ({ team }) => {
            console.log('>>> Evento teamSelected recibido:', team);
            setCurrentTeam(team);
            setTeamSelected(true);
        };

        const handleTeamUpdate = (updatedTeams) => {
            console.log('>>> Evento teamUpdate recibido:', updatedTeams);
            setTeams(updatedTeams);
        };

        const handleReadyUpdate = (updatedReadyState) => {
            console.log('>>> Evento readyUpdate recibido:', updatedReadyState);
            setReadyState(updatedReadyState);
        };

        // Nuevos manejadores de eventos
        const handleGameStart = () => {
            console.log('>>> Juego iniciado');
            setGameStarted(true);
            setGameInProgress(true);
        };

        const handleGoalScored = ({ team, score }) => {
            console.log(`>>> Gol anotado por equipo ${team}`);
            setScore(score);
            // Feedback visual de gol
            setGoalFeedback({ visible: true, team });
            // Sacudir pantalla y confeti
            setShakeScreen(true);
            setTimeout(() => setShakeScreen(false), 500);
            startConfetti(team);
            if (goalTimeoutRef.current) clearTimeout(goalTimeoutRef.current);
            goalTimeoutRef.current = setTimeout(() => {
                setGoalFeedback({ visible: false, team: null });
                goalTimeoutRef.current = null;
            }, 2200);
        };

        const handleGameOver = (gameOverData) => {
            console.log('>>> Juego terminado:', gameOverData);
            setGameStarted(false);
            setGameInProgress(false);
            setShowingEndMessage(true);
            // Mostrar mensaje de fin de juego basado en gameOverData
        };

        const handleScoreUpdate = (newScore) => {
            console.log('>>> Actualización de puntaje:', newScore);
            setScore(newScore);
        };

        const handleGameStateInfo = ({ currentState }) => {
            console.log('>>> Estado del juego:', currentState);
            setGameInProgress(currentState === 'playing');
        };

        const handleChatUpdate = (message) => {
            console.log('>>> Nuevo mensaje de chat:', message);
            setChatMessages(prev => [...prev, message]);
        };

        const handlePlayerLeft = ({ id, name }) => {
            console.log(`>>> Jugador ${name} (${id}) ha dejado el juego`);
            // Actualizar UI si es necesario
        };

        const handlePlayersListUpdate = (playersList) => {
            console.log('>>> Lista de jugadores actualizada:', playersList);
            setConnectedPlayers(playersList);
        };

        // Manejadores de errores
        const handleJoinError = ({ message }) => {
            console.error('>>> Error al unirse:', message);
            alert(message);
        };

        const handleSelectTeamError = ({ message }) => {
            console.error('>>> Error al seleccionar equipo:', message);
            alert(message);
        };

        const handleSelectCharacterError = ({ message }) => {
            console.error('>>> Error al seleccionar personaje:', message);
            alert(message);
        };

        const handleReadyError = ({ message }) => {
            console.error('>>> Error al marcar como listo:', message);
            alert(message);
        };

        // Register listeners
        socket.on('connect', handleConnect);
        socket.on('connect_error', handleConnectError);
        socket.on('teamSelected', handleTeamSelected);
        socket.on('teamUpdate', handleTeamUpdate);
        socket.on('readyUpdate', handleReadyUpdate);
        socket.on('gameStateUpdate', updateGameState);

        // Registrar nuevos listeners
        socket.on('gameStart', handleGameStart);
        socket.on('goalScored', handleGoalScored);
        socket.on('gameOver', handleGameOver);
        socket.on('scoreUpdate', handleScoreUpdate);
        socket.on('gameStateInfo', handleGameStateInfo);
        socket.on('chatUpdate', handleChatUpdate);
        socket.on('playerLeft', handlePlayerLeft);
        socket.on('playersListUpdate', handlePlayersListUpdate);
        socket.on('joinError', handleJoinError);
        socket.on('selectTeamError', handleSelectTeamError);
        socket.on('selectCharacterError', handleSelectCharacterError);
        socket.on('readyError', handleReadyError);

        if (engine && !engine.isPointerLock) {
            console.log("Iniciando Render Loop...");
            engine.runRenderLoop(() => {
                if (sceneRef.current) {
                    sceneRef.current.render();
                }
            });
        }

        console.groupEnd();

        return () => {
            console.group('Cleanup Effect');
            console.log('Limpiando efecto principal para sala:', roomId);
            if (socket) {
                console.log(`Quitando listeners del socket ${socket.id}`);
                socket.off('connect', handleConnect);
                socket.off('connect_error', handleConnectError);
                socket.off('teamSelected', handleTeamSelected);
                socket.off('teamUpdate', handleTeamUpdate);
                socket.off('readyUpdate', handleReadyUpdate);
                socket.off('gameStateUpdate', updateGameState);

                // Limpiar nuevos listeners
                socket.off('gameStart', handleGameStart);
                socket.off('goalScored', handleGoalScored);
                socket.off('gameOver', handleGameOver);
                socket.off('scoreUpdate', handleScoreUpdate);
                socket.off('gameStateInfo', handleGameStateInfo);
                socket.off('chatUpdate', handleChatUpdate);
                socket.off('playerLeft', handlePlayerLeft);
                socket.off('playersListUpdate', handlePlayersListUpdate);
                socket.off('joinError', handleJoinError);
                socket.off('selectTeamError', handleSelectTeamError);
                socket.off('selectCharacterError', handleSelectCharacterError);
                socket.off('readyError', handleReadyError);
            }
            if (goalTimeoutRef.current) {
                clearTimeout(goalTimeoutRef.current);
                goalTimeoutRef.current = null;
            }
            if (confettiAnimRef.current) {
                cancelAnimationFrame(confettiAnimRef.current);
                confettiAnimRef.current = null;
            }
            console.groupEnd();
        };
    }, [roomId, createScene, setupSocket, updateGameState, hasJoined, playerName, startConfetti]);

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
                // Detener el movimiento enviando vector cero cuando la página no está visible
                keysPressed.current = { up: false, down: false, left: false, right: false };
                socketRef.current.volatile.emit('playerMove', { x: 0, z: 0 });
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

    // Modificar la gestión de movimiento para soportar controles táctiles con vector
    const handleDirectionChange = useCallback((direction) => {
        if (!gameStarted) return;
        // Acepta direcciones cardinales o vector {x,z}
        let moveVector = { x: 0, z: 0 };
        if (direction) {
            if (typeof direction === 'string') {
                switch (direction) {
                    case 'up': moveVector.z = 1; break;
                    case 'down': moveVector.z = -1; break;
                    case 'left': moveVector.x = -1; break;
                    case 'right': moveVector.x = 1; break;
                    default: break;
                }
            } else if (typeof direction === 'object' && direction !== null &&
                typeof direction.x === 'number' && typeof direction.z === 'number') {
                moveVector = { x: direction.x, z: direction.z };
            }
        }
        // Guardar como vector del joystick y emitir combinado a través de sendMovement
        joystickMoveRef.current = moveVector;
        sendMovement();
    }, [gameStarted, sendMovement]);

    // Manejadores de eventos de teclado para movimiento
    const handleKeyDown = useCallback((e) => {
        if (chatInputFocusRef.current) return;
        if (!socketRef.current || !isConnected || !gameStarted) return;

        let keyChanged = false;
        switch (e.key.toLowerCase()) {
            case 'w': case 'arrowup':
                if (!keysPressed.current.up) { keysPressed.current.up = true; keyChanged = true; }
                break;
            case 's': case 'arrowdown':
                if (!keysPressed.current.down) { keysPressed.current.down = true; keyChanged = true; }
                break;
            case 'a': case 'arrowleft':
                if (!keysPressed.current.left) { keysPressed.current.left = true; keyChanged = true; }
                break;
            case 'd': case 'arrowright':
                if (!keysPressed.current.right) { keysPressed.current.right = true; keyChanged = true; }
                break;
            case ' ':
                socketRef.current.emit('ballControl', { control: true });
                break;
            default:
                break;
        }
        if (keyChanged) sendMovement();
    }, [isConnected, gameStarted, sendMovement]);

    const handleKeyUp = useCallback((e) => {
        if (chatInputFocusRef.current) return;
        if (!socketRef.current || !isConnected) return;

        let keyChanged = false;
        switch (e.key.toLowerCase()) {
            case 'w': case 'arrowup':
                if (keysPressed.current.up) { keysPressed.current.up = false; keyChanged = true; }
                break;
            case 's': case 'arrowdown':
                if (keysPressed.current.down) { keysPressed.current.down = false; keyChanged = true; }
                break;
            case 'a': case 'arrowleft':
                if (keysPressed.current.left) { keysPressed.current.left = false; keyChanged = true; }
                break;
            case 'd': case 'arrowright':
                if (keysPressed.current.right) { keysPressed.current.right = false; keyChanged = true; }
                break;
            case ' ':
                socketRef.current.emit('ballControl', { control: false });
                break;
            default:
                break;
        }
        if (keyChanged) sendMovement();
    }, [isConnected, sendMovement]);

    // Añadir useEffect para los event listeners de teclado
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Bucle rAF ligero para mantener movimiento suave y keepalive
        let rafId = null;
        const loop = () => {
            sendMovement();
            rafId = window.requestAnimationFrame(loop);
        };
        rafId = window.requestAnimationFrame(loop);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (rafId) window.cancelAnimationFrame(rafId);
        };
    }, [handleKeyDown, handleKeyUp, sendMovement]);

    // Monitor state changes
    useEffect(() => {
        console.log('Estado del juego actualizado:', {
            roomId,
            isConnected,
            hasSocket: !!socketRef.current,
            currentTeam,
            teamSelected,
            gameStarted
        });
    }, [roomId, isConnected, currentTeam, teamSelected, gameStarted]);

    // Show loading or error state if no valid room
    if (!roomId) {
        return (
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: 'white',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: '20px',
                borderRadius: '8px'
            }}>
                <h2>Error</h2>
                <p>Redirigiendo a una sala válida...</p>
            </div>
        );
    }

    return (
        <div ref={rootRef} style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            WebkitTapHighlightColor: 'transparent',
            WebkitTouchCallout: 'none',
            userSelect: 'none',
            touchAction: 'none',
            animation: shakeScreen ? 'screenShake 0.5s ease' : 'none'
        }}>


            {/* Agregar el selector de idioma aquí */}
            <LanguageSelector />


            {isLoading && <LoadingScreen />}

            {!isLoading && !hasJoined && (
                <LoginScreen onJoin={handleJoinGame} />
            )}

            {!isLoading && hasJoined && !gameStarted && !showingEndMessage && (
                <div style={{ maxHeight: '100%', overflow: 'auto' }}>
                    {console.log('Renderizando TeamSelectionScreen:', {
                        currentTeam,
                        teamSelected,
                        socketConnected: socketRef.current?.connected
                    })}
                    <TeamSelectionScreen
                        debug={true}
                        onTeamSelect={handleTeamSelect}
                        onCharacterSelect={(characterType) => {
                            console.log('Intentando seleccionar personaje:', characterType);
                            if (socketRef.current?.connected) {
                                setSelectedCharacter(characterType);
                                socketRef.current.emit('selectCharacter', { characterType });
                                console.log('Evento selectCharacter emitido al servidor');
                            } else {
                                console.error('Socket no disponible o desconectado');
                            }
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

            {/* Overlay de Gol */}
            {goalFeedback.visible && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%) scale(1)',
                    color: 'white',
                    backgroundColor: goalFeedback.team === 'left' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(239, 68, 68, 0.85)',
                    padding: isMobile ? '12px 20px' : '18px 28px',
                    borderRadius: '12px',
                    fontSize: isMobile ? '28px' : '40px',
                    fontWeight: 800,
                    letterSpacing: '2px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
                    zIndex: 100,
                    backdropFilter: 'blur(2px)',
                    pointerEvents: 'none',
                    animation: 'goalPop 0.4s ease-out, goalFade 2.2s ease-in forwards'
                }}>
                    {t('gameUI.goal') || 'GOAL!'}
                    <div style={{
                        marginTop: isMobile ? '6px' : '8px',
                        fontSize: isMobile ? '12px' : '14px',
                        opacity: 0.9
                    }}>
                        {goalFeedback.team === 'left' ? (t('teamSelection.mammals') || 'Mammals') : (t('teamSelection.reptiles') || 'Reptiles')}
                    </div>
                </div>
            )}

            {/* Canvas de confeti */}
            <canvas
                ref={confettiCanvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 90
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
                                    onDirectionChange={(vector) => {
                                        console.log('Vector:', vector);
                                        handleDirectionChange(vector);
                                    }}
                                    onBallControlChange={(control) => {
                                        if (socketRef.current) {
                                            socketRef.current.emit('ballControl', { control });
                                        }
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
                                                cursor: 'pointer'
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
/* CSS-in-JS keyframes (inserted as a global style once) */
if (typeof document !== 'undefined' && !document.getElementById('goal-animations')) {
    const style = document.createElement('style');
    style.id = 'goal-animations';
    style.innerHTML = `
      @keyframes goalPop { from { transform: translate(-50%, -50%) scale(0.6); opacity: 0 } to { transform: translate(-50%, -50%) scale(1); opacity: 1 } }
      @keyframes goalFade { 0% { opacity: 1 } 75% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes screenShake {
        0% { transform: translate(0, 0) }
        20% { transform: translate(4px, -3px) }
        40% { transform: translate(-3px, 4px) }
        60% { transform: translate(3px, -4px) }
        80% { transform: translate(-4px, 3px) }
        100% { transform: translate(0, 0) }
      }
    `;
    document.head.appendChild(style);
}