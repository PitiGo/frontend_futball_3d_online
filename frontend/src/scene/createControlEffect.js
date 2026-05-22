import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

const BALL_CONTROL_RADIUS = 1.5;

export function createControlEffect(scene, advancedTexture) {
  const controlRing = BABYLON.MeshBuilder.CreateTorus('controlRing', {
    diameter: BALL_CONTROL_RADIUS * 2,
    thickness: 0.2,
    tessellation: 32,
  }, scene);

  const ringMaterial = new BABYLON.StandardMaterial('ringMaterial', scene);
  ringMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.8, 1);
  ringMaterial.alpha = 0.6;
  controlRing.material = ringMaterial;
  controlRing.isVisible = false;

  const rangeRing = BABYLON.MeshBuilder.CreateTorus('rangeRing', {
    diameter: BALL_CONTROL_RADIUS * 2,
    thickness: 0.06,
    tessellation: 32,
  }, scene);
  const rangeMaterial = new BABYLON.StandardMaterial('rangeMaterial', scene);
  rangeMaterial.emissiveColor = new BABYLON.Color3(0.2, 0.9, 0.4);
  rangeMaterial.alpha = 0.35;
  rangeRing.material = rangeMaterial;
  rangeRing.isVisible = false;

  const particles = [];
  for (let i = 0; i < 20; i++) {
    const particle = BABYLON.MeshBuilder.CreateSphere(`particle${i}`, {
      diameter: 0.1,
      segments: 8,
    }, scene);
    const particleMaterial = new BABYLON.StandardMaterial(`particleMat${i}`, scene);
    particleMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.8, 1);
    particleMaterial.alpha = 0.6;
    particle.material = particleMaterial;
    particle.isVisible = false;
    particle.life = 0;
    particle.maxLife = 0.5 + Math.random() * 0.5;
    particle.velocity = new BABYLON.Vector3(0, 0, 0);
    particles.push(particle);
  }

  const animateParticles = (ballPosition) => {
    particles.forEach((particle) => {
      if (particle.life > 0) {
        particle.position.addInPlace(particle.velocity);
        particle.life -= scene.getEngine().getDeltaTime() / 1000;
        particle.material.alpha = (particle.life / particle.maxLife) * 0.6;
        if (particle.life <= 0) particle.isVisible = false;
      } else if (Math.random() < 0.1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.5;
        particle.position = new BABYLON.Vector3(
          ballPosition.x + Math.cos(angle) * radius,
          ballPosition.y,
          ballPosition.z + Math.sin(angle) * radius,
        );
        particle.velocity = new BABYLON.Vector3(
          (Math.random() - 0.5) * 0.1,
          0.05,
          (Math.random() - 0.5) * 0.1,
        );
        particle.life = particle.maxLife;
        particle.isVisible = true;
        particle.material.alpha = 0.6;
      }
    });
  };

  const stopParticles = () => {
    particles.forEach((particle) => {
      particle.isVisible = false;
      particle.life = 0;
    });
  };

  const controlTimeText = new GUI.TextBlock();
  controlTimeText.text = '';
  controlTimeText.color = 'white';
  controlTimeText.fontSize = 14;
  controlTimeText.fontWeight = 'bold';
  controlTimeText.isVisible = false;
  advancedTexture.addControl(controlTimeText);

  const ballHalo = BABYLON.MeshBuilder.CreateTorus('ballHalo', {
    diameter: 1.2,
    thickness: 0.1,
    tessellation: 32,
  }, scene);
  const haloMaterial = new BABYLON.StandardMaterial('haloMaterial', scene);
  haloMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.8, 1);
  haloMaterial.alpha = 0.4;
  ballHalo.material = haloMaterial;
  ballHalo.isVisible = false;

  return {
    controlRing,
    rangeRing,
    animateParticles,
    stopParticles,
    controlTimeText,
    ballHalo,
    particles,
  };
}

export { BALL_CONTROL_RADIUS };
