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
    const [gameOverInfo, setGameOverInfo] = useState(null); // Store game over data (winner, final score)

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

        // === CIELO COMO DOMO (SOLO ARRIBA) ===
        scene.clearColor = new BABYLON.Color4(0.53, 0.81, 0.92, 1.0); // Azul cielo como fallback
        
        // Crear domo de cielo (hemisferio superior)
        const skyDome = BABYLON.MeshBuilder.CreateSphere("skyDome", { 
            diameter: 400, 
            segments: 32,
            slice: 0.5  // Solo la mitad superior (hemisferio)
        }, scene);
        skyDome.position.y = -5; // Bajar un poco para que el horizonte quede a nivel
        
        const skyMaterial = new BABYLON.StandardMaterial("skyMat", scene);
        skyMaterial.backFaceCulling = false;
        skyMaterial.disableLighting = true;
        
        // Crear textura de cielo procedural con gradiente y nubes
        const skyTexture = new BABYLON.DynamicTexture("skyTexture", 1024, scene);
        const skyCtx = skyTexture.getContext();
        const skySize = skyTexture.getSize().width;
        
        // Gradiente de cielo (azul más oscuro arriba, más claro en horizonte)
        const skyGradient = skyCtx.createLinearGradient(0, 0, 0, skySize);
        skyGradient.addColorStop(0, "#1e5799");    // Azul intenso arriba (cénit)
        skyGradient.addColorStop(0.4, "#7db9e8");  // Azul cielo medio
        skyGradient.addColorStop(0.7, "#a8d4ea");  // Azul claro
        skyGradient.addColorStop(1, "#d4e8f2");    // Casi blanco en horizonte
        skyCtx.fillStyle = skyGradient;
        skyCtx.fillRect(0, 0, skySize, skySize);
        
        // Añadir nubes procedurales
        skyCtx.globalAlpha = 0.7;
        for (let i = 0; i < 20; i++) {
            const cloudX = Math.random() * skySize;
            const cloudY = skySize * 0.15 + Math.random() * skySize * 0.4;
            const cloudWidth = 60 + Math.random() * 120;
            const cloudHeight = 25 + Math.random() * 40;
            
            skyCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
            for (let j = 0; j < 6; j++) {
                const offsetX = (Math.random() - 0.5) * cloudWidth * 0.7;
                const offsetY = (Math.random() - 0.5) * cloudHeight * 0.4;
                const blobW = cloudWidth * (0.25 + Math.random() * 0.35);
                const blobH = cloudHeight * (0.35 + Math.random() * 0.35);
                skyCtx.beginPath();
                skyCtx.ellipse(cloudX + offsetX, cloudY + offsetY, blobW, blobH, 0, 0, Math.PI * 2);
                skyCtx.fill();
            }
        }
        skyCtx.globalAlpha = 1.0;
        skyTexture.update();
        
        skyMaterial.emissiveTexture = skyTexture;
        skyDome.material = skyMaterial;
        
        // === SUELO EXTERIOR (área alrededor del campo) ===
        const EXTERIOR_SIZE = 120; // Suelo grande que rodea todo
        const exteriorGround = BABYLON.MeshBuilder.CreateGround('exteriorGround', {
            width: EXTERIOR_SIZE,
            height: EXTERIOR_SIZE,
            subdivisions: 4
        }, scene);
        exteriorGround.position.y = -0.02; // Justo debajo del campo
        
        // Textura de suelo exterior (tipo pista de atletismo / concreto)
        const exteriorTexture = new BABYLON.DynamicTexture("exteriorTexture", 1024, scene);
        const extCtx = exteriorTexture.getContext();
        const extSize = exteriorTexture.getSize().width;
        
        // Color base gris/marrón rojizo (pista de atletismo)
        const extGradient = extCtx.createRadialGradient(
            extSize / 2, extSize / 2, 0,
            extSize / 2, extSize / 2, extSize * 0.7
        );
        extGradient.addColorStop(0, "#8B4513");   // Marrón tierra en el centro
        extGradient.addColorStop(0.3, "#A0522D"); // Sienna
        extGradient.addColorStop(0.6, "#CD853F"); // Peru
        extGradient.addColorStop(1, "#6B4423");   // Marrón oscuro en los bordes
        extCtx.fillStyle = extGradient;
        extCtx.fillRect(0, 0, extSize, extSize);
        
        // Añadir textura granulada (tipo pista)
        const extImageData = extCtx.getImageData(0, 0, extSize, extSize);
        const extData = extImageData.data;
        for (let i = 0; i < extData.length; i += 4) {
            const noise = (Math.random() - 0.5) * 20;
            extData[i] = Math.max(0, Math.min(255, extData[i] + noise));
            extData[i + 1] = Math.max(0, Math.min(255, extData[i + 1] + noise * 0.8));
            extData[i + 2] = Math.max(0, Math.min(255, extData[i + 2] + noise * 0.5));
        }
        extCtx.putImageData(extImageData, 0, 0);
        
        // Líneas de pista de atletismo (carriles)
        extCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        extCtx.lineWidth = 3;
        for (let r = 300; r < extSize; r += 60) {
            extCtx.beginPath();
            extCtx.arc(extSize / 2, extSize / 2, r, 0, Math.PI * 2);
            extCtx.stroke();
        }
        
        exteriorTexture.update();
        
        const exteriorMaterial = new BABYLON.StandardMaterial("exteriorMat", scene);
        exteriorMaterial.diffuseTexture = exteriorTexture;
        exteriorMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        exteriorGround.material = exteriorMaterial;
        
        // Iluminación mejorada para simular luz solar
        const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.8;
        light.groundColor = new BABYLON.Color3(0.4, 0.5, 0.3); // Luz rebotada verdosa del césped
        
        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
        dirLight.intensity = 0.6;
        dirLight.diffuse = new BABYLON.Color3(1, 0.98, 0.9); // Luz solar cálida

        // Definir las dimensiones del campo como constantes al inicio
        const FIELD_WIDTH = 40;
        const FIELD_HEIGHT = 30;

        // Reemplazar la creación actual del campo con esta versión mejorada
        const createProceduralField = (scene) => {
            // Usar las constantes definidas arriba
            const ground = BABYLON.MeshBuilder.CreateGround('ground', {
                width: FIELD_WIDTH,
                height: FIELD_HEIGHT,
                subdivisions: 64
            }, scene);

            // Generar textura de césped procedural con franjas profesionales
            const grassTexture = new BABYLON.DynamicTexture("proceduralGrass", 2048, scene);
            const ctx = grassTexture.getContext();
            const texSize = grassTexture.getSize().width;

            // Dibujar franjas de césped alternadas (como campos profesionales)
            const stripeCount = 12;
            const stripeWidth = texSize / stripeCount;
            
            for (let i = 0; i < stripeCount; i++) {
                // Crear gradiente sutil dentro de cada franja para más realismo
                const isLight = i % 2 === 0;
                const stripeGradient = ctx.createLinearGradient(i * stripeWidth, 0, (i + 1) * stripeWidth, 0);
                
                if (isLight) {
                    stripeGradient.addColorStop(0, "#2a8529");
                    stripeGradient.addColorStop(0.5, "#2d8a2e");
                    stripeGradient.addColorStop(1, "#2a8529");
                } else {
                    stripeGradient.addColorStop(0, "#1f6320");
                    stripeGradient.addColorStop(0.5, "#236b24");
                    stripeGradient.addColorStop(1, "#1f6320");
                }
                
                ctx.fillStyle = stripeGradient;
                ctx.fillRect(i * stripeWidth, 0, stripeWidth, texSize);
            }

            // Añadir variación de tono muy sutil con ruido (sin manchas circulares)
            const imageData = ctx.getImageData(0, 0, texSize, texSize);
            const data = imageData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                // Variación muy pequeña y natural en cada canal de color
                const variation = (Math.random() - 0.5) * 8; // ±4 de variación
                data[i] = Math.max(0, Math.min(255, data[i] + variation));     // R
                data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + variation)); // G
                data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + variation * 0.5)); // B (menos variación)
            }
            ctx.putImageData(imageData, 0, 0);

            // Añadir líneas horizontales muy sutiles para simular el corte del césped
            ctx.globalAlpha = 0.03;
            ctx.strokeStyle = "#1a4a1b";
            ctx.lineWidth = 1;
            for (let y = 0; y < texSize; y += 8) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(texSize, y);
                ctx.stroke();
            }

            ctx.globalAlpha = 1.0;
            grassTexture.update();
            grassTexture.wrapU = grassTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;

            // Material del césped mejorado
            const grassMaterial = new BABYLON.StandardMaterial("grassMat", scene);
            grassMaterial.diffuseTexture = grassTexture;
            grassMaterial.specularColor = new BABYLON.Color3(0.05, 0.08, 0.05);
            grassMaterial.diffuseTexture.uScale = 1;
            grassMaterial.diffuseTexture.vScale = 1;
            ground.material = grassMaterial;

            // === LÍNEAS DEL CAMPO PROFESIONALES ===
            const linesTexture = new BABYLON.DynamicTexture("linesTexture", 2048, scene);
            const linesCtx = linesTexture.getContext();
            const lSize = linesTexture.getSize().width;
            
            // Proporciones del campo (escaladas a la textura)
            const margin = 30;  // Margen del borde
            const fieldW = lSize - margin * 2;
            const fieldH = lSize - margin * 2;
            const centerX = lSize / 2;
            const centerY = lSize / 2;
            
            // Proporciones reales de fútbol (ajustadas al campo)
            const penaltyAreaWidth = fieldW * 0.16;   // Ancho del área grande
            const penaltyAreaHeight = fieldH * 0.44;  // Alto del área grande
            const goalAreaWidth = fieldW * 0.055;     // Ancho del área pequeña
            const goalAreaHeight = fieldH * 0.19;     // Alto del área pequeña
            const penaltySpotDist = fieldW * 0.11;    // Distancia punto penalti
            const centerCircleRadius = fieldH * 0.16; // Radio círculo central
            const cornerRadius = fieldH * 0.033;      // Radio arco córner
            const penaltyArcRadius = fieldH * 0.16;   // Radio arco del área

            // Configurar estilo de líneas
            linesCtx.strokeStyle = "white";
            linesCtx.fillStyle = "white";
            linesCtx.lineWidth = 6;
            linesCtx.lineCap = "round";
            linesCtx.lineJoin = "round";

            // 1. Líneas exteriores del campo
            linesCtx.strokeRect(margin, margin, fieldW, fieldH);

            // 2. Línea central vertical
            linesCtx.beginPath();
            linesCtx.moveTo(centerX, margin);
            linesCtx.lineTo(centerX, lSize - margin);
            linesCtx.stroke();

            // 3. Círculo central
            linesCtx.beginPath();
            linesCtx.arc(centerX, centerY, centerCircleRadius, 0, Math.PI * 2);
            linesCtx.stroke();

            // 4. Punto central
            linesCtx.beginPath();
            linesCtx.arc(centerX, centerY, 8, 0, Math.PI * 2);
            linesCtx.fill();

            // 5. Área de penalti IZQUIERDA
            const leftPenaltyX = margin;
            const leftPenaltyY = centerY - penaltyAreaHeight / 2;
            linesCtx.strokeRect(leftPenaltyX, leftPenaltyY, penaltyAreaWidth, penaltyAreaHeight);

            // 6. Área pequeña IZQUIERDA
            const leftGoalY = centerY - goalAreaHeight / 2;
            linesCtx.strokeRect(leftPenaltyX, leftGoalY, goalAreaWidth, goalAreaHeight);

            // 7. Punto de penalti IZQUIERDO
            linesCtx.beginPath();
            linesCtx.arc(margin + penaltySpotDist, centerY, 6, 0, Math.PI * 2);
            linesCtx.fill();

            // 8. Semicírculo del área IZQUIERDA
            linesCtx.beginPath();
            linesCtx.arc(margin + penaltySpotDist, centerY, penaltyArcRadius, -Math.PI * 0.35, Math.PI * 0.35);
            linesCtx.stroke();

            // 9. Área de penalti DERECHA
            const rightPenaltyX = lSize - margin - penaltyAreaWidth;
            linesCtx.strokeRect(rightPenaltyX, leftPenaltyY, penaltyAreaWidth, penaltyAreaHeight);

            // 10. Área pequeña DERECHA
            const rightGoalX = lSize - margin - goalAreaWidth;
            linesCtx.strokeRect(rightGoalX, leftGoalY, goalAreaWidth, goalAreaHeight);

            // 11. Punto de penalti DERECHO
            linesCtx.beginPath();
            linesCtx.arc(lSize - margin - penaltySpotDist, centerY, 6, 0, Math.PI * 2);
            linesCtx.fill();

            // 12. Semicírculo del área DERECHA
            linesCtx.beginPath();
            linesCtx.arc(lSize - margin - penaltySpotDist, centerY, penaltyArcRadius, Math.PI * 0.65, Math.PI * 1.35);
            linesCtx.stroke();

            // 13. Arcos de esquina (córners)
            // Esquina superior izquierda
            linesCtx.beginPath();
            linesCtx.arc(margin, margin, cornerRadius, 0, Math.PI * 0.5);
            linesCtx.stroke();
            // Esquina superior derecha
            linesCtx.beginPath();
            linesCtx.arc(lSize - margin, margin, cornerRadius, Math.PI * 0.5, Math.PI);
            linesCtx.stroke();
            // Esquina inferior izquierda
            linesCtx.beginPath();
            linesCtx.arc(margin, lSize - margin, cornerRadius, Math.PI * 1.5, Math.PI * 2);
            linesCtx.stroke();
            // Esquina inferior derecha
            linesCtx.beginPath();
            linesCtx.arc(lSize - margin, lSize - margin, cornerRadius, Math.PI, Math.PI * 1.5);
            linesCtx.stroke();

            linesTexture.update();
            linesTexture.hasAlpha = true;

            // Plano para las líneas
            const lines = BABYLON.MeshBuilder.CreatePlane("lines", { size: 1 }, scene);
            const linesMaterial = new BABYLON.StandardMaterial("linesMat", scene);
            linesMaterial.diffuseTexture = linesTexture;
            linesMaterial.opacityTexture = linesTexture;
            linesMaterial.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9);
            linesMaterial.useAlphaFromDiffuseTexture = true;
            linesMaterial.backFaceCulling = false;
            lines.material = linesMaterial;
            lines.rotation.x = Math.PI / 2;
            lines.position.y = 0.02;
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

        // --- INICIO MEJORA BALÓN ---

        // 1. Geometría de alta definición
        // Aumentamos 'segments' a 32 para que se vea perfectamente redonda
        const ball = BABYLON.MeshBuilder.CreateSphere('ball', { 
            diameter: 1, 
            segments: 32 
        }, scene);

        // 2. Material PBR (Physically Based Rendering) para realismo
        const ballMaterial = new BABYLON.PBRMaterial('ballMat', scene);
        
        // Textura base (Tu imagen actual)
        ballMaterial.albedoTexture = new BABYLON.Texture("soccerball.png", scene);
        
        // Propiedades del material (Cuero sintético)
        ballMaterial.metallic = 0;      // No es metálico
        ballMaterial.roughness = 0.4;   // Un poco brillante pero no espejo
        
        // Ajustes de iluminación
        ballMaterial.environmentIntensity = 1.0; // Qué tanto refleja el entorno
        ballMaterial.usePhysicalLightFalloff = false;
        
        // Opcional: Si tienes una textura de normales ("bump map") añade esto:
        // ballMaterial.bumpTexture = new BABYLON.Texture("soccerball_normal.png", scene);
        // ballMaterial.bumpTexture.level = 0.5; // Intensidad del relieve

        ball.material = ballMaterial;
        
        // Posición inicial y corrección de pivote
        ball.position.y = 0.5;
        
        // Habilitar sombras si hay luz direccional (asegúrate de que tu 'dirLight' tenga shadowGenerator)
        // const shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight);
        // shadowGenerator.addShadowCaster(ball);
        
        ballRef.current = ball;

        // 3. Efecto de Estela (Trail) para velocidad
        // Crea un rastro que sigue a la pelota
        const trail = new BABYLON.TrailMesh("ballTrail", ball, scene, 0.4, 30, true);
        
        const trailMat = new BABYLON.StandardMaterial("trailMat", scene);
        trailMat.emissiveColor = new BABYLON.Color3(1, 1, 1); // Blanco brillante
        trailMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        trailMat.alpha = 0.4; // Semitransparente
        trail.material = trailMat;

        // --- FIN MEJORA BALÓN ---

        // --- INICIO CÓDIGO CORREGIDO PORTERÍA ---

        // 1. Generar textura procedural para la red (igual que antes)
        const netTexture = new BABYLON.DynamicTexture("netTexture", {width: 512, height: 512}, scene);
        const netCtx = netTexture.getContext();
        netCtx.fillStyle = "transparent";
        netCtx.clearRect(0, 0, 512, 512);
        netCtx.strokeStyle = "rgba(220, 220, 220, 0.8)"; // Un poco más visible
        netCtx.lineWidth = 4;
        netCtx.beginPath();
        const step = 32;
        for (let i = 0; i <= 512; i += step) {
            netCtx.moveTo(i, 0); netCtx.lineTo(i, 512);
            netCtx.moveTo(0, i); netCtx.lineTo(512, i);
        }
        netCtx.stroke();
        netTexture.update();
        netTexture.hasAlpha = true;

        const netMaterial = new BABYLON.StandardMaterial("netMat", scene);
        netMaterial.diffuseTexture = netTexture;
        netMaterial.backFaceCulling = false;
        netMaterial.alpha = 0.6;
        netMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        netMaterial.freeze(); // Optimización

        const createGoal = (position, isLeftGoal) => {
            const goalRoot = new BABYLON.TransformNode("goalRoot", scene);
            goalRoot.position = position;

            const goalWidth = 7;    // Ancho (Eje Z local)
            const goalHeight = 2.44; // Alto (Eje Y local)
            const goalDepth = 2.0;   // Profundidad hacia atrás (Eje X local negativo)
            const postRadius = 0.10; // Postes un poco más finos para estética

            const whiteMat = new BABYLON.StandardMaterial("postWhite", scene);
            whiteMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
            whiteMat.freeze();

            // --- ESTRUCTURA DE POSTES (FRAME) ---

            // 1. Poste Izquierdo (Vertical)
            const postL = BABYLON.MeshBuilder.CreateCylinder("postL", {height: goalHeight, diameter: postRadius * 2}, scene);
            postL.position = new BABYLON.Vector3(0, goalHeight/2, -goalWidth/2);
            postL.material = whiteMat;
            postL.parent = goalRoot;
            postL.physicsImpostor = new BABYLON.PhysicsImpostor(postL, BABYLON.PhysicsImpostor.CylinderImpostor, {mass: 0}, scene);

            // 2. Poste Derecho (Vertical)
            const postR = BABYLON.MeshBuilder.CreateCylinder("postR", {height: goalHeight, diameter: postRadius * 2}, scene);
            postR.position = new BABYLON.Vector3(0, goalHeight/2, goalWidth/2);
            postR.material = whiteMat;
            postR.parent = goalRoot;
            postR.physicsImpostor = new BABYLON.PhysicsImpostor(postR, BABYLON.PhysicsImpostor.CylinderImpostor, {mass: 0}, scene);

            // 3. Travesaño (Horizontal Superior)
            const crossbar = BABYLON.MeshBuilder.CreateCylinder("crossbar", {height: goalWidth + (postRadius*2), diameter: postRadius * 2}, scene);
            crossbar.rotation.x = Math.PI / 2;
            crossbar.position = new BABYLON.Vector3(0, goalHeight, 0);
            crossbar.material = whiteMat;
            crossbar.parent = goalRoot;
            crossbar.physicsImpostor = new BABYLON.PhysicsImpostor(crossbar, BABYLON.PhysicsImpostor.CylinderImpostor, {mass: 0}, scene);

            // 4. Soportes Traseros SUPERIORES (Para hacer la forma de caja)
            // Barra trasera superior izquierda (hacia el fondo)
            const topBarL = BABYLON.MeshBuilder.CreateTube("topBarL", {
                path: [new BABYLON.Vector3(0, goalHeight, -goalWidth/2), new BABYLON.Vector3(-goalDepth, goalHeight, -goalWidth/2)],
                radius: postRadius * 0.7
            }, scene);
            topBarL.material = whiteMat;
            topBarL.parent = goalRoot;

            // Barra trasera superior derecha (hacia el fondo)
            const topBarR = BABYLON.MeshBuilder.CreateTube("topBarR", {
                path: [new BABYLON.Vector3(0, goalHeight, goalWidth/2), new BABYLON.Vector3(-goalDepth, goalHeight, goalWidth/2)],
                radius: postRadius * 0.7
            }, scene);
            topBarR.material = whiteMat;
            topBarR.parent = goalRoot;

            // 5. Soportes Traseros INFERIORES (Base de la red)
            const bottomBarL = BABYLON.MeshBuilder.CreateTube("bottomBarL", {
                path: [new BABYLON.Vector3(0, 0, -goalWidth/2), new BABYLON.Vector3(-goalDepth, 0, -goalWidth/2)],
                radius: postRadius * 0.7
            }, scene);
            bottomBarL.material = whiteMat;
            bottomBarL.parent = goalRoot;

            const bottomBarR = BABYLON.MeshBuilder.CreateTube("bottomBarR", {
                path: [new BABYLON.Vector3(0, 0, goalWidth/2), new BABYLON.Vector3(-goalDepth, 0, goalWidth/2)],
                radius: postRadius * 0.7
            }, scene);
            bottomBarR.material = whiteMat;
            bottomBarR.parent = goalRoot;

            // 6. Barras de conexión TRASERAS (Unen los soportes en el fondo)
            // Barra vertical trasera izquierda
            const backPostL = BABYLON.MeshBuilder.CreateTube("backPostL", {
                path: [new BABYLON.Vector3(-goalDepth, 0, -goalWidth/2), new BABYLON.Vector3(-goalDepth, goalHeight, -goalWidth/2)],
                radius: postRadius * 0.7
            }, scene);
            backPostL.material = whiteMat;
            backPostL.parent = goalRoot;

             // Barra vertical trasera derecha
             const backPostR = BABYLON.MeshBuilder.CreateTube("backPostR", {
                path: [new BABYLON.Vector3(-goalDepth, 0, goalWidth/2), new BABYLON.Vector3(-goalDepth, goalHeight, goalWidth/2)],
                radius: postRadius * 0.7
            }, scene);
            backPostR.material = whiteMat;
            backPostR.parent = goalRoot;

            // Barra horizontal trasera inferior (suelo)
            const backBottomBar = BABYLON.MeshBuilder.CreateTube("backBottom", {
                path: [new BABYLON.Vector3(-goalDepth, 0, -goalWidth/2), new BABYLON.Vector3(-goalDepth, 0, goalWidth/2)],
                radius: postRadius * 0.7
            }, scene);
            backBottomBar.material = whiteMat;
            backBottomBar.parent = goalRoot;
            
            // Barra horizontal trasera superior (techo fondo)
            const backTopBar = BABYLON.MeshBuilder.CreateTube("backTop", {
                path: [new BABYLON.Vector3(-goalDepth, goalHeight, -goalWidth/2), new BABYLON.Vector3(-goalDepth, goalHeight, goalWidth/2)],
                radius: postRadius * 0.7
            }, scene);
            backTopBar.material = whiteMat;
            backTopBar.parent = goalRoot;

            // --- REDES (NETS) - Con techo ---

            // Red Trasera (FONDO)
            const netBack = BABYLON.MeshBuilder.CreatePlane("netBack", {width: goalWidth, height: goalHeight}, scene);
            netBack.position = new BABYLON.Vector3(-goalDepth, goalHeight/2, 0);
            netBack.rotation.y = -Math.PI / 2; // Mirando hacia el campo
            netBack.material = netMaterial;
            netBack.parent = goalRoot;
            netBack.physicsImpostor = new BABYLON.PhysicsImpostor(netBack, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1}, scene);

            // Red Izquierda (LATERAL)
            const netLeft = BABYLON.MeshBuilder.CreatePlane("netLeft", {width: goalDepth, height: goalHeight}, scene);
            netLeft.position = new BABYLON.Vector3(-goalDepth/2, goalHeight/2, -goalWidth/2);
            netLeft.rotation.y = Math.PI; // Mirando hacia adentro (o afuera, da igual con backFaceCulling false)
            netLeft.material = netMaterial;
            netLeft.parent = goalRoot;
            netLeft.physicsImpostor = new BABYLON.PhysicsImpostor(netLeft, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1}, scene);

            // Red Derecha (LATERAL)
            const netRight = BABYLON.MeshBuilder.CreatePlane("netRight", {width: goalDepth, height: goalHeight}, scene);
            netRight.position = new BABYLON.Vector3(-goalDepth/2, goalHeight/2, goalWidth/2);
            // Rotation 0 es correcta aquí por defecto para este lado
            netRight.material = netMaterial;
            netRight.parent = goalRoot;
            netRight.physicsImpostor = new BABYLON.PhysicsImpostor(netRight, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1}, scene);

            // Red Superior (TECHO)
            // width → eje X (profundidad), height → eje Z después de rotar (ancho de portería)
            const netTop = BABYLON.MeshBuilder.CreatePlane("netTop", {width: goalDepth, height: goalWidth}, scene);
            netTop.position = new BABYLON.Vector3(-goalDepth/2, goalHeight, 0);
            netTop.rotation.x = -Math.PI / 2; // Rotar para que sea horizontal (mirando hacia abajo)
            netTop.material = netMaterial;
            netTop.parent = goalRoot;
            netTop.physicsImpostor = new BABYLON.PhysicsImpostor(netTop, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1}, scene);

            // Orientación final de todo el grupo según el lado del campo
            if (isLeftGoal) {
                goalRoot.rotation.y = 0; 
            } else {
                goalRoot.rotation.y = Math.PI;
            }

            return goalRoot;
        };

        // Crear las porterías
        createGoal(new BABYLON.Vector3(-FIELD_WIDTH / 2, 0, 0), true); 
        createGoal(new BABYLON.Vector3(FIELD_WIDTH / 2, 0, 0), false);

        // --- FIN CÓDIGO CORREGIDO ---

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

                // --- LÓGICA DE ESTELA DINÁMICA ---
                // Obtenemos la estela buscando por nombre (o guardándola en un ref aparte)
                const trailMesh = scene.getMeshByName("ballTrail");
                if (trailMesh) {
                    // Calcular velocidad actual (aproximada por cambio de posición o usando physicsImpostor si existiera en cliente)
                    // Aquí usaremos un truco visual: si la pelota se mueve, el trail se ve.
                    // Podemos ajustar la visibilidad según la velocidad si tuviéramos acceso a ella, 
                    // pero el TrailMesh de Babylon ya hace un buen trabajo desvaneciéndose.
                    
                    // Simplemente aseguramos que el material esté correcto
                    trailMesh.isVisible = true; 
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
            
            // Force immediate update of 3D scoreboard (BabylonJS) if it exists
            if (scoreTextRef.current) {
                scoreTextRef.current.left.text = (score.left || 0).toString();
                scoreTextRef.current.right.text = (score.right || 0).toString();
            }
            
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
            console.log('>>> [FRONTEND] Juego terminado - Datos recibidos:', gameOverData);
            console.log('>>> [FRONTEND] gameOverData type:', typeof gameOverData);
            console.log('>>> [FRONTEND] gameOverData.winningTeam:', gameOverData?.winningTeam);
            console.log('>>> [FRONTEND] gameOverData.finalScore:', gameOverData?.finalScore);
            
            setGameStarted(false);
            setGameInProgress(false);
            
            // Ensure data is saved before showing message
            if (gameOverData) {
                console.log('>>> [FRONTEND] Guardando gameOverInfo y mostrando mensaje...');
                setGameOverInfo(gameOverData);
                setShowingEndMessage(true);
                console.log('>>> [FRONTEND] Estados actualizados - showingEndMessage debería ser true');
            } else {
                console.error('>>> [FRONTEND] ERROR: gameOverData es null o undefined!');
            }
        };

        const handleScoreUpdate = (newScore) => {
            console.log('>>> Actualización de puntaje:', newScore);
            setScore(newScore);
        };

        const handleGameStateInfo = ({ currentState }) => {
            console.log('>>> [FRONTEND] Estado del juego recibido:', currentState);
            setGameInProgress(currentState === 'playing');

            // If server says we're waiting, hide end game message and reset states
            // IMPORTANTE: Solo resetear si NO estamos mostrando el mensaje de fin de juego
            // Esto evita que se resetee antes de que se muestre la pantalla de victoria
            if (currentState === 'waiting') {
                console.log('>>> [FRONTEND] Estado WAITING recibido. Reseteando estados...');
                // Usar un pequeño delay para asegurar que gameOver se procese primero
                setTimeout(() => {
                    console.log('>>> [FRONTEND] Ejecutando reset de estados después de delay...');
                    setShowingEndMessage(false);
                    setGameStarted(false); // Ensure game is marked as not started
                    setScore({ left: 0, right: 0 }); // Reset score visually
                    setGameOverInfo(null); // Clear game over info
                }, 100);
            }
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

            {/* Victory Screen */}
            {showingEndMessage && gameOverInfo && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.9)', // Slightly darker
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999, // Extremely high z-index to ensure visibility
                    color: 'white',
                    animation: 'fadeIn 0.5s ease',
                    pointerEvents: 'auto' // Ensure it captures clicks if we add buttons later
                }}>
                    <h1 style={{ 
                        fontSize: isMobile ? '2rem' : '4rem', 
                        fontWeight: 'bold',
                        // Use ?. to avoid crashes if winningTeam is missing
                        color: gameOverInfo?.winningTeam === 'left' ? '#3b82f6' : '#ef4444',
                        textShadow: '0 0 20px rgba(255,255,255,0.2)',
                        textAlign: 'center',
                        marginBottom: '20px'
                    }}>
                        {gameOverInfo?.winningTeam === 'left' 
                            ? (t('gameUI.mammalTeam') || "MAMMALS WIN!") 
                            : (t('gameUI.reptileTeam') || "REPTILES WIN!")}
                    </h1>
                    
                    <div style={{
                        fontSize: isMobile ? '3rem' : '6rem',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        marginBottom: '30px'
                    }}>
                        {/* Use ?. and || 0 for safety */}
                        <span style={{ color: '#3b82f6' }}>{gameOverInfo?.finalScore?.left || 0}</span>
                        <span style={{ margin: '0 20px', color: '#666' }}>-</span>
                        <span style={{ color: '#ef4444' }}>{gameOverInfo?.finalScore?.right || 0}</span>
                    </div>

                    <p style={{ fontSize: '1.2rem', color: '#aaa' }}>
                        {t('gameUI.victory') || "VICTORY!"}
                    </p>
                    
                    <p style={{ marginTop: '20px', fontSize: '0.9rem', opacity: 0.7 }}>
                        Volviendo a la sala en unos segundos...
                    </p>
                </div>
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
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    `;
    document.head.appendChild(style);
}