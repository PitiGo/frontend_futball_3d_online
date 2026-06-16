import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Physics/physicsEngineComponent';
import '@babylonjs/core/Physics/Plugins/cannonJSPlugin';
import * as GUI from '@babylonjs/gui';
import * as CANNON from 'cannon-es';
import CharacterManager from '../services/characterManager';
import { createScoreDisplay } from './scoreDisplay';
import { createControlEffect, BALL_CONTROL_RADIUS } from './createControlEffect';
import { createProceduralField, FIELD_WIDTH, FIELD_HEIGHT } from './createField';
import { createGoal } from './createGoal';

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

        // Los personajes se cargan bajo demanda al unirse cada jugador (createPlayerInstance).
        onSceneReady();
        onLoadComplete();

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
        const EXTERIOR_SIZE = 100; // Amplio para cubrir el campo agrandado y ver cielo
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
        const fieldW = FIELD_WIDTH;
        const fieldH = FIELD_HEIGHT;
        
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

        // Glow sutil para elementos emisivos (estela, ítems, anillos de control).
        // Desactivado en móvil por coste de la pasada de blur.
        if (!mobile) {
            const glow = new BABYLON.GlowLayer('glow', scene, { blurKernelSize: 32 });
            glow.intensity = 0.55;
            // El cielo y el cartel usan texturas emisivas solo para ignorar la luz:
            // no deben "brillar".
            glow.addExcludedMesh(skyDome);
            const bannerMesh = scene.getMeshByName('gameBanner');
            if (bannerMesh) glow.addExcludedMesh(bannerMesh);
        }

        // Definir las dimensiones del campo como constantes al inicio
        createProceduralField(scene);

        // --- BALÓN: lógica (invisible) + modelo visual (.glb) ---

        // Esfera invisible: hitbox, estela, cámara y posición de red.
        const ball = BABYLON.MeshBuilder.CreateSphere('ball', {
            diameter: 1,
            segments: 8,
        }, scene);
        ball.position.y = 0.5;
        ball.isVisible = false;

        refs.ballRef.current = ball;

        const trail = new BABYLON.TrailMesh('ballTrail', ball, scene, 0.4, 30, true);
        
        const trailMat = new BABYLON.StandardMaterial("trailMat", scene);
        trailMat.emissiveColor = new BABYLON.Color3(1, 1, 1); // Blanco brillante
        trailMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        trailMat.alpha = 0; // Oculta en reposo; se intensifica con la velocidad
        trailMat.disableLighting = true;
        trail.material = trailMat;
        // Estela dinámica: estimamos la velocidad del balón por frame y mapeamos
        // a opacidad/color (azul→naranja) para que solo destaque en disparos rápidos.
        let trailPrevPos = ball.position.clone();

        BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'ball.glb', scene).then((result) => {
            const visualBall = result.meshes[0];
            visualBall.normalizeToUnitCube();
            visualBall.parent = ball;

            result.meshes.forEach((mesh) => {
                if (mesh.material?.getClassName?.() === 'PBRMaterial') {
                    mesh.material.roughness = 0.2;
                    mesh.material.metallic = 0.05;
                }
            });
        }).catch((error) => {
            console.error('Error cargando modelo del balón:', error);
        });

        // Precarga del misil (AssetContainer): se instancia por ítem y por misil en vuelo.
        BABYLON.SceneLoader.LoadAssetContainerAsync('/models/', 'missile.glb', scene).then((container) => {
            container.animationGroups.forEach((ag) => { ag.stop(); ag.reset(); });
            refs.missileContainerRef.current = container;
        }).catch((error) => {
            console.error('Error cargando modelo del misil:', error);
        });

        // --- SOMBRAS "BLOB" (discos suaves bajo jugadores y balón) ---
        // Sin shadow maps (caros): un disco con gradiente radial ancla visualmente
        // a los personajes y al balón al suelo, mejorando la percepción de profundidad.
        const shadowTexture = new BABYLON.DynamicTexture('blobShadowTex', 128, scene, false);
        const shCtx = shadowTexture.getContext();
        const shGrad = shCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
        shGrad.addColorStop(0, 'rgba(0,0,0,0.55)');
        shGrad.addColorStop(0.6, 'rgba(0,0,0,0.28)');
        shGrad.addColorStop(1, 'rgba(0,0,0,0)');
        shCtx.clearRect(0, 0, 128, 128);
        shCtx.fillStyle = shGrad;
        shCtx.fillRect(0, 0, 128, 128);
        shadowTexture.update();
        shadowTexture.hasAlpha = true;

        const shadowMaterial = new BABYLON.StandardMaterial('blobShadowMat', scene);
        shadowMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
        shadowMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        shadowMaterial.opacityTexture = shadowTexture;
        shadowMaterial.disableLighting = true;
        shadowMaterial.freeze();

        const makeBlobShadow = (name, size) => {
            const disc = BABYLON.MeshBuilder.CreatePlane(name, { size }, scene);
            disc.rotation.x = Math.PI / 2;
            disc.position.y = 0.035; // Sobre las líneas (0.02) para evitar z-fighting
            disc.material = shadowMaterial;
            disc.isPickable = false;
            return disc;
        };

        const ballShadow = makeBlobShadow('ballShadow', 1.1);
        const playerShadows = {};

        // --- EFECTOS DE IMPACTO Y GOL (sistemas de partículas reutilizables) ---
        const sparkTexture = new BABYLON.DynamicTexture('sparkTex', 64, scene, false);
        const spCtx = sparkTexture.getContext();
        const spGrad = spCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
        spGrad.addColorStop(0, 'rgba(255,255,255,1)');
        spGrad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        spGrad.addColorStop(1, 'rgba(255,255,255,0)');
        spCtx.clearRect(0, 0, 64, 64);
        spCtx.fillStyle = spGrad;
        spCtx.fillRect(0, 0, 64, 64);
        sparkTexture.update();
        sparkTexture.hasAlpha = true;

        // Ráfaga corta al golpear el balón.
        const kickPs = new BABYLON.ParticleSystem('kickPs', 60, scene);
        kickPs.particleTexture = sparkTexture;
        kickPs.emitter = new BABYLON.Vector3(0, -50, 0); // Fuera de vista hasta el primer uso
        kickPs.minSize = 0.12;
        kickPs.maxSize = 0.3;
        kickPs.minLifeTime = 0.12;
        kickPs.maxLifeTime = 0.3;
        kickPs.minEmitPower = 3;
        kickPs.maxEmitPower = 7;
        kickPs.direction1 = new BABYLON.Vector3(-1, 0.3, -1);
        kickPs.direction2 = new BABYLON.Vector3(1, 1.2, 1);
        kickPs.gravity = new BABYLON.Vector3(0, -12, 0);
        kickPs.color1 = new BABYLON.Color4(1, 0.95, 0.7, 1);
        kickPs.color2 = new BABYLON.Color4(1, 0.6, 0.2, 1);
        kickPs.colorDead = new BABYLON.Color4(1, 0.5, 0.1, 0);
        kickPs.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        kickPs.manualEmitCount = 0;
        kickPs.start();

        // Explosión de misil: bola de fuego compacta naranja/roja.
        const explosionPs = new BABYLON.ParticleSystem('explosionPs', 120, scene);
        explosionPs.particleTexture = sparkTexture;
        explosionPs.emitter = new BABYLON.Vector3(0, -50, 0);
        explosionPs.minSize = 0.25;
        explosionPs.maxSize = 0.6;
        explosionPs.minLifeTime = 0.25;
        explosionPs.maxLifeTime = 0.7;
        explosionPs.minEmitPower = 5;
        explosionPs.maxEmitPower = 12;
        explosionPs.direction1 = new BABYLON.Vector3(-1, 0.2, -1);
        explosionPs.direction2 = new BABYLON.Vector3(1, 2.5, 1);
        explosionPs.gravity = new BABYLON.Vector3(0, -9.8, 0);
        explosionPs.color1 = new BABYLON.Color4(1, 0.7, 0.2, 1);
        explosionPs.color2 = new BABYLON.Color4(1, 0.3, 0.05, 1);
        explosionPs.colorDead = new BABYLON.Color4(0.4, 0.1, 0.05, 0);
        explosionPs.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        explosionPs.manualEmitCount = 0;
        explosionPs.start();

        // Explosión de celebración en la boca de la portería.
        const goalPs = new BABYLON.ParticleSystem('goalPs', 200, scene);
        goalPs.particleTexture = sparkTexture;
        goalPs.emitter = new BABYLON.Vector3(0, -50, 0);
        goalPs.minEmitBox = new BABYLON.Vector3(-0.5, 0, -3);
        goalPs.maxEmitBox = new BABYLON.Vector3(0.5, 1, 3);
        goalPs.minSize = 0.2;
        goalPs.maxSize = 0.55;
        goalPs.minLifeTime = 0.6;
        goalPs.maxLifeTime = 1.4;
        goalPs.minEmitPower = 6;
        goalPs.maxEmitPower = 14;
        goalPs.direction1 = new BABYLON.Vector3(-1, 2, -1);
        goalPs.direction2 = new BABYLON.Vector3(1, 5, 1);
        goalPs.gravity = new BABYLON.Vector3(0, -9.8, 0);
        goalPs.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        goalPs.manualEmitCount = 0;
        goalPs.start();

        // --- SACUDIDA DE CÁMARA (game feel en goles y disparos) ---
        // targetScreenOffset desplaza el encuadre sin tocar target/posición, así no
        // interfiere con el lockedTarget del jugador.
        let shakeAmplitude = 0;
        let shakeElapsedMs = 0;
        const shakeCamera = (intensity = 0.3) => {
            shakeAmplitude = Math.max(shakeAmplitude, intensity);
            shakeElapsedMs = 0;
        };

        const kickBurst = (pos) => {
            kickPs.emitter = new BABYLON.Vector3(pos.x, (pos.y || 0.5), pos.z);
            kickPs.manualEmitCount += mobile ? 10 : 20;
        };

        const explosionBurst = (pos) => {
            explosionPs.emitter = new BABYLON.Vector3(pos.x, (pos.y || 1), pos.z);
            explosionPs.manualEmitCount += mobile ? 40 : 80;
            shakeCamera(0.4);
        };

        const goalBurst = (scoringTeam) => {
            // El equipo 'left' marca en la portería derecha (x > 0) y viceversa.
            const goalX = scoringTeam === 'left' ? FIELD_WIDTH / 2 : -FIELD_WIDTH / 2;
            goalPs.emitter = new BABYLON.Vector3(goalX, 1.2, 0);
            if (scoringTeam === 'left') {
                goalPs.color1 = new BABYLON.Color4(0.3, 0.55, 1, 1);
                goalPs.color2 = new BABYLON.Color4(0.6, 0.8, 1, 1);
                goalPs.colorDead = new BABYLON.Color4(0.2, 0.4, 1, 0);
            } else {
                goalPs.color1 = new BABYLON.Color4(1, 0.35, 0.3, 1);
                goalPs.color2 = new BABYLON.Color4(1, 0.7, 0.4, 1);
                goalPs.colorDead = new BABYLON.Color4(1, 0.25, 0.2, 0);
            }
            goalPs.manualEmitCount += mobile ? 70 : 140;
            shakeCamera(0.55);
        };

        if (refs.fxRef) {
            refs.fxRef.current = { shakeCamera, kickBurst, goalBurst, explosionBurst };
        }

        // --- PORTERÍAS ---
        createGoal(scene, new BABYLON.Vector3(-FIELD_WIDTH / 2, 0, 0), true);
        createGoal(scene, new BABYLON.Vector3(FIELD_WIDTH / 2, 0, 0), false);

        // UI del marcador
        const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');
        refs.advancedTextureRef.current = advancedTexture;

        // Inicializar los efectos de control después de crear la textura
        refs.controlEffectsRef.current = createControlEffect(scene, advancedTexture);


        if (!mobile) {
            refs.scoreTextRef.current = createScoreDisplay(advancedTexture);
        }

        // Interpolación de red a 60 fps: el estado llega a 20 Hz, así que entre
        // paquetes suavizamos hacia la última posición del servidor (netTarget).
        // Esto elimina los "saltos" al moverse rápido (boost). Saltos grandes
        // (goles/reinicios) se teletransportan.
        const NET_SMOOTH_K = 16;   // mayor = sigue al objetivo más rápido (menos lag)
        const NET_SNAP_DIST = 6;   // distancia a partir de la cual se teletransporta
        const NET_SNAP_DIST_SQ = NET_SNAP_DIST * NET_SNAP_DIST;
        const interpolateNet = (mesh, smooth) => {
            const tgt = mesh && mesh.netTarget;
            if (!tgt) return;
            const dx = tgt.x - mesh.position.x;
            const dz = tgt.z - mesh.position.z;
            if (dx * dx + dz * dz > NET_SNAP_DIST_SQ) {
                mesh.position.x = tgt.x;
                mesh.position.z = tgt.z;
            } else {
                mesh.position.x += dx * smooth;
                mesh.position.z += dz * smooth;
            }
            mesh.position.y = tgt.y;
        };

        refs.sceneRef.current.registerBeforeRender(() => {
            // Suavizado de posiciones (jugadores + balón) hacia el último estado.
            const dtMs = Math.max(1, scene.getEngine().getDeltaTime());
            const netDt = dtMs / 1000;
            const smooth = 1 - Math.exp(-NET_SMOOTH_K * netDt);
            const players = refs.playersRef.current;
            if (players) {
                for (const id in players) interpolateNet(players[id], smooth);
            }
            if (refs.ballRef.current) interpolateNet(refs.ballRef.current, smooth);

            // Misiles en vuelo: apuntar hacia su dirección e interpolar posición.
            const missileMeshes = refs.missilesRef?.current;
            if (missileMeshes) {
                for (const id in missileMeshes) {
                    const m = missileMeshes[id];
                    if (!m) continue;

                    if (m.netTarget) {
                        const dx = m.netTarget.x - m.position.x;
                        const dz = m.netTarget.z - m.position.z;
                        if (dx * dx + dz * dz > 0.001) {
                            const targetAngle = Math.atan2(dx, dz);
                            m.rotation.y = BABYLON.Scalar.LerpAngle(m.rotation.y, targetAngle, 0.2);
                        }
                    }

                    interpolateNet(m, smooth);
                }
            }

            // Deriva lenta de nubes: el cielo deja de ser un fondo estático.
            skyDome.rotation.y += 0.000018 * dtMs;

            // Sombras blob: seguir al balón (encogiendo con la altura) y a los jugadores.
            const ballMeshForShadow = refs.ballRef.current;
            if (ballMeshForShadow) {
                ballShadow.position.x = ballMeshForShadow.position.x;
                ballShadow.position.z = ballMeshForShadow.position.z;
                const height = Math.max(0, ballMeshForShadow.position.y - 0.5);
                const s = 1 / (1 + height * 0.8);
                ballShadow.scaling.set(s, s, 1);
            }
            if (players) {
                for (const id in players) {
                    if (!playerShadows[id]) {
                        playerShadows[id] = makeBlobShadow(`playerShadow-${id}`, 1.7);
                    }
                    playerShadows[id].position.x = players[id].position.x;
                    playerShadows[id].position.z = players[id].position.z;
                }
                for (const id in playerShadows) {
                    if (!players[id]) {
                        playerShadows[id].dispose();
                        delete playerShadows[id];
                    }
                }
            }

            // Sacudida de cámara con decaimiento exponencial.
            if (shakeAmplitude > 0) {
                shakeElapsedMs += dtMs;
                const decay = Math.exp(-shakeElapsedMs / 160);
                if (decay < 0.04) {
                    shakeAmplitude = 0;
                    camera.targetScreenOffset.set(0, 0);
                } else {
                    const a = shakeAmplitude * decay;
                    camera.targetScreenOffset.set(
                        (Math.random() - 0.5) * 2 * a,
                        (Math.random() - 0.5) * 2 * a,
                    );
                }
            }

            // Giro continuo de los ítems de velocidad (efecto power-up).
            const items = refs.itemsRef.current;
            if (items) {
                for (const id in items) {
                    if (items[id]) items[id].rotation.y += 0.05;
                }
            }

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
                    const ballMesh = refs.ballRef.current;
                    const dt = Math.max(1, scene.getEngine().getDeltaTime()); // ms
                    const dx = ballMesh.position.x - trailPrevPos.x;
                    const dz = ballMesh.position.z - trailPrevPos.z;
                    const speed = Math.hypot(dx, dz) / (dt / 1000); // u/s
                    trailPrevPos.copyFrom(ballMesh.position);
                    // Mapear velocidad a opacidad: ~invisible bajo 6 u/s, máx sobre 30 u/s.
                    const intensity = Math.max(0, Math.min(1, (speed - 6) / 24));
                    trailMat.alpha = intensity * 0.6;
                    trailMesh.isVisible = intensity > 0.02;
                    // Color azul (lento) → naranja (rápido) para dar sensación de potencia.
                    trailMat.emissiveColor.set(
                        0.6 + intensity * 0.4,
                        0.7,
                        1 - intensity * 0.7,
                    );
                }
            }
        });

        return scene;
}
