import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

function createTextureFromCanvas(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

export function createConcreteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, 1024, 1024);
  base.addColorStop(0, '#1a1816');
  base.addColorStop(0.55, '#23211e');
  base.addColorStop(1, '#101010');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 54000; i += 1) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const tone = 28 + Math.floor(Math.random() * 58);
    const alpha = Math.random() * 0.12;
    ctx.fillStyle = `rgba(${tone}, ${tone - 3}, ${tone - 8}, ${alpha})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }

  ctx.strokeStyle = 'rgba(255, 207, 120, 0.28)';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(44, 850);
  ctx.lineTo(982, 760);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 30; i += 1) {
    const y = 40 + i * 32;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  return createTextureFromCanvas(canvas, 8, 8);
}

export function createDustTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 3600; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const radius = Math.random() * 1.6;
    const alpha = 0.02 + Math.random() * 0.12;
    ctx.fillStyle = `rgba(236, 220, 186, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  return createTextureFromCanvas(canvas, 1, 1);
}

export function createMetalStripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#d1a44c';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#111111';
  for (let i = -64; i < 640; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 32, 0);
    ctx.lineTo(i + 96, 64);
    ctx.lineTo(i + 64, 64);
    ctx.closePath();
    ctx.fill();
  }

  return createTextureFromCanvas(canvas, 4, 1);
}

export function createWordTexture(text, accent = '#f4d08f') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const fill = ctx.createLinearGradient(0, 0, 1024, 0);
  fill.addColorStop(0, 'rgba(0, 0, 0, 0.96)');
  fill.addColorStop(0.56, 'rgba(12, 12, 12, 0.98)');
  fill.addColorStop(1, 'rgba(0, 0, 0, 0.96)');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 1024, 256);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.strokeRect(8, 10, 1008, 236);

  ctx.font = '700 108px Arial';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = accent;
  ctx.shadowColor = 'rgba(255, 210, 140, 0.55)';
  ctx.shadowBlur = 18;
  ctx.fillText(text.toUpperCase(), 36, 126);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

export function createNoiseTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 38000; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const g = 28 + Math.floor(Math.random() * 60);
    const a = Math.random() * 0.04;
    ctx.fillStyle = `rgba(${g}, ${g}, ${g}, ${a})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  return createTextureFromCanvas(canvas, 1, 1);
}