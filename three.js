<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Handlungsraum – Modern Field Mode</title>

<style>
  body { margin: 0; overflow: hidden; background: black; }
  canvas { display: block; }
</style>
</head>

<body>

<script type="module">

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

/* =========================
   BASIC SETUP
========================= */
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.z = 80;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

/* =========================
   CORE (CENTER)
========================= */
const core = new THREE.Mesh(
  new THREE.SphereGeometry(6, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xff00ff })
);
scene.add(core);

/* =========================
   "PDF ENTITIES" (SIMPLIFIED)
========================= */
const FILES = [
  "handlungsraum.pdf",
  "kunstraum.pdf"
];

const nodes = [];
const velocity = [];

/* =========================
   BUILD FIELD
========================= */
function buildField() {

  FILES.forEach((file, i) => {

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(4, 24, 24),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x00ffff : 0xffff00
      })
    );

    mesh.position.set(
      (i - 0.5) * 40,
      0,
      0
    );

    mesh.userData.file = file;

    scene.add(mesh);

    nodes.push(mesh);
    velocity.push(new THREE.Vector3());
  });
}

/* =========================
   ANIMATION
========================= */
function animate() {

  requestAnimationFrame(animate);

  core.rotation.y += 0.002;

  nodes.forEach((n, i) => {

    const dir = new THREE.Vector3()
      .subVectors(core.position, n.position)
      .multiplyScalar(0.01);

    velocity[i].add(dir);
    velocity[i].multiplyScalar(0.92);

    n.position.add(velocity[i]);

    n.scale.setScalar(
      1 + Math.sin(Date.now() * 0.002 + i) * 0.3
    );
  });

  renderer.render(scene, camera);
}

/* =========================
   RESIZE
========================= */
window.addEventListener("resize", () => {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* =========================
   START
========================= */
buildField();
animate();

</script>

</body>
</html>
