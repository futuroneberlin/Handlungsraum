import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  createConcreteTexture,
  createDustTexture,
  createMetalStripeTexture,
  createWordTexture,
  createNoiseTexture
} from './textures/procedural.js';
import { applySemanticSurface, updateSemanticSurface } from './shaders/semanticSurface.js';
import { createAmbientEngine } from './audio/ambient.js';

const THEORY_TEXT = String.raw`
HANDLUNGSRAUM

Der Handlungsraum funktioniert als kontinuierlicher Aufbauprozess.

Texte, Begriffe und theoretische Fragmente werden nicht als Information dargestellt, sondern als räumliches Material behandelt.

Sie treten in Relation, bewegen sich durch den Raum und lagern sich schrittweise zu semantischen Verdichtungen ab.

Der Raum besitzt keinen finalen Zustand.

Er entsteht fortlaufend durch zeitliche Anordnung, Bewegung, Leere und Relation.

KRAFT
RESONANZ
HANDLUNG
TRANSFORMATION
WIDERSTAND
NICHTSTANDARDISIERUNG
SOZIALE PLASTIK
INTERAKTION
ONTOLOGISCHE INTEGRITÄT
VERDICHTUNG
LEERE
ZEIT
KÖRPER
MATERIAL
AUFBAU
RELATION
BEWEGUNG
`;

const CATEGORY_ORDER = [
  'action',
  'transformation',
  'resonance',
  'force',
  'resistance',
  'interaction',
  'relation',
  'body',
  'nonstandardization',
  'ontology',
  'time',
  'material',
  'void',
  'social'
];

const CATEGORY_PATTERNS = {
  action: ['HANDLUNG', 'AUFBAU', 'PRAXIS', 'PROZESS', 'PROZESSE', 'TÄTIGKEIT', 'TAETIGKEIT'],
  transformation: ['TRANSFORMATION', 'VERDICHTUNG', 'BECOMING', 'WANDLUNG', 'UMFORMUNG'],
  resonance: ['RESONANZ', 'SCHWINGUNG', 'BRÜCKE', 'BRUECKE', 'FLUID'],
  force: ['KRAFT', 'DRUCK', 'ENERGIE', 'GEWICHT', 'MASS', 'DICHTE'],
  resistance: ['WIDERSTAND', 'BRECHUNG', 'FRAGMENT', 'FRAGMENTE', 'REIBUNG'],
  interaction: ['INTERAKTION', 'TEILHABE', 'PARTIZIPATION', 'BEZIEHUNG'],
  relation: ['RELATION', 'VERBINDUNG', 'NÄHE', 'NAEHE', 'DIALOG'],
  body: ['KÖRPER', 'KOERPER', 'LEIB', 'KORPUS'],
  nonstandardization: ['NICHTSTANDARDISIERUNG', 'UNSTANDARDISIERT', 'ABWEICHUNG'],
  ontology: ['ONTOLOGISCHE INTEGRITÄT', 'ONTOLOGIE', 'INTEGRITÄT', 'INTEGRITAET'],
  time: ['ZEIT', 'DAUER', 'TAKT', 'TEMPORAL', 'FORTLAUFEND'],
  material: ['MATERIAL', 'MATERIE', 'MATERIELL', 'MASSIV'],
  void: ['LEERE', 'LEERSTELLE', 'VOID', 'ABSTAND'],
  social: ['SOZIALE PLASTIK', 'SOCIAL SCULPTURE', 'BEUYS', 'SOZIAL']
};

const CATEGORY_PAIRS = {
  transformation: { action: 0.35, interaction: 0.25, relation: 0.18 },
  resonance: { relation: 0.34, social: 0.22, interaction: 0.2 },
  force: { material: 0.35, body: 0.25 },
  resistance: { transformation: 0.2, force: 0.16 },
  interaction: { action: 0.2, relation: 0.22, social: 0.26 },
  relation: { social: 0.15, body: 0.12 },
  body: { material: 0.22, force: 0.12 },
  nonstandardization: { resistance: 0.22, transformation: 0.18 },
  ontology: { force: 0.08, relation: 0.18, void: 0.1 },
  time: { transformation: 0.22, action: 0.12 },
  material: { force: 0.2, body: 0.12 },
  void: { relation: 0.14, transformation: 0.1 },
  social: { interaction: 0.28, resonance: 0.18 }
};

const CATEGORY_COLORS = {
  action: new THREE.Color('#c18d4e'),
  transformation: new THREE.Color('#d9aa63'),
  resonance: new THREE.Color('#f0d3a5'),
  force: new THREE.Color('#8a6b42'),
  resistance: new THREE.Color('#75634c'),
  interaction: new THREE.Color('#9b8a72'),
  relation: new THREE.Color('#b6a794'),
  body: new THREE.Color('#8d735d'),
  nonstandardization: new THREE.Color('#6d5b46'),
  ontology: new THREE.Color('#ded0be'),
  time: new THREE.Color('#9c8d7c'),
  material: new THREE.Color('#82694c'),
  void: new THREE.Color('#4b463f'),
  social: new THREE.Color('#c8b087')
};

const CATEGORY_INDEX = Object.fromEntries(CATEGORY_ORDER.map((category, index) => [category, index]));

