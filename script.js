import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

// =========================
// CORE STATE (NEVER NULL)
// =========================

const state = {
  nodes: [],
  velocity: [],
  ready: false,
  errors: [],
};

// =========================
// THREE CORE (must be injected from index.html)
// =========================

let scene, camera, renderer, core;

// =========================
// INIT
// =========================

export function init(s, c, r) {
  scene = s;
  camera = c;
  renderer = r;

  createCore();
  animate();

  bootstrap(); // ALWAYS RUN
}

// =========================
// CORE OBJECT (gravity anchor)
// =========================

function createCore() {
  const geo = new THREE.SphereGeometry(6, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff });

  core = new THREE.Mesh(geo, mat);
  scene.add(core);
}

// =========================
// SAFE PDF LOADER (NO FAILURE)
// =========================

async function safeLoadPDF(fileName) {
  try {
    const path = getBasePath() + "pdf/" + fileName;

    const pdf = await pdfjsLib.getDocument(path).promise;

    let chunks = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        const text = content.items.map(i => i.str).join(" ");

        chunks.push(
          ...text.split(".").map(s => s.trim()).filter(Boolean)
        );

      } catch (e) {
        state.errors.push(`page_fail:${fileName}:${i}`);
      }
    }

    return chunks;

  } catch (e) {
    state.errors.push(`pdf_fail:${fileName}`);

    // FALLBACK: NEVER EMPTY
    return syntheticChunks(fileName);
  }
}

// =========================
// FALLBACK GENERATOR (CRITICAL)
// =========================

function syntheticChunks(seed) {
  return [
    `fragment from ${seed}`,
    `semantic field unstable`,
    `reconstruction required`,
    `social sculpture active`,
    `actional space emerging`
  ];
}

// =========================
// BASE PATH FIX
// =========================

function getBasePath() {
  const path = window.location.pathname;
  return path.substring(0, path.lastIndexOf("/") + 1);
}

// =========================
// BOOTSTRAP (ZERO FAILURE GUARANTEE)
// =========================

async function bootstrap() {

  console.log("[BOOT] zero-failure pipeline start");

  const files = ["handlungsraum.pdf", "kunstraum.pdf"];

  // PARALLEL SAFE LOAD
  const results = await Promise.allSettled(
    files.map(f => safeLoadPDF(f))
  );

  let allChunks = [];

  results.forEach(r => {
    if (r.status === "fulfilled") {
      allChunks.push(...r.value);
    }
  });

  // ABSOLUTE FALLBACK
  if (allChunks.length === 0) {
    console.warn("[FALLBACK] system generated empty field");

    allChunks = syntheticChunks("system_root");
  }

  buildField(allChunks);

  state.ready = true;

  console.log("[BOOT] ready with nodes:", state.nodes.length);
}

// =========================
// FIELD BUILDER (ALWAYS PRODUCES NODES)
// =========================

function buildField(chunks) {

  clearScene();

  chunks.forEach((txt, i) => {

    const geo = new THREE.SphereGeometry(1 + Math.random(), 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(`hsl(${Math.random()*360},100%,60%)`)
    });

    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.set(
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 60
    );

    mesh.userData = {
      text: txt,
      weight: txt.includes("actional") ? 2 : 1
    };

    scene.add(mesh);

    state.nodes.push(mesh);
    state.velocity.push(new THREE.Vector3());
  });
}

// =========================
// ZERO-FAILURE RENDER LOOP
// =========================

function animate() {

  requestAnimationFrame(animate);

  if (!scene || !core) return;

  core.rotation.y += 0.002;

  state.nodes.forEach((n, i) => {

    if (!n) return;

    const dir = new THREE.Vector3()
      .subVectors(core.position, n.position)
      .multiplyScalar(0.01);

    state.velocity[i].add(dir);
    state.velocity[i].multiplyScalar(0.92);

    n.position.add(state.velocity[i]);

    n.scale.setScalar(
      1 + Math.sin(Date.now() * 0.002 + i) * 0.2
    );
  });

  renderer.render(scene, camera);
}

// =========================
// SAFE CLEANUP
// =========================

function clearScene() {
  state.nodes.forEach(n => scene.remove(n));

  state.nodes = [];
  state.velocity = [];
}

// =========================
// PUBLIC DEBUG API
// =========================

export function getState() {
  return state;
}

