import * as BABYLON from '@babylonjs/core';
import '@babylonjs/core/Physics/physicsEngineComponent';
import '@babylonjs/core/Physics/Plugins/cannonJSPlugin';
import * as GUI from '@babylonjs/gui';
import * as CANNON from 'cannon-es';
import CharacterManager from '../services/characterManager';
import { createScoreDisplay } from './scoreDisplay';
import { createControlEffect, BALL_CONTROL_RADIUS } from './createControlEffect';

export function createGameScene(canvas, { refs, isMobileRef, onSceneReady, onLoadComplete }) {
    const mobile = isMobileRef.current;
        const engine = new BABYLON.Engine(canvas, true);
        // En el createScene
        if (mobile) {
            engine.setHardwareScalingLevel(1.5); // Reducir resolución en móviles
            engine.adaptToDeviceRatio = false;
        }
        refs.engineRef.current = engine;
        const scene = new BABYLON.Scene(engine);
        refs.sceneRef.current = scene;

        // Inicializar CharacterManager
        refs.characterManagerRef.current = new CharacterManager(scene);

        // Cargar los tres modelos
        const loadCharacters = async () => {
            try {
                await Promise.all([
                    refs.characterManagerRef.current.loadCharacter('player'),
                    refs.characterManagerRef.current.loadCharacter('pig'),
                    refs.characterManagerRef.current.loadCharacter('lizard'),
                    refs.characterManagerRef.current.loadCharacter('turtle')
                ]);
                console.log('Todos los modelos cargados exitosamente');
                onSceneReady();
                onLoadComplete();
            } catch (error) {
                console.error('Error cargando modelos:', error);
                onLoadComplete();
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

        if (mobile) {
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
            diameter: 300, 
            segments: 32,
            slice: 0.5  // Solo la mitad superior (hemisferio)
        }, scene);
        skyDome.position.y = 0; // A nivel del suelo para ver más cielo
        
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
        const EXTERIOR_SIZE = 80; // Tamaño moderado para ver más cielo
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
        
        // === DECORACIONES DEL ESTADIO ===
        
        // Dimensiones del campo para posicionar elementos
        const fieldW = 40;
        const fieldH = 30;
        
        // Materiales compartidos para optimización
        const grayMat = new BABYLON.StandardMaterial("grayMat", scene);
        grayMat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.55);
        grayMat.freeze();
        
        const whiteMat = new BABYLON.StandardMaterial("whiteMat", scene);
        whiteMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
        whiteMat.freeze();
        
        // --- 1. GRADAS SIMPLIFICADAS (un solo bloque con textura) ---
        const createSimpleStand = (posX, posZ, rotY, length, isSouthStand) => {
            const standGroup = new BABYLON.TransformNode("standGroup", scene);
            
            // Bloque principal de la grada - más bajo en el sur para no tapar la cámara
            const standHeight = isSouthStand ? 4 : 6;
            const standBase = BABYLON.MeshBuilder.CreateBox("standBase", {
                width: length,
                height: standHeight,
                depth: 10
            }, scene);
            standBase.position.y = standHeight / 2;
            standBase.parent = standGroup;
            
            // Material simple gris para la grada (sin asientos de colores)
            const standMat = new BABYLON.StandardMaterial("standMat", scene);
            standMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.45);
            standMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            standBase.material = standMat;
            
            // Techo solo para la tribuna norte (sur sin techo para no tapar la cámara)
            if (!isSouthStand) {
                const roof = BABYLON.MeshBuilder.CreateBox("roof", {
                    width: length + 2,
                    height: 0.4,
                    depth: 12
                }, scene);
                roof.position.y = 8;
                roof.parent = standGroup;
                roof.material = grayMat;
                
                // Pilares solo en el norte
                [-length/3, 0, length/3].forEach((px) => {
                    const pillar = BABYLON.MeshBuilder.CreateCylinder("pillar", {
                        diameter: 0.5,
                        height: 8
                    }, scene);
                    pillar.position.set(px, 4, 5);
                    pillar.parent = standGroup;
                    pillar.material = grayMat;
                });
                
                // Cartel publicitario con imagen del juego (MamVsReptiles)
                // En la parte frontal de la tribuna, encajado perfectamente
                // standBase: width=length, height=6, depth=10, posición Y=3 (centro)
                // La tribuna está en posZ con rotación PI, así que el frente local (-Z) apunta al campo
                // El frente de la tribuna está en: posZ - depth/2 = fieldH/2 + 8 - 5 = fieldH/2 + 3
                const bannerWidth = length - 2; // Un poco menos que el ancho de la tribuna
                const bannerHeight = standHeight - 0.5; // Casi toda la altura de la tribuna
                const banner = BABYLON.MeshBuilder.CreatePlane("gameBanner", {
                    width: bannerWidth,
                    height: bannerHeight,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE
                }, scene);
                // Posición relativa al standGroup (que tiene rotación PI)
                // Z negativo = hacia el campo, Y = centro de la altura
                banner.position.set(0, standHeight / 2, -5.01); // -5.01 para que esté justo delante del frente
                banner.parent = standGroup;
                
                const bannerMat = new BABYLON.StandardMaterial("bannerMat", scene);
                const bannerTexture = new BABYLON.Texture(
                    process.env.PUBLIC_URL + "/mamvsreptiles.webp",
                    scene,
                    false, // noMipmap
                    true,  // invertY
                    BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
                    () => { console.log("Banner texture loaded successfully"); },
                    (msg, ex) => { console.error("Banner texture failed to load:", msg, ex); }
                );
                bannerMat.diffuseTexture = bannerTexture;
                bannerMat.emissiveTexture = bannerTexture;
                bannerMat.emissiveColor = new BABYLON.Color3(1, 1, 1); // Brillo máximo
                bannerMat.specularColor = new BABYLON.Color3(0, 0, 0);
                banner.material = bannerMat;
            }
            
            standGroup.position.set(posX, 0, posZ);
            standGroup.rotation.y = rotY;
            return standGroup;
        };
        
        // Crear grada solo en el lado norte (la del sur eliminada para mejor visibilidad)
        createSimpleStand(0, fieldH / 2 + 8, Math.PI, fieldW - 5, false); // Lado norte - con techo
        
        // --- 2. TORRES DE ILUMINACIÓN simplificadas ---
        const createLightTower = (posX, posZ) => {
            // Poste principal
            const pole = BABYLON.MeshBuilder.CreateCylinder("pole", {
                diameter: 0.4,
                height: 18
            }, scene);
            pole.position.set(posX, 9, posZ);
            pole.material = grayMat;
            
            // Plataforma con luces
            const platform = BABYLON.MeshBuilder.CreateBox("platform", {
                width: 3,
                height: 0.4,
                depth: 1.5
            }, scene);
            platform.position.set(posX, 18, posZ);
            
            const lightMat = new BABYLON.StandardMaterial("lightMat", scene);
            lightMat.emissiveColor = new BABYLON.Color3(1, 0.95, 0.8);
            platform.material = lightMat;
        };
        
        // Torres en las 4 esquinas
        createLightTower(-fieldW / 2 - 6, -fieldH / 2 - 6);
        createLightTower(fieldW / 2 + 6, -fieldH / 2 - 6);
        createLightTower(-fieldW / 2 - 6, fieldH / 2 + 6);
        createLightTower(fieldW / 2 + 6, fieldH / 2 + 6);
        
        // --- 3. BANQUILLOS simplificados ---
        const createBench = (posX, posZ, teamColor) => {
            // Techo
            const benchRoof = BABYLON.MeshBuilder.CreateBox("benchRoof", {
                width: 5,
                height: 0.15,
                depth: 2.5
            }, scene);
            benchRoof.position.set(posX, 2.2, posZ);
            
            const roofMat = new BABYLON.StandardMaterial("benchRoofMat", scene);
            roofMat.diffuseColor = teamColor;
            benchRoof.material = roofMat;
            
            // Base/asiento
            const seatBench = BABYLON.MeshBuilder.CreateBox("seatBench", {
                width: 4,
                height: 0.5,
                depth: 1
            }, scene);
            seatBench.position.set(posX, 0.25, posZ);
            seatBench.material = grayMat;
        };
        
        createBench(-7, -fieldH / 2 - 3.5, new BABYLON.Color3(0.2, 0.4, 0.9));
        createBench(7, -fieldH / 2 - 3.5, new BABYLON.Color3(0.9, 0.2, 0.2));
        
        // --- 4. BANDERINES DE CÓRNER ---
        const createCornerFlag = (posX, posZ) => {
            const flagPole = BABYLON.MeshBuilder.CreateCylinder("flagPole", {
                diameter: 0.06,
                height: 1.5
            }, scene);
            flagPole.position.set(posX, 0.75, posZ);
            flagPole.material = whiteMat;
            
            const flag = BABYLON.MeshBuilder.CreatePlane("flag", {
                width: 0.4,
                height: 0.3
            }, scene);
            flag.position.set(posX + 0.2, 1.35, posZ);
            
            const flagMat = new BABYLON.StandardMaterial("flagMat", scene);
            flagMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0);
            flagMat.backFaceCulling = false;
            flag.material = flagMat;
        };
        
        createCornerFlag(-fieldW / 2, -fieldH / 2);
        createCornerFlag(fieldW / 2, -fieldH / 2);
        createCornerFlag(-fieldW / 2, fieldH / 2);
        createCornerFlag(fieldW / 2, fieldH / 2);
        
        // --- 5. VALLAS PUBLICITARIAS (menos cantidad) ---
        const adMat = new BABYLON.StandardMaterial("adMat", scene);
        const adTexture = new BABYLON.DynamicTexture("adTex", { width: 512, height: 64 }, scene);
        const adCtx = adTexture.getContext();
        const colors = ['#1a5fb4', '#e01b24', '#33d17a', '#f5c211', '#9141ac'];
        colors.forEach((color, i) => {
            adCtx.fillStyle = color;
            adCtx.fillRect(i * 102.4, 0, 102.4, 64);
        });
        adTexture.update();
        adMat.diffuseTexture = adTexture;
        adMat.emissiveColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        adMat.freeze();
        
        // Solo 2 vallas por lado largo (en lugar de 8)
        [-fieldW / 4, fieldW / 4].forEach(x => {
            const board1 = BABYLON.MeshBuilder.CreateBox("adBoard", { width: 15, height: 0.8, depth: 0.08 }, scene);
            board1.position.set(x, 0.4, -fieldH / 2 - 1.2);
            board1.material = adMat;
            
            const board2 = BABYLON.MeshBuilder.CreateBox("adBoard", { width: 15, height: 0.8, depth: 0.08 }, scene);
            board2.position.set(x, 0.4, fieldH / 2 + 1.2);
            board2.material = adMat;
        });
        
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
        
        refs.ballRef.current = ball;

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
        refs.advancedTextureRef.current = advancedTexture;

        // Inicializar los efectos de control después de crear la textura
        refs.controlEffectsRef.current = createControlEffect(scene, advancedTexture);


        if (!mobile) {
            refs.scoreTextRef.current = createScoreDisplay(advancedTexture);
        }

        refs.sceneRef.current.registerBeforeRender(() => {
            if (refs.ballRef.current && refs.controlEffectsRef.current) {
                refs.controlEffectsRef.current.ballHalo.position = refs.ballRef.current.position.clone();
                refs.controlEffectsRef.current.ballHalo.rotation.y += 0.02;

                if (refs.controlEffectsRef.current.ballHalo.isVisible) {
                    refs.controlEffectsRef.current.animateParticles(refs.ballRef.current.position);
                }

                const localPlayer = refs.socketRef.current?.id && refs.playersRef.current[refs.socketRef.current.id];
                if (localPlayer && refs.ballRef.current) {
                    const dx = refs.ballRef.current.position.x - localPlayer.position.x;
                    const dz = refs.ballRef.current.position.z - localPlayer.position.z;
                    const inRange = (dx * dx + dz * dz) <= (BALL_CONTROL_RADIUS * BALL_CONTROL_RADIUS);
                    const rangeRing = refs.controlEffectsRef.current.rangeRing;
                    if (rangeRing) {
                        rangeRing.position = localPlayer.position.clone();
                        rangeRing.position.y = 0.05;
                        rangeRing.isVisible = inRange && !refs.controlEffectsRef.current.controlRing.isVisible;
                    }
                }

                const trailMesh = scene.getMeshByName("ballTrail");
                if (trailMesh) {
                    trailMesh.isVisible = true;
                }
            }
        });

        return scene;
}
