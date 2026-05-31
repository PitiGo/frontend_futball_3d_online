import * as BABYLON from '@babylonjs/core';

export const FIELD_WIDTH = 52;
export const FIELD_HEIGHT = 39;

export function createProceduralField(scene) {
  const ground = BABYLON.MeshBuilder.CreateGround('ground', {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    subdivisions: 64,
  }, scene);

  const grassTexture = new BABYLON.DynamicTexture('proceduralGrass', 2048, scene);
  const ctx = grassTexture.getContext();
  const texSize = grassTexture.getSize().width;

  const stripeCount = 12;
  const stripeWidth = texSize / stripeCount;

  for (let i = 0; i < stripeCount; i++) {
    const isLight = i % 2 === 0;
    const stripeGradient = ctx.createLinearGradient(i * stripeWidth, 0, (i + 1) * stripeWidth, 0);

    if (isLight) {
      stripeGradient.addColorStop(0, '#2a8529');
      stripeGradient.addColorStop(0.5, '#2d8a2e');
      stripeGradient.addColorStop(1, '#2a8529');
    } else {
      stripeGradient.addColorStop(0, '#1f6320');
      stripeGradient.addColorStop(0.5, '#236b24');
      stripeGradient.addColorStop(1, '#1f6320');
    }

    ctx.fillStyle = stripeGradient;
    ctx.fillRect(i * stripeWidth, 0, stripeWidth, texSize);
  }

  const imageData = ctx.getImageData(0, 0, texSize, texSize);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const variation = (Math.random() - 0.5) * 8;
    data[i] = Math.max(0, Math.min(255, data[i] + variation));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + variation));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + variation * 0.5));
  }
  ctx.putImageData(imageData, 0, 0);

  ctx.globalAlpha = 0.03;
  ctx.strokeStyle = '#1a4a1b';
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

  const grassMaterial = new BABYLON.StandardMaterial('grassMat', scene);
  grassMaterial.diffuseTexture = grassTexture;
  grassMaterial.specularColor = new BABYLON.Color3(0.05, 0.08, 0.05);
  grassMaterial.diffuseTexture.uScale = 1;
  grassMaterial.diffuseTexture.vScale = 1;
  ground.material = grassMaterial;

  const linesTexture = new BABYLON.DynamicTexture('linesTexture', 2048, scene);
  const linesCtx = linesTexture.getContext();
  const lSize = linesTexture.getSize().width;

  const margin = 30;
  const fieldW = lSize - margin * 2;
  const fieldH = lSize - margin * 2;
  const centerX = lSize / 2;
  const centerY = lSize / 2;

  const penaltyAreaWidth = fieldW * 0.16;
  const penaltyAreaHeight = fieldH * 0.44;
  const goalAreaWidth = fieldW * 0.055;
  const goalAreaHeight = fieldH * 0.19;
  const penaltySpotDist = fieldW * 0.11;
  const centerCircleRadius = fieldH * 0.16;
  const cornerRadius = fieldH * 0.033;
  const penaltyArcRadius = fieldH * 0.16;

  linesCtx.strokeStyle = 'white';
  linesCtx.fillStyle = 'white';
  linesCtx.lineWidth = 6;
  linesCtx.lineCap = 'round';
  linesCtx.lineJoin = 'round';

  linesCtx.strokeRect(margin, margin, fieldW, fieldH);

  linesCtx.beginPath();
  linesCtx.moveTo(centerX, margin);
  linesCtx.lineTo(centerX, lSize - margin);
  linesCtx.stroke();

  linesCtx.beginPath();
  linesCtx.arc(centerX, centerY, centerCircleRadius, 0, Math.PI * 2);
  linesCtx.stroke();

  linesCtx.beginPath();
  linesCtx.arc(centerX, centerY, 8, 0, Math.PI * 2);
  linesCtx.fill();

  const leftPenaltyX = margin;
  const leftPenaltyY = centerY - penaltyAreaHeight / 2;
  linesCtx.strokeRect(leftPenaltyX, leftPenaltyY, penaltyAreaWidth, penaltyAreaHeight);

  const leftGoalY = centerY - goalAreaHeight / 2;
  linesCtx.strokeRect(leftPenaltyX, leftGoalY, goalAreaWidth, goalAreaHeight);

  linesCtx.beginPath();
  linesCtx.arc(margin + penaltySpotDist, centerY, 6, 0, Math.PI * 2);
  linesCtx.fill();

  linesCtx.beginPath();
  linesCtx.arc(margin + penaltySpotDist, centerY, penaltyArcRadius, -Math.PI * 0.35, Math.PI * 0.35);
  linesCtx.stroke();

  const rightPenaltyX = lSize - margin - penaltyAreaWidth;
  linesCtx.strokeRect(rightPenaltyX, leftPenaltyY, penaltyAreaWidth, penaltyAreaHeight);

  const rightGoalX = lSize - margin - goalAreaWidth;
  linesCtx.strokeRect(rightGoalX, leftGoalY, goalAreaWidth, goalAreaHeight);

  linesCtx.beginPath();
  linesCtx.arc(lSize - margin - penaltySpotDist, centerY, 6, 0, Math.PI * 2);
  linesCtx.fill();

  linesCtx.beginPath();
  linesCtx.arc(lSize - margin - penaltySpotDist, centerY, penaltyArcRadius, Math.PI * 0.65, Math.PI * 1.35);
  linesCtx.stroke();

  linesCtx.beginPath();
  linesCtx.arc(margin, margin, cornerRadius, 0, Math.PI * 0.5);
  linesCtx.stroke();
  linesCtx.beginPath();
  linesCtx.arc(lSize - margin, margin, cornerRadius, Math.PI * 0.5, Math.PI);
  linesCtx.stroke();
  linesCtx.beginPath();
  linesCtx.arc(margin, lSize - margin, cornerRadius, Math.PI * 1.5, Math.PI * 2);
  linesCtx.stroke();
  linesCtx.beginPath();
  linesCtx.arc(lSize - margin, lSize - margin, cornerRadius, Math.PI, Math.PI * 1.5);
  linesCtx.stroke();

  linesTexture.update();
  linesTexture.hasAlpha = true;

  const lines = BABYLON.MeshBuilder.CreatePlane('lines', { size: 1 }, scene);
  const linesMaterial = new BABYLON.StandardMaterial('linesMat', scene);
  linesMaterial.diffuseTexture = linesTexture;
  linesMaterial.opacityTexture = linesTexture;
  linesMaterial.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9);
  linesMaterial.useAlphaFromDiffuseTexture = true;
  linesMaterial.backFaceCulling = false;
  lines.material = linesMaterial;
  lines.rotation.x = Math.PI / 2;
  lines.position.y = 0.02;
  lines.scaling = new BABYLON.Vector3(FIELD_WIDTH, FIELD_HEIGHT, 1);

  ground.physicsImpostor = new BABYLON.PhysicsImpostor(
    ground,
    BABYLON.PhysicsImpostor.BoxImpostor,
    { mass: 0, restitution: 0.9, friction: 0.1 },
    scene,
  );

  return ground;
}
