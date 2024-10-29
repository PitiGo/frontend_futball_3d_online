var createScene = function () {
    var scene = new BABYLON.Scene(engine);
    var gravityVector = new BABYLON.Vector3(0, -9.81, 0);
    var physicsPlugin = new BABYLON.CannonJSPlugin();
    scene.enablePhysics(gravityVector, physicsPlugin);

    // Función para limitar un valor entre un mínimo y un máximo
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    // Crear una cámara que seguirá al jugador
    var camera = new BABYLON.FollowCamera("FollowCam", new BABYLON.Vector3(0, 10, -10), scene);
    camera.radius = 15;
    camera.heightOffset = 7;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 10;

    // Iluminación
    var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // Crear el campo de fútbol
    var fieldWidth = 30;
    var fieldHeight = 20;
    var ground = BABYLON.MeshBuilder.CreateGround("ground", {width: fieldWidth, height: fieldHeight}, scene);
    var groundMaterial = new BABYLON.StandardMaterial("groundMat", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.1); // Color verde para el césped
    ground.material = groundMaterial;
    ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.9, friction: 0.1 }, scene);

    // Función para crear texto plano en el campo
    var createFieldText = function(scene) {
        var textPlane = BABYLON.MeshBuilder.CreatePlane("textPlane", {width: fieldWidth * 0.8, height: fieldHeight * 0.4}, scene);
        textPlane.position.y = 0.02; // Ligeramente más elevado para evitar z-fighting
        textPlane.rotation.x = Math.PI / 2;

        var textureResolution = 4096; // Aumentamos la resolución para mayor detalle
        var textTexture = new BABYLON.DynamicTexture("dynamicTexture", textureResolution, scene);
        var textContext = textTexture.getContext();

        // Cargar fuente personalizada
        var fontFace = new FontFace('Pinyon Script', 'url(https://fonts.gstatic.com/s/pinyonscript/v11/6xKpdSJbL9-e9LuoeQiDRQR8WOXaPw.woff2)');
        fontFace.load().then(function(loadedFace) {
            document.fonts.add(loadedFace);
            drawText(0); // Dibujar texto inicial una vez que la fuente esté cargada
        });

        var drawText = function(offset) {
            textContext.clearRect(0, 0, textureResolution, textureResolution);
            textContext.font = "bold 700px 'Pinyon Script', cursive";
            textContext.textAlign = "center";
            textContext.textBaseline = "middle";
            
            // Sombra sutil
            textContext.shadowColor = "rgba(0, 50, 0, 0.3)";
            textContext.shadowBlur = 20;
            textContext.shadowOffsetX = 4;
            textContext.shadowOffsetY = 4;
            
            // Gradiente sutil
            var gradient = textContext.createLinearGradient(0, 0, 0, textureResolution);
            gradient.addColorStop(0, "rgba(100, 180, 100, 0.6)");
            gradient.addColorStop(1, "rgba(50, 150, 50, 0.6)");
            textContext.fillStyle = gradient;
            
            textContext.fillText("Dante", textureResolution / 2, textureResolution / 2 + offset);

            textTexture.update();
        };

        var textMaterial = new BABYLON.StandardMaterial("textMaterial", scene);
        textMaterial.diffuseTexture = textTexture;
        textMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        textMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        textMaterial.alpha = 0.5; // Ligera transparencia
        textMaterial.backFaceCulling = false;

        textPlane.material = textMaterial;

        // Animación sutil
        var animationOffset = 0;
        scene.registerBeforeRender(function() {
            animationOffset = Math.sin(performance.now() * 0.0005) * 10; // Movimiento suave
            drawText(animationOffset);
        });
    };

    // Llamar a la función para crear el texto
    createFieldText(scene);

    // Crear la pelota mejorada
    var ball = BABYLON.MeshBuilder.CreateSphere("ball", {diameter: 1, segments: 32}, scene);
    ball.position = new BABYLON.Vector3(0, 1, 0);
    var ballMaterial = new BABYLON.StandardMaterial("ballMat", scene);
    ballMaterial.diffuseTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/soccerball.png", scene);
    ball.material = ballMaterial;
    ball.physicsImpostor = new BABYLON.PhysicsImpostor(ball, BABYLON.PhysicsImpostor.SphereImpostor, { mass: 1, restitution: 0.9, friction: 0.1 }, scene);

    // Sistema de partículas mejorado
    var particleSystem = new BABYLON.ParticleSystem("particles", 500, scene);
    particleSystem.emitter = ball;
    particleSystem.minEmitBox = new BABYLON.Vector3(-0.1, -0.1, -0.1);
    particleSystem.maxEmitBox = new BABYLON.Vector3(0.1, 0.1, 0.1);
    particleSystem.color1 = new BABYLON.Color4(1, 0.5, 0, 1);
    particleSystem.color2 = new BABYLON.Color4(1, 0, 0, 1);
    particleSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0);
    particleSystem.minSize = 0.1;
    particleSystem.maxSize = 0.5;
    particleSystem.minLifeTime = 0.3;
    particleSystem.maxLifeTime = 1.5;
    particleSystem.emitRate = 100;
    particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    particleSystem.gravity = new BABYLON.Vector3(0, -9.81, 0);
    particleSystem.direction1 = new BABYLON.Vector3(-1, -1, -1);
    particleSystem.direction2 = new BABYLON.Vector3(1, 1, 1);
    particleSystem.minAngularSpeed = 0;
    particleSystem.maxAngularSpeed = Math.PI;
    particleSystem.minEmitPower = 1;
    particleSystem.maxEmitPower = 5;
    particleSystem.updateSpeed = 0.01;
    particleSystem.particleTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/flare.png", scene);
    particleSystem.start();

    // Crear el jugador (cubo)
    var player = BABYLON.MeshBuilder.CreateBox("player", {size: 1}, scene);
    player.position = new BABYLON.Vector3(-5, 0.5, 0);
    var playerMaterial = new BABYLON.StandardMaterial("playerMat", scene);
    playerMaterial.diffuseColor = new BABYLON.Color3(0.07, 0.26, 0.88);
    player.material = playerMaterial;
    player.physicsImpostor = new BABYLON.PhysicsImpostor(player, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 2, friction: 0.1, restitution: 0.1 }, scene);

    // Asignar el jugador como objetivo de la cámara
    camera.lockedTarget = player;

    // Crear porterías
    var createGoal = function(position) {
        var goal = BABYLON.MeshBuilder.CreateBox("goal", {width: 0.5, height: 3, depth: 5}, scene);
        goal.position = position;
        var goalMaterial = new BABYLON.StandardMaterial("goalMat", scene);
        goalMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        goal.material = goalMaterial;
        goal.physicsImpostor = new BABYLON.PhysicsImpostor(goal, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0 }, scene);
        return goal;
    };

    var leftGoal = createGoal(new BABYLON.Vector3(-fieldWidth/2 + 0.25, 1.5, 0));
    var rightGoal = createGoal(new BABYLON.Vector3(fieldWidth/2 - 0.25, 1.5, 0));

    // Sistema de puntuación
    var score = {left: 0, right: 0};
    
    // Crear un AdvancedDynamicTexture para la interfaz de usuario
    var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

    // Crear un rectángulo para el fondo del marcador
    var scoreBackground = new BABYLON.GUI.Rectangle();
    scoreBackground.width = "200px";
    scoreBackground.height = "40px";
    scoreBackground.cornerRadius = 20;
    scoreBackground.color = "White";
    scoreBackground.thickness = 2;
    scoreBackground.background = "Black";
    scoreBackground.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    scoreBackground.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    scoreBackground.top = "10px";
    advancedTexture.addControl(scoreBackground);

    // Crear el texto del marcador
    var scoreText = new BABYLON.GUI.TextBlock();
    scoreText.text = "0 - 0";
    scoreText.color = "white";
    scoreText.fontSize = 24;
    scoreBackground.addControl(scoreText);

    // Función para actualizar el marcador
    var updateScore = function() {
        if (scoreText) {
            scoreText.text = score.left + " - " + score.right;
        }
    };

    // Función para reiniciar la pelota
    var resetBall = function() {
        if (ball && ball.physicsImpostor) {
            ball.position = new BABYLON.Vector3(0, 1, 0);
            ball.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
            ball.physicsImpostor.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
        }
    };

    // Detectar goles y mantener la pelota dentro del campo
    scene.onBeforeRenderObservable.add(() => {
        if (ball && ball.position) {
            // Gol en la portería izquierda
            if (ball.position.x < -fieldWidth/2 + 1.5 && Math.abs(ball.position.z) < 2.5 && ball.position.y < 3) {
                score.right++;
                updateScore();
                resetBall();
            } 
            // Gol en la portería derecha
            else if (ball.position.x > fieldWidth/2 - 1.5 && Math.abs(ball.position.z) < 2.5 && ball.position.y < 3) {
                score.left++;
                updateScore();
                resetBall();
            }

            // Mantener la pelota dentro del campo
            var ballRadius = 0.5;
            var halfFieldWidth = fieldWidth / 2 - ballRadius;
            var halfFieldHeight = fieldHeight / 2 - ballRadius;

            if (ball.physicsImpostor) {
                var velocity = ball.physicsImpostor.getLinearVelocity();
                var position = ball.position;

                if (Math.abs(position.x) > halfFieldWidth) {
                    position.x = Math.sign(position.x) * halfFieldWidth;
                    velocity.x *= -1;
                }
                
                if (Math.abs(position.z) > halfFieldHeight) {
                    position.z = Math.sign(position.z) * halfFieldHeight;
                    velocity.z *= -1;
                }

                ball.position = position;
                ball.physicsImpostor.setLinearVelocity(velocity);
            }

            // Ajustar la emisión de partículas según la velocidad de la pelota
            var speed = ball.physicsImpostor.getLinearVelocity().length();
            particleSystem.emitRate = Math.min(speed * 50, 500);
            particleSystem.minEmitPower = speed / 2;
            particleSystem.maxEmitPower = speed;
        }
    });

    // Control del jugador
    var moveSpeed = 10;
    var inputMap = {};

    scene.onKeyboardObservable.add((kbInfo) => {
        switch (kbInfo.type) {
            case BABYLON.KeyboardEventTypes.KEYDOWN:
                inputMap[kbInfo.event.key] = true;
                break;
            case BABYLON.KeyboardEventTypes.KEYUP:
                inputMap[kbInfo.event.key] = false;
                break;
        }
    });

   scene.onBeforeRenderObservable.add(() => {
        if (player && player.physicsImpostor) {
            var velocity = player.physicsImpostor.getLinearVelocity();
            var desiredVelocity = new BABYLON.Vector3(0, velocity.y, 0);

            if (inputMap["ArrowUp"] || inputMap["w"]) {
                desiredVelocity.z = moveSpeed;
            }
            if (inputMap["ArrowDown"] || inputMap["s"]) {
                desiredVelocity.z = -moveSpeed;
            }
            if (inputMap["ArrowLeft"] || inputMap["a"]) {
                desiredVelocity.x = -moveSpeed;
            }
            if (inputMap["ArrowRight"] || inputMap["d"]) {
                desiredVelocity.x = moveSpeed;
            }

            player.physicsImpostor.setLinearVelocity(desiredVelocity);
            player.rotationQuaternion = BABYLON.Quaternion.Identity();

            // Limitar la posición del jugador dentro del campo
            var halfFieldWidth = fieldWidth / 2 - 0.5;
            var halfFieldHeight = fieldHeight / 2 - 0.5;
            player.position.x = clamp(player.position.x, -halfFieldWidth, halfFieldWidth);
            player.position.z = clamp(player.position.z, -halfFieldHeight, halfFieldHeight);
        }
    });

    return scene;
};