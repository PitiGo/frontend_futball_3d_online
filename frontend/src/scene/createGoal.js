import * as BABYLON from '@babylonjs/core';

function createNetMaterial(scene) {
  const netTexture = new BABYLON.DynamicTexture('netTexture', { width: 512, height: 512 }, scene);
  const netCtx = netTexture.getContext();
  netCtx.fillStyle = 'transparent';
  netCtx.clearRect(0, 0, 512, 512);
  netCtx.strokeStyle = 'rgba(220, 220, 220, 0.8)';
  netCtx.lineWidth = 4;
  netCtx.beginPath();
  const step = 32;
  for (let i = 0; i <= 512; i += step) {
    netCtx.moveTo(i, 0);
    netCtx.lineTo(i, 512);
    netCtx.moveTo(0, i);
    netCtx.lineTo(512, i);
  }
  netCtx.stroke();
  netTexture.update();
  netTexture.hasAlpha = true;

  const netMaterial = new BABYLON.StandardMaterial('netMat', scene);
  netMaterial.diffuseTexture = netTexture;
  netMaterial.backFaceCulling = false;
  netMaterial.alpha = 0.6;
  netMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  netMaterial.freeze();
  return netMaterial;
}

export function createGoal(scene, position, isLeftGoal) {
  const netMaterial = createNetMaterial(scene);
  const goalRoot = new BABYLON.TransformNode('goalRoot', scene);
  goalRoot.position = position;

  const goalWidth = 8; // Debe coincidir con GOAL_DEPTH del servidor (collisions.js)
  const goalHeight = 2.44;
  const goalDepth = 2.0;
  const postRadius = 0.10;

  const whiteMat = new BABYLON.StandardMaterial('postWhite', scene);
  whiteMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
  whiteMat.freeze();

  const postL = BABYLON.MeshBuilder.CreateCylinder('postL', { height: goalHeight, diameter: postRadius * 2 }, scene);
  postL.position = new BABYLON.Vector3(0, goalHeight / 2, -goalWidth / 2);
  postL.material = whiteMat;
  postL.parent = goalRoot;
  postL.physicsImpostor = new BABYLON.PhysicsImpostor(postL, BABYLON.PhysicsImpostor.CylinderImpostor, { mass: 0 }, scene);

  const postR = BABYLON.MeshBuilder.CreateCylinder('postR', { height: goalHeight, diameter: postRadius * 2 }, scene);
  postR.position = new BABYLON.Vector3(0, goalHeight / 2, goalWidth / 2);
  postR.material = whiteMat;
  postR.parent = goalRoot;
  postR.physicsImpostor = new BABYLON.PhysicsImpostor(postR, BABYLON.PhysicsImpostor.CylinderImpostor, { mass: 0 }, scene);

  const crossbar = BABYLON.MeshBuilder.CreateCylinder('crossbar', { height: goalWidth + (postRadius * 2), diameter: postRadius * 2 }, scene);
  crossbar.rotation.x = Math.PI / 2;
  crossbar.position = new BABYLON.Vector3(0, goalHeight, 0);
  crossbar.material = whiteMat;
  crossbar.parent = goalRoot;
  crossbar.physicsImpostor = new BABYLON.PhysicsImpostor(crossbar, BABYLON.PhysicsImpostor.CylinderImpostor, { mass: 0 }, scene);

  const topBarL = BABYLON.MeshBuilder.CreateTube('topBarL', {
    path: [new BABYLON.Vector3(0, goalHeight, -goalWidth / 2), new BABYLON.Vector3(-goalDepth, goalHeight, -goalWidth / 2)],
    radius: postRadius * 0.7,
  }, scene);
  topBarL.material = whiteMat;
  topBarL.parent = goalRoot;

  const topBarR = BABYLON.MeshBuilder.CreateTube('topBarR', {
    path: [new BABYLON.Vector3(0, goalHeight, goalWidth / 2), new BABYLON.Vector3(-goalDepth, goalHeight, goalWidth / 2)],
    radius: postRadius * 0.7,
  }, scene);
  topBarR.material = whiteMat;
  topBarR.parent = goalRoot;

  const bottomBarL = BABYLON.MeshBuilder.CreateTube('bottomBarL', {
    path: [new BABYLON.Vector3(0, 0, -goalWidth / 2), new BABYLON.Vector3(-goalDepth, 0, -goalWidth / 2)],
    radius: postRadius * 0.7,
  }, scene);
  bottomBarL.material = whiteMat;
  bottomBarL.parent = goalRoot;

  const bottomBarR = BABYLON.MeshBuilder.CreateTube('bottomBarR', {
    path: [new BABYLON.Vector3(0, 0, goalWidth / 2), new BABYLON.Vector3(-goalDepth, 0, goalWidth / 2)],
    radius: postRadius * 0.7,
  }, scene);
  bottomBarR.material = whiteMat;
  bottomBarR.parent = goalRoot;

  const backPostL = BABYLON.MeshBuilder.CreateTube('backPostL', {
    path: [new BABYLON.Vector3(-goalDepth, 0, -goalWidth / 2), new BABYLON.Vector3(-goalDepth, goalHeight, -goalWidth / 2)],
    radius: postRadius * 0.7,
  }, scene);
  backPostL.material = whiteMat;
  backPostL.parent = goalRoot;

  const backPostR = BABYLON.MeshBuilder.CreateTube('backPostR', {
    path: [new BABYLON.Vector3(-goalDepth, 0, goalWidth / 2), new BABYLON.Vector3(-goalDepth, goalHeight, goalWidth / 2)],
    radius: postRadius * 0.7,
  }, scene);
  backPostR.material = whiteMat;
  backPostR.parent = goalRoot;

  const backBottomBar = BABYLON.MeshBuilder.CreateTube('backBottom', {
    path: [new BABYLON.Vector3(-goalDepth, 0, -goalWidth / 2), new BABYLON.Vector3(-goalDepth, 0, goalWidth / 2)],
    radius: postRadius * 0.7,
  }, scene);
  backBottomBar.material = whiteMat;
  backBottomBar.parent = goalRoot;

  const backTopBar = BABYLON.MeshBuilder.CreateTube('backTop', {
    path: [new BABYLON.Vector3(-goalDepth, goalHeight, -goalWidth / 2), new BABYLON.Vector3(-goalDepth, goalHeight, goalWidth / 2)],
    radius: postRadius * 0.7,
  }, scene);
  backTopBar.material = whiteMat;
  backTopBar.parent = goalRoot;

  const netBack = BABYLON.MeshBuilder.CreatePlane('netBack', { width: goalWidth, height: goalHeight }, scene);
  netBack.position = new BABYLON.Vector3(-goalDepth, goalHeight / 2, 0);
  netBack.rotation.y = -Math.PI / 2;
  netBack.material = netMaterial;
  netBack.parent = goalRoot;
  netBack.physicsImpostor = new BABYLON.PhysicsImpostor(netBack, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.1 }, scene);

  const netLeft = BABYLON.MeshBuilder.CreatePlane('netLeft', { width: goalDepth, height: goalHeight }, scene);
  netLeft.position = new BABYLON.Vector3(-goalDepth / 2, goalHeight / 2, -goalWidth / 2);
  netLeft.rotation.y = Math.PI;
  netLeft.material = netMaterial;
  netLeft.parent = goalRoot;
  netLeft.physicsImpostor = new BABYLON.PhysicsImpostor(netLeft, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.1 }, scene);

  const netRight = BABYLON.MeshBuilder.CreatePlane('netRight', { width: goalDepth, height: goalHeight }, scene);
  netRight.position = new BABYLON.Vector3(-goalDepth / 2, goalHeight / 2, goalWidth / 2);
  netRight.material = netMaterial;
  netRight.parent = goalRoot;
  netRight.physicsImpostor = new BABYLON.PhysicsImpostor(netRight, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.1 }, scene);

  const netTop = BABYLON.MeshBuilder.CreatePlane('netTop', { width: goalDepth, height: goalWidth }, scene);
  netTop.position = new BABYLON.Vector3(-goalDepth / 2, goalHeight, 0);
  netTop.rotation.x = -Math.PI / 2;
  netTop.material = netMaterial;
  netTop.parent = goalRoot;
  netTop.physicsImpostor = new BABYLON.PhysicsImpostor(netTop, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.1 }, scene);

  goalRoot.rotation.y = isLeftGoal ? 0 : Math.PI;
  return goalRoot;
}