const sceneTokens = THEORY_TEXT.split(/\s+/).map((token) => token.trim()).filter(Boolean);
const theoryFragments = THEORY_TEXT.split(/\n+/).map((line) => line.trim()).filter(Boolean);
const vocabulary = Array.from(new Set([...sceneTokens, ...theoryFragments]));

function normalizeText(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÄÖÜß\s-]/gi, '')
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ß/g, 'SS');
}

function buildSignature(value) {
  const normalized = normalizeText(value);
  const signature = new Array(CATEGORY_ORDER.length).fill(0);

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    let score = 0;
    for (const pattern of patterns) {
      if (normalized.includes(normalizeText(pattern))) {
        score += pattern.includes(' ') ? 1.4 : 1;
      }
    }
    signature[CATEGORY_INDEX[category]] = score;
  }

  const accent = signature.reduce((sum, value) => sum + value, 0);
  const primaryIndex = signature.indexOf(Math.max(...signature));
  const category = CATEGORY_ORDER[primaryIndex] || 'material';

  return {
    signature,
    category,
    energy: THREE.MathUtils.clamp(0.18 + accent * 0.16, 0.18, 1.9),
    density: THREE.MathUtils.clamp(0.2 + signature[CATEGORY_INDEX.force] * 0.4 + signature[CATEGORY_INDEX.material] * 0.22, 0.2, 1.7),
    turbulence: THREE.MathUtils.clamp(signature[CATEGORY_INDEX.interaction] * 0.3 + signature[CATEGORY_INDEX.resonance] * 0.25, 0, 1.2),
    verticality: THREE.MathUtils.clamp(signature[CATEGORY_INDEX.ontology] * 0.3 + signature[CATEGORY_INDEX.action] * 0.2, 0, 1.1)
  };
}

const HANDLUNGSRAUM_VECTOR = buildSignature('HANDLUNGSRAUM');

function semanticSimilarity(a, b) {
  const left = a.signature;
  const right = b.signature;
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftLength += left[index] * left[index];
    rightLength += right[index] * right[index];
  }

  const cosine = dot / Math.max(Math.sqrt(leftLength) * Math.sqrt(rightLength), 0.0001);
  const pairBoost = CATEGORY_PAIRS[a.category]?.[b.category] || CATEGORY_PAIRS[b.category]?.[a.category] || 0;
  return cosine + pairBoost;
}

