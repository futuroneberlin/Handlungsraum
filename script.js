import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// =========================
// CORE THREE SETUP (expects your index.html renderer already exists OR adapt)
// =========================

export let scene, camera, renderer;

export function init(baseScene, baseCamera, baseRenderer) {
  scene = baseScene;
  camera = baseCamera;
  renderer = baseRenderer;
}

// =========================
// STATE
// =========================

let nodes = [];
let velocity = [];

let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

let selected = null;
let isDragging = false;

// =========================
// CORE GRAVITY (THEORY NODE)
// =========================

export let core;

export function createCore() {
  const geo = new THREE.SphereGeometry(6, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff });

  core = new THREE.Mesh(geo, mat);
  scene.add(core);
}

// =========================
// ADD NODE (PDF / WIKI / HUMAN)
// =========================

export function addNode({ text, type = "pdf", position }) {

  const size =
    type === "human" ? 2.5 :
    type === "wiki" ? 1.5 :
    Math.random() * 1.2 + 0.5;

  const geo = new THREE.SphereGeometry(size, 10, 10);

  const color =
    type === "human" ? 0x00ffff :
    type === "wiki" ? 0xffff00 :
    0x8888ff;

  const mat = new THREE.MeshStandardMaterial({ color });

  const mesh = new THREE.Mesh(geo, mat);

  mesh.position.set(
    position?.x ?? (Math.random() - 0.5) * 40,
    position?.y ?? (Math.random() - 0.5) * 40,
    position?.z ?? (Math.random() - 0.5) * 40
  );

  mesh.userData = {
    text,
    type
  };

  scene.add(mesh);

  nodes.push(mesh);
  velocity.push(new THREE.Vector3());

  return mesh;
}

// =========================
// SOCIAL GRAVITY ENGINE
// =========================

function applyForces(i) {
  const n = nodes[i];

  // CORE attraction (theory)
  const toCore = new THREE.Vector3()
    .subVectors(core.position, n.position)
    .multiplyScalar(0.015);

  // node expansion force (breathing system)
  const expand = n.position.clone().normalize().multiplyScalar(0.01);

  // human interaction amplification
  let interaction = new THREE.Vector3();

  nodes.forEach((other, j) => {
    if (i === j) return;

    const dist = n.position.distanceTo(other.position);

    if (dist < 12) {
      const force = new THREE.Vector3()
        .subVectors(n.position, other.position)
        .normalize()
        .multiplyScalar(0.002);

      interaction.add(force);
    }
  });

  velocity[i]
    .add(toCore)
    .add(expand)
    .add(interaction);

  velocity[i].multiplyScalar(0.92);

  n.position.add(velocity[i]);
}

// =========================
// ANIMATION LOOP
// =========================

export function animate() {

  requestAnimationFrame(animate);

  if (!core) return;

  core.rotation.y += 0.002;

  nodes.forEach((n, i) => {

    // drag override
    if (selected === n && isDragging) {
      n.position.x = mouse.x * 40;
      n.position.y = mouse.y * 40;
      velocity[i].set(0, 0, 0);
      return;
    }

    applyForces(i);

    // breathing / semantic intensity
    n.scale.setScalar(
      1 + Math.sin(Date.now() * 0.002 + i) * 0.2
    );
  });

  renderer.render(scene, camera);
}

// =========================
// MOUSE INTERACTION SYSTEM
// =========================

export function enableMouseInteraction(domElement) {

  domElement.addEventListener("mousemove", (event) => {

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(nodes);

    if (intersects.length > 0 && !isDragging) {
      document.body.style.cursor = "pointer";
    } else {
      document.body.style.cursor = "default";
    }

    if (selected && isDragging) {
      selected.position.x = mouse.x * 40;
      selected.position.y = mouse.y * 40;
    }
  });

  domElement.addEventListener("mousedown", () => {

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(nodes);

    if (intersects.length > 0) {
      selected = intersects[0].object;
      isDragging = true;
    }
  });

  domElement.addEventListener("mouseup", () => {
    selected = null;
    isDragging = false;
  });
}

// =========================
// SAFE RESET / REBUILD
// =========================

export function clearNodes() {
  nodes.forEach(n => scene.remove(n));
  nodes = [];
  velocity = [];
}