function createDom() {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div class="vignette"></div>
      <div class="grain"></div>
      <div class="footer-hint">fullscreen / autoplay / idle mode / spatial sound</div>
      <aside class="hud" id="hud">
        <h1 class="hud__title">HANDLUNGSRAUM — Aesthetic Practice Engine</h1>
        <div class="hud__line"><span class="status-chip">INSTALLATION MODE</span><strong id="installState">booting</strong></div>
        <div class="hud__buttons">
          <button id="fullscreenButton" type="button">Fullscreen</button>
          <button id="audioButton" type="button">Sound</button>
          <button id="pauseButton" type="button">Pause</button>
          <button id="resetButton" type="button">Reset</button>
        </div>
        <label class="hud__label" for="speedSlider"><span>Process speed</span><span id="speedLabel">1.00x</span></label>
        <input id="speedSlider" type="range" min="0.5" max="2.2" step="0.05" value="1" />
        <label class="hud__label" for="densitySlider"><span>Word density</span><span id="densityLabel">24/s</span></label>
        <input id="densitySlider" type="range" min="8" max="42" step="1" value="24" />
        <label class="hud__label" for="fogSlider"><span>Fog depth</span><span id="fogLabel">1.0</span></label>
        <input id="fogSlider" type="range" min="0.75" max="1.45" step="0.01" value="1" />
        <div class="hud__line"><span>Words</span><strong id="wordCount">0</strong></div>
        <div class="hud__line"><span>Seeds</span><strong id="seedCount">0</strong></div>
        <div class="hud__line"><span>Fragments</span><strong id="fragmentCount">0</strong></div>
        <div class="hud__line"><span>Runtime</span><strong id="runtimeLabel">00:00</strong></div>
        <div class="hud__note">Mouse destabilizes the field. The work remains in motion.</div>
      </aside>
    `
  );
}

createDom();

const bootElement = document.getElementById('boot');
const installStateElement = document.getElementById('installState');
const fullscreenButton = document.getElementById('fullscreenButton');
const audioButton = document.getElementById('audioButton');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');
const speedSlider = document.getElementById('speedSlider');
const densitySlider = document.getElementById('densitySlider');
const fogSlider = document.getElementById('fogSlider');
const speedLabel = document.getElementById('speedLabel');
const densityLabel = document.getElementById('densityLabel');
const fogLabel = document.getElementById('fogLabel');
const wordCountElement = document.getElementById('wordCount');
const seedCountElement = document.getElementById('seedCount');
const fragmentCountElement = document.getElementById('fragmentCount');
const runtimeLabel = document.getElementById('runtimeLabel');
const hudElement = document.getElementById('hud');

const state = {
  paused: false,
  processSpeed: Number(speedSlider.value),
  density: Number(densitySlider.value),
  fogDepth: Number(fogSlider.value),
  runtime: 0,
  interactionStrength: 0,
  audioArmed: false,
  fullscreen: false,
  idleSeconds: 0
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x080808, 0.0044);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2400);
camera.position.set(0, 14, 220);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x4b4945, 1.4);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffe0ab, 1.95);
keyLight.position.set(130, 210, 110);
keyLight.castShadow = true;
keyLight.shadow.camera.left = -230;
keyLight.shadow.camera.right = 230;
keyLight.shadow.camera.top = 230;
keyLight.shadow.camera.bottom = -230;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x7a6d68, 18, 480, 2);
fillLight.position.set(-80, 30, 100);
scene.add(fillLight);

const furnaceLight = new THREE.PointLight(0xc46c2b, 26, 320, 2.2);
furnaceLight.position.set(40, 25, 20);
scene.add(furnaceLight);

const coldLight = new THREE.PointLight(0x334466, 12, 360, 2);
coldLight.position.set(-120, 12, -160);
scene.add(coldLight);

const proceduralNoise = createNoiseTexture();
const concreteTexture = createConcreteTexture();
const dustTexture = createDustTexture();
const metalStripeTexture = createMetalStripeTexture();

const environmentGroup = new THREE.Group();
scene.add(environmentGroup);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000, 160, 160),
  new THREE.MeshStandardMaterial({
    map: concreteTexture,
    roughness: 0.96,
    metalness: 0.04,
    color: 0x6f695f
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -140;
floor.receiveShadow = true;
environmentGroup.add(floor);

const dustPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2600, 2600, 1, 1),
  new THREE.MeshBasicMaterial({
    map: dustTexture,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.NormalBlending
  })
);
dustPlane.rotation.x = -Math.PI / 2;
dustPlane.position.y = -138.5;
environmentGroup.add(dustPlane);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(2600, 1100, 1, 1),
  new THREE.MeshStandardMaterial({
    map: proceduralNoise,
    color: 0x111111,
    roughness: 1,
    metalness: 0,
    fog: true
  })
);
backWall.position.set(0, 220, -920);
environmentGroup.add(backWall);

function addBrutalistTower(x, z, height, width, depth, color) {
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.05 })
  );
  tower.position.set(x, -140 + height / 2, z);
  tower.castShadow = true;
  environmentGroup.add(tower);
  return tower;
}

for (let index = 0; index < 12; index += 1) {
  const x = -420 + index * 78 + (Math.random() - 0.5) * 12;
  const height = 130 + Math.random() * 320;
  const depth = 80 + Math.random() * 210;
  const width = 42 + Math.random() * 68;
  addBrutalistTower(x, -760 + Math.random() * 220, height, width, depth, 0x1a1a1a + Math.floor(Math.random() * 0x101010));
}

const scaffoldGroup = new THREE.Group();
scene.add(scaffoldGroup);

function addBeam(x, y, z, sx, sy, sz, color = 0x35383c) {
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.22 })
  );
  beam.position.set(x, y, z);
  beam.castShadow = true;
  scaffoldGroup.add(beam);
  return beam;
}

for (let column = 0; column < 7; column += 1) {
  const x = -190 + column * 62;
  addBeam(x, -24, -120, 3, 180, 3, 0x3c3f43);
  addBeam(x, 64, -120, 3, 3, 160, 0x54585d);
  addBeam(x + 18, 14, -90, 2, 118, 2, 0x47494d);
}

const crane = new THREE.Group();
crane.position.set(250, -130, -300);
scene.add(crane);

addBeam(0, 180, 0, 8, 360, 8, 0x2b2d30);
addBeam(120, 360, -18, 240, 8, 8, 0x2b2d30);
addBeam(220, 400, -18, 70, 6, 6, 0x2b2d30);
addBeam(60, 252, -12, 6, 6, 300, 0x2b2d30);

const craneArm = new THREE.Mesh(
  new THREE.BoxGeometry(310, 8, 8),
  new THREE.MeshStandardMaterial({ color: 0x27292c, roughness: 0.85, metalness: 0.12 })
);
craneArm.position.set(160, 358, -14);
craneArm.castShadow = true;
crane.add(craneArm);

const craneCounter = new THREE.Mesh(
  new THREE.BoxGeometry(74, 14, 14),
  new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9, metalness: 0.08 })
);
craneCounter.position.set(-26, 358, -14);
craneCounter.castShadow = true;
crane.add(craneCounter);

const craneHook = new THREE.Mesh(
  new THREE.BoxGeometry(8, 68, 8),
  new THREE.MeshStandardMaterial({ color: 0x2a241d, roughness: 0.74, metalness: 0.3 })
);
craneHook.position.set(238, 316, -14);
craneHook.castShadow = true;
crane.add(craneHook);

const constructionBar = new THREE.Mesh(
  new THREE.BoxGeometry(340, 6, 3),
  new THREE.MeshStandardMaterial({ map: metalStripeTexture, roughness: 0.68, metalness: 0.2 })
);
constructionBar.position.set(60, -80, 110);
constructionBar.rotation.y = -0.18;
constructionBar.castShadow = true;
scene.add(constructionBar);

const coreLight = new THREE.PointLight(0xffbf74, 22, 220, 2.2);
coreLight.position.set(20, 18, 10);
scene.add(coreLight);

const shadowLight = new THREE.PointLight(0x253246, 10, 360, 2.1);
shadowLight.position.set(-180, 40, 80);
scene.add(shadowLight);

const wordGeometry = new THREE.PlaneGeometry(38, 11, 1, 1);
const shardGeometry = new THREE.PlaneGeometry(10, 4, 1, 1);

const wordPool = [];
const fragments = [];

function createWordMaterial(token, semantic) {
  const texture = createWordTexture(token, CATEGORY_COLORS[semantic.category]?.getStyle() || '#f4d08f');
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    opacity: 0.98,
    roughness: 0.7,
    metalness: 0.12,
    emissive: new THREE.Color(0x181105),
    emissiveIntensity: 0.4,
    depthWrite: false
  });
  material.map.colorSpace = THREE.SRGBColorSpace;
  return { material, texture };
}

function createWordEntity(token, type = 'token') {
  const semantic = buildSignature(token);
  const wordVisual = createWordMaterial(token, semantic);
  const mesh = new THREE.Mesh(wordGeometry.clone(), wordVisual.material);
  const smear = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 12, 1, 1),
    new THREE.MeshBasicMaterial({
      map: wordVisual.texture,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
  );

  const group = new THREE.Group();
  mesh.position.set(0, 0, 0);
  smear.position.set(-1.2, 0, -0.1);
  group.add(smear);
  group.add(mesh);

  group.position.set(-320 - Math.random() * 90, 110 - Math.random() * 280, (Math.random() - 0.5) * 160);
  group.rotation.y = -0.9 + Math.random() * 0.3;
  group.rotation.z = (Math.random() - 0.5) * 0.12;

  const speedBase = semantic.energy * 24 + 12;
  const entity = {
    token,
    type,
    semantic,
    group,
    mesh,
    smear,
    texture: wordVisual.texture,
    age: 0,
    life: 10 + semantic.energy * 9,
    absorbed: false,
    memory: 0,
    drift: new THREE.Vector3(
      1.9 + Math.random() * 1.9,
      (Math.random() - 0.5) * 0.25,
      (Math.random() - 0.5) * 0.35
    ),
    velocity: speedBase,
    currentOpacity: 1,
    target: new THREE.Vector3(0, 8, 0),
    pathNoise: Math.random() * Math.PI * 2,
    originalScale: 1,
    orbitRadius: 25 + semantic.turbulence * 18,
    trailPhase: Math.random() * Math.PI * 2
  };

  group.userData = entity;
  group.userData.isWord = true;
  scene.add(group);
  wordPool.push(entity);
  return entity;
}

function createShardEntity(sourceEntity, index) {
  const shard = new THREE.Mesh(
    shardGeometry.clone(),
    new THREE.MeshStandardMaterial({
      color: 0x3c3428,
      roughness: 0.92,
      metalness: 0.04,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    })
  );
  const offset = new THREE.Vector3(
    (Math.random() - 0.5) * 12,
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 8
  );
  shard.position.copy(sourceEntity.group.position).add(offset);
  shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  shard.scale.setScalar(0.7 + Math.random() * 0.9);

  const fragment = {
    mesh: shard,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 3.2,
      1.2 + Math.random() * 2.2,
      (Math.random() - 0.5) * 2.2
    ),
    spin: new THREE.Vector3(
      (Math.random() - 0.5) * 2.5,
      (Math.random() - 0.5) * 2.5,
      (Math.random() - 0.5) * 2.5
    ),
    age: 0,
    life: 2.2 + index * 0.18
  };

  scene.add(shard);
  fragments.push(fragment);
}

const semanticSeeds = [];

function injectSemanticSeed(entity, position) {
  const vector = entity.semantic.signature;
  semanticSeeds.push({
    position: position.clone(),
    signature: vector.slice(),
    category: entity.semantic.category,
    energy: entity.semantic.energy,
    density: entity.semantic.density,
    turbulence: entity.semantic.turbulence,
    verticality: entity.semantic.verticality,
    decay: 1,
    age: 0,
    drift: new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.18,
      (Math.random() - 0.5) * 0.4
    )
  });
}

const sculptureGroup = new THREE.Group();
scene.add(sculptureGroup);

const sculptureMaterial = applySemanticSurface(
  new THREE.MeshStandardMaterial({
    color: 0x68615b,
    roughness: 0.86,
    metalness: 0.08,
    emissive: 0x140d08,
    emissiveIntensity: 0.6,
    vertexColors: true
  })
);

const cellGeometry = new THREE.BoxGeometry(3.4, 3.4, 3.4);
const sculptureCells = [];
const sculptDummy = new THREE.Object3D();

function createCellGrid() {
  const gridX = 12;
  const gridY = 8;
  const gridZ = 12;
  const radiusX = 28;
  const radiusY = 22;
  const radiusZ = 28;

  for (let z = 0; z < gridZ; z += 1) {
    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const nx = x / (gridX - 1) - 0.5;
        const ny = y / (gridY - 1) - 0.5;
        const nz = z / (gridZ - 1) - 0.5;
        const base = new THREE.Vector3(nx * radiusX * 2, ny * radiusY * 2 + 8, nz * radiusZ * 2);
        const radial = Math.sqrt(nx * nx + nz * nz);
        const bias = THREE.MathUtils.clamp(1.28 - radial * 1.65 + ny * 0.62, -0.6, 1.6);
        sculptureCells.push({
          base,
          active: 0,
          memory: 0,
          weight: bias,
          color: new THREE.Color(0x6c6459),
          jitter: Math.random() * Math.PI * 2,
          categoryVector: buildSignature([x, y, z].join('-'))
        });
      }
    }
  }
}

createCellGrid();

const moduleMesh = new THREE.InstancedMesh(cellGeometry, sculptureMaterial, sculptureCells.length);
moduleMesh.castShadow = true;
moduleMesh.receiveShadow = true;
moduleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
sculptureGroup.add(moduleMesh);

const plateGeometry = new THREE.BoxGeometry(6.8, 1.6, 2.4);
const plateCells = sculptureCells.map((cell, index) => ({
  base: cell.base.clone().add(new THREE.Vector3((index % 3) - 1, 0, ((index * 2) % 3) - 1)),
  memory: 0,
  active: 0,
  jitter: Math.random() * Math.PI * 2
}));
const plateMaterial = applySemanticSurface(
  new THREE.MeshStandardMaterial({
    color: 0x5a5145,
    roughness: 0.92,
    metalness: 0.06,
    emissive: 0x130e08,
    emissiveIntensity: 0.48
  })
);
const plateMesh = new THREE.InstancedMesh(plateGeometry, plateMaterial, plateCells.length);
plateMesh.castShadow = true;
plateMesh.receiveShadow = true;
plateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
sculptureGroup.add(plateMesh);

const sculptureCenter = new THREE.Vector3(0, 10, 0);
const mousePointer = new THREE.Vector2(0, 0);
const mouseWorld = new THREE.Vector3();

const audioEngine = createAmbientEngine();

function spawnInitialWords() {
  for (let index = 0; index < state.density; index += 1) {
    const token = vocabulary[index % vocabulary.length];
    createWordEntity(token, index < theoryFragments.length ? 'fragment' : 'concept');
  }
}

spawnInitialWords();

function spawnWordFromStream() {
  const randomFragment = theoryFragments[Math.floor(Math.random() * theoryFragments.length)] || vocabulary[Math.floor(Math.random() * vocabulary.length)];
  const token = Math.random() > 0.54 ? randomFragment : vocabulary[Math.floor(Math.random() * vocabulary.length)];
  return createWordEntity(token, token.includes(' ') ? 'fragment' : 'concept');
}

function repositionWord(entity) {
  entity.group.position.set(
    -320 - Math.random() * 100,
    130 - Math.random() * 290,
    (Math.random() - 0.5) * 180
  );
  entity.age = 0;
  entity.absorbed = false;
  entity.currentOpacity = 1;
}

function updateWordEntity(entity, dt, time) {
  const toCore = sculptureCenter.clone().sub(entity.group.position);
  const distanceToCore = toCore.length();
  const directionToCore = toCore.normalize();
  const semanticPull = semanticSimilarity(entity.semantic, HANDLUNGSRAUM_VECTOR) * 0.28;
  const turbulence = entity.semantic.turbulence;

  entity.age += dt;
  entity.memory = Math.max(0, entity.memory - dt * 0.14);

  const resistance = entity.semantic.category === 'resistance' ? 1.18 : 1.0;
  const verticalLift = entity.semantic.verticality * 0.14;

  entity.group.position.x += entity.drift.x * state.processSpeed * dt * 26;
  entity.group.position.y += entity.drift.y * state.processSpeed * dt * 26 + Math.sin(time * 1.7 + entity.pathNoise) * 0.03;
  entity.group.position.z += entity.drift.z * state.processSpeed * dt * 16;

  entity.group.position.addScaledVector(directionToCore, semanticPull * 14 * dt * resistance);
  entity.group.position.x += Math.sin(time * 2.3 + entity.pathNoise) * turbulence * dt * 7;
  entity.group.position.y += Math.cos(time * 1.8 + entity.pathNoise) * dt * 1.4 * verticalLift;
  entity.group.position.z += Math.sin(time * 2.9 + entity.pathNoise * 0.6) * dt * 2.8 * entity.semantic.density;

  const fieldDisturbance = mouseWorld.distanceTo(entity.group.position);
  if (fieldDisturbance < 130) {
    const push = entity.group.position.clone().sub(mouseWorld).normalize().multiplyScalar((130 - fieldDisturbance) * 0.0022);
    entity.group.position.add(push);
  }

  const smearScale = 1 + Math.sin(time * 9 + entity.trailPhase) * 0.08;
  entity.mesh.scale.set(1 + entity.semantic.energy * 0.04, smearScale, 1);
  entity.smear.scale.set(1.08, 1.1 + turbulence * 0.35, 1);

  entity.group.lookAt(camera.position.x * 0.85, camera.position.y * 0.95, camera.position.z);

  const fadeIn = THREE.MathUtils.clamp(entity.age * 1.8, 0, 1);
  const fadeOut = THREE.MathUtils.clamp((entity.life - entity.age) * 0.55, 0, 1);
  entity.currentOpacity = fadeIn * fadeOut;
  entity.mesh.material.opacity = 0.22 + entity.currentOpacity * 0.78;
  entity.smear.material.opacity = 0.04 + entity.currentOpacity * 0.18;

  if (!entity.absorbed && (distanceToCore < 24 || entity.group.position.x > -18 || entity.age > entity.life * 0.78)) {
    absorbWord(entity);
  }

  if (entity.group.position.y < -190 || entity.group.position.x > 260 || entity.age > entity.life) {
    repositionWord(entity);
  }
}

function absorbWord(entity) {
  if (entity.absorbed) return;
  entity.absorbed = true;
  entity.memory = 1;

  const seedPosition = entity.group.position.clone().add(new THREE.Vector3(0, entity.semantic.verticality * 4, 0));
  injectSemanticSeed(entity, seedPosition);
  audioEngine.triggerWord(entity.semantic);

  for (let index = 0; index < 4; index += 1) {
    createShardEntity(entity, index);
  }

  entity.mesh.material.opacity = 0.4;
  entity.smear.material.opacity = 0.08;
  entity.group.position.x -= 8;
}

function updateFragments(dt, time) {
  for (let index = fragments.length - 1; index >= 0; index -= 1) {
    const fragment = fragments[index];
    fragment.age += dt;
    fragment.mesh.position.addScaledVector(fragment.velocity, dt * 18);
    fragment.mesh.position.y += Math.sin(time * 6 + index) * dt * 2.4;
    fragment.mesh.rotation.x += fragment.spin.x * dt;
    fragment.mesh.rotation.y += fragment.spin.y * dt;
    fragment.mesh.rotation.z += fragment.spin.z * dt;
    fragment.mesh.material.opacity = THREE.MathUtils.clamp(1 - fragment.age / fragment.life, 0, 1) * 0.72;

    if (fragment.age >= fragment.life) {
      scene.remove(fragment.mesh);
      fragment.mesh.geometry.dispose();
      fragment.mesh.material.dispose();
      fragments.splice(index, 1);
    }
  }
}

function applySemanticForces(time, dt) {
  for (let index = semanticSeeds.length - 1; index >= 0; index -= 1) {
    const seed = semanticSeeds[index];
    seed.age += dt;
    seed.decay -= dt * 0.035;
    seed.position.addScaledVector(seed.drift, dt * 10);
    seed.position.y += Math.sin(time * 0.9 + index) * dt * seed.verticality * 1.8;
    seed.position.x += Math.sin(time * 1.2 + index) * dt * seed.turbulence * 1.1;
    if (seed.decay <= 0.02) {
      semanticSeeds.splice(index, 1);
    }
  }

  const pointerInfluence = mouseWorld.clone().multiplyScalar(0.35);
  const activeThreshold = 0.84 + Math.sin(time * 0.32) * 0.07 - state.processSpeed * 0.02;

  for (let index = 0; index < sculptureCells.length; index += 1) {
    const cell = sculptureCells[index];
    const plateCell = plateCells[index];
    let field = cell.weight * 0.44;
    let turbulence = 0;

    for (let seedIndex = 0; seedIndex < semanticSeeds.length; seedIndex += 1) {
      const seed = semanticSeeds[seedIndex];
      const offset = cell.base.clone().sub(seed.position);
      const distance = Math.max(offset.length(), 0.001);
      const closeness = 1 / (1 + distance * 0.12);
      const semanticWeight = seed.energy * closeness;
      field += semanticWeight * (1 + seed.density * 0.3);
      turbulence += semanticWeight * seed.turbulence;
    }

    const pointerDistance = cell.base.distanceTo(pointerInfluence);
    field += 0.82 / (1 + pointerDistance * 0.05);
    field += 0.26 * Math.sin(time * 0.8 + cell.jitter + cell.base.y * 0.04);
    field += 0.22 * Math.sin(time * 0.2 + cell.base.x * 0.03 + cell.base.z * 0.02);

    const memoryTarget = field > activeThreshold ? 1 : 0;
    cell.memory = THREE.MathUtils.lerp(cell.memory, memoryTarget, dt * (field > activeThreshold ? 2.6 : 0.4));
    cell.active = THREE.MathUtils.clamp(field, 0, 2.2);

    const active = field > activeThreshold || cell.memory > 0.04;
    const scalar = active ? THREE.MathUtils.clamp(field * 0.92 + cell.memory * 0.46, 0.05, 2.1) : 0.001;
    const breath = 1 + Math.sin(time * 2.4 + cell.jitter) * 0.08;
    const scale = scalar * breath;
    const lift = cell.weight * 5.5 + turbulence * 1.8;
    const displacement = new THREE.Vector3(
      Math.sin(time * 0.6 + cell.base.z * 0.08 + cell.jitter) * (1.8 + turbulence * 0.8),
      Math.cos(time * 0.45 + cell.base.x * 0.05) * (1.4 + cell.memory * 2.2),
      Math.sin(time * 0.7 + cell.base.x * 0.04) * (1.8 + field * 0.6)
    );

    sculptDummy.position.copy(cell.base).add(displacement).add(pointerInfluence.clone().multiplyScalar(0.12));
    sculptDummy.rotation.set(
      Math.sin(time * 0.7 + index * 0.01) * 0.22,
      Math.sin(time * 0.3 + index * 0.02) * 0.38,
      Math.cos(time * 0.5 + index * 0.015) * 0.14
    );
    sculptDummy.scale.set(
      scale * (0.8 + cell.memory * 0.8),
      Math.max(0.08, scale * (0.78 + field * 0.22) + cell.memory * 0.14 + lift * 0.01),
      scale * (0.8 + turbulence * 0.1)
    );
    sculptDummy.updateMatrix();
    moduleMesh.setMatrixAt(index, sculptDummy.matrix);

    const color = CATEGORY_COLORS[semanticSeeds[0]?.category] || CATEGORY_COLORS.material;
    cell.color.copy(color).lerp(CATEGORY_COLORS.force, THREE.MathUtils.clamp(field * 0.32, 0, 1));
    moduleMesh.setColorAt(index, cell.color);

    const plateActive = active && (index % 3 === 0 || cell.memory > 0.25);
    plateCell.memory = THREE.MathUtils.lerp(plateCell.memory, plateActive ? 1 : 0, dt * 1.8);
    plateCell.active = field;
    if (plateActive) {
      sculptDummy.position.copy(plateCell.base).add(displacement.clone().multiplyScalar(0.65));
      sculptDummy.rotation.set(
        Math.sin(time * 0.55 + index * 0.02) * 0.18,
        Math.sin(time * 0.2 + index * 0.015) * 0.26,
        Math.cos(time * 0.4 + index * 0.01) * 0.12
      );
      sculptDummy.scale.set(
        1.1 + field * 0.55,
        Math.max(0.1, 0.38 + cell.memory * 0.62 + field * 0.25),
        0.75 + turbulence * 0.16
      );
    } else {
      sculptDummy.scale.set(0.001, 0.001, 0.001);
    }
    sculptDummy.updateMatrix();
    plateMesh.setMatrixAt(index, sculptDummy.matrix);
  }

  moduleMesh.instanceMatrix.needsUpdate = true;
  moduleMesh.instanceColor.needsUpdate = true;
  plateMesh.instanceMatrix.needsUpdate = true;

  updateSemanticSurface(sculptureMaterial, time, 0.24 + state.interactionStrength * 0.4, 0.18 + state.interactionStrength * 0.62, mouseWorld);
  updateSemanticSurface(plateMaterial, time * 0.8, 0.16 + state.interactionStrength * 0.34, 0.14 + state.interactionStrength * 0.42, mouseWorld);
}

function updateEnvironment(time, dt) {
  scaffoldGroup.rotation.y = Math.sin(time * 0.12) * 0.012;
  environmentGroup.rotation.y = Math.sin(time * 0.06) * 0.006;
  crane.rotation.y = Math.sin(time * 0.18) * 0.05;
  crane.position.y = Math.sin(time * 0.4) * 3;
  constructionBar.rotation.z = Math.sin(time * 0.3) * 0.03 - 0.18;
  dustPlane.position.y = -138.5 + Math.sin(time * 0.9) * 0.5;
  dustPlane.material.opacity = 0.06 + state.interactionStrength * 0.08;
  coreLight.intensity = 18 + state.interactionStrength * 16;
  keyLight.intensity = 1.7 + Math.sin(time * 0.4) * 0.22;
  furnaceLight.intensity = 18 + state.interactionStrength * 10;
  fillLight.intensity = 12 + Math.cos(time * 0.35) * 4;
  coldLight.intensity = 9 + Math.sin(time * 0.24) * 3;
  scene.fog.density = 0.0038 * state.fogDepth + state.interactionStrength * 0.0005;

  const dustCount = 90;
  if (!environmentGroup.userData.dustBoxes) {
    const dustBoxes = new THREE.Group();
    dustBoxes.name = 'dustBoxes';
    for (let index = 0; index < dustCount; index += 1) {
      const dustBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.6 + Math.random() * 0.8, 0.25 + Math.random() * 0.35, 0.6 + Math.random() * 0.8),
        new THREE.MeshStandardMaterial({ color: 0xb6a48a, transparent: true, opacity: 0.12, roughness: 1, metalness: 0 })
      );
      dustBox.position.set((Math.random() - 0.5) * 520, -128 + Math.random() * 180, (Math.random() - 0.5) * 340);
      dustBox.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dustBoxes.add(dustBox);
    }
    environmentGroup.userData.dustBoxes = dustBoxes;
    scene.add(dustBoxes);
  }

  environmentGroup.userData.dustBoxes.children.forEach((dustBox, index) => {
    dustBox.position.y += Math.sin(time * 1.7 + index) * dt * 1.2;
    if (dustBox.position.y > 60) {
      dustBox.position.y = -128 - Math.random() * 28;
    }
    dustBox.rotation.x += dt * 0.08;
    dustBox.rotation.y += dt * 0.05;
  });
}

function updateCamera(time, dt) {
  const target = new THREE.Vector3(
    Math.sin(time * 0.18) * 4 + mousePointer.x * 0.04,
    14 + Math.sin(time * 0.24) * 3 + mousePointer.y * 0.025,
    0
  );

  const driftX = Math.sin(time * 0.08) * 28 + mousePointer.x * 0.12;
  const driftY = 16 + Math.sin(time * 0.14) * 6 + mousePointer.y * 0.08;
  const driftZ = 220 + Math.cos(time * 0.16) * 24;

  if (state.paused) {
    camera.position.lerp(new THREE.Vector3(driftX, driftY, driftZ), 0.02);
  } else {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, driftX, 0.018);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, driftY, 0.018);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, driftZ, 0.014);
  }

  camera.lookAt(target);
}

function updateSemanticState(time, dt) {
  const activeSeeds = semanticSeeds.length;
  const activeWords = wordPool.length;
  state.interactionStrength = THREE.MathUtils.clamp((mousePointer.length() / 180) + activeSeeds * 0.008, 0, 1);
  audioEngine.setIntensity(state.interactionStrength, state.processSpeed * 0.5 + state.density / 70);

  if (!state.paused) {
    if (activeWords < state.density) {
      spawnWordFromStream();
    }
  }

  for (let index = 0; index < wordPool.length; index += 1) {
    updateWordEntity(wordPool[index], dt, time);
  }

  updateFragments(dt, time);
  applySemanticForces(time, dt);
  updateEnvironment(time, dt);
  updateSemanticSurface(sculptureMaterial, time, 0.2 + state.interactionStrength * 0.42, 0.18 + state.interactionStrength * 0.44, mouseWorld);
}

function updateLabels() {
  speedLabel.textContent = `${state.processSpeed.toFixed(2)}x`;
  densityLabel.textContent = `${state.density}/s`;
  fogLabel.textContent = state.fogDepth.toFixed(2);
  wordCountElement.textContent = `${wordPool.length}`;
  seedCountElement.textContent = `${semanticSeeds.length}`;
  fragmentCountElement.textContent = `${fragments.length}`;
  const minutes = String(Math.floor(state.runtime / 60)).padStart(2, '0');
  const seconds = String(Math.floor(state.runtime % 60)).padStart(2, '0');
  runtimeLabel.textContent = `${minutes}:${seconds}`;
  installStateElement.textContent = state.paused ? 'paused' : state.audioArmed ? 'live' : 'booting';
}

function resetInstallation() {
  semanticSeeds.splice(0, semanticSeeds.length);
  for (const fragment of fragments) {
    scene.remove(fragment.mesh);
    fragment.mesh.geometry.dispose();
    fragment.mesh.material.dispose();
  }
  fragments.splice(0, fragments.length);
  for (const word of wordPool) {
    scene.remove(word.group);
    word.mesh.geometry.dispose();
    word.mesh.material.dispose();
    word.smear.geometry.dispose();
    word.smear.material.dispose();
    word.texture.dispose();
  }
  wordPool.splice(0, wordPool.length);
  while (wordPool.length < state.density) {
    spawnWordFromStream();
  }
  state.runtime = 0;
}

function applyFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function setBootComplete() {
  bootElement.classList.add('is-hidden');
  hudElement.classList.add('is-minimal');
  setTimeout(() => {
    bootElement.remove();
    hudElement.classList.remove('is-minimal');
  }, 2200);
}

function ensureAudioStart() {
  if (state.audioArmed) return;
  audioEngine.start().then(() => {
    state.audioArmed = true;
    audioButton.textContent = 'Sound On';
  }).catch(() => {
    audioButton.textContent = 'Sound Blocked';
  });
}

fullscreenButton.addEventListener('click', applyFullScreen);
audioButton.addEventListener('click', ensureAudioStart);
pauseButton.addEventListener('click', () => {
  state.paused = !state.paused;
  pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
  if (!state.paused) ensureAudioStart();
});
resetButton.addEventListener('click', () => {
  resetInstallation();
});
speedSlider.addEventListener('input', () => {
  state.processSpeed = Number(speedSlider.value);
});
densitySlider.addEventListener('input', () => {
  state.density = Number(densitySlider.value);
  densityLabel.textContent = `${state.density}/s`;
  if (wordPool.length < state.density) {
    while (wordPool.length < state.density) {
      spawnWordFromStream();
    }
  }
});
fogSlider.addEventListener('input', () => {
  state.fogDepth = Number(fogSlider.value);
});

window.addEventListener('pointermove', (event) => {
  mousePointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
  mousePointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  mouseWorld.set(mousePointer.x * 120, -mousePointer.y * 70, mousePointer.x * 30);
  state.idleSeconds = 0;
});

window.addEventListener('pointerdown', () => {
  ensureAudioStart();
  state.idleSeconds = 0;
});

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === ' ') {
    event.preventDefault();
    pauseButton.click();
  }
  if (key === 'f') {
    applyFullScreen();
  }
  if (key === 'r') {
    resetButton.click();
  }
  if (key === 'a') {
    audioButton.click();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (!state.paused) {
    state.runtime += delta * state.processSpeed;
    state.idleSeconds += delta;

    if (state.idleSeconds > 2.5) {
      hudElement.classList.add('is-minimal');
    } else {
      hudElement.classList.remove('is-minimal');
    }

    if (state.idleSeconds > 8 && !state.audioArmed) {
      ensureAudioStart();
    }
  }

  updateSemanticState(time * state.processSpeed, delta * state.processSpeed);
  updateCamera(time * state.processSpeed, delta * state.processSpeed);
  updateLabels();
  renderer.render(scene, camera);
}

setTimeout(setBootComplete, 2600);
ensureAudioStart();
animate();