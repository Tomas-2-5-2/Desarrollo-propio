// Motor Gráfico 3D Ultra Realista: Control Intuitivo, Trazada Fina, Paisaje Alpino de Alta Gama y Vegetación Orgánica

const container = document.getElementById('webgl-container');
const btnFullscreen = document.getElementById('btn-fullscreen');

// Elementos de la interfaz (GPS y Modales)
const gpsRoute = document.getElementById('gps-route-name');
const gpsTarget = document.getElementById('gps-target');
const gpsDist = document.getElementById('gps-dist');
const gpsEta = document.getElementById('gps-eta');

const startModal = document.getElementById('start-modal');
const serviceModal = document.getElementById('service-modal');
const breakdownModal = document.getElementById('breakdown-modal');
const btnIgnite = document.getElementById('btn-ignite');
const btnRespawn = document.getElementById('btn-respawn');

// Estado de la Simulación y Dinámica de la Moto
const simState = {
  active: false,
  paused: false,
  
  // Transmisión y Motor
  gear: 1,
  rpm: 1200,
  idleRpm: 1200,
  maxRpm: 10000,
  redlineRpm: 8500,
  speed: 0, // km/h
  maxSpeed: 195,
  
  // Mecánica
  fuelLiters: 18.0,
  engineTemp: 80.0,
  tirePressure: 32.0,
  bikeHealth: 100,
  money: 180,
  
  // Control y Física de Moto Realista
  playerDistance: 0,  // Metros recorridos
  laneOffset: 1.6,    // -4.5 (izq) a +4.5 (der)
  steeringInput: 0,   // -1 (izq) a +1 (der)
  leanAngle: 0,       // Inclinación física de la moto
  pitchSuspension: 0, // Hundimiento de horquilla delantera
  headLookApex: 0,    // Mirada anticipatoria hacia la curva
  
  targetDistanceKm: 16.0,
  odometer: 0,
  onRumble: false,
  
  gearLimits: [0, 48, 80, 115, 145, 175, 205],
  gearMinSpeed: [0, 0, 20, 40, 65, 88, 110]
};

// ==========================================
// 1. TRAYECTORIA Y GEOMETRÍA DE LA RUTA 3D
// ==========================================

function getRoadPoint(dist) {
  // Curvas armoniosas tipo paso alpino
  const x = Math.sin(dist * 0.0065) * 26 + Math.cos(dist * 0.0028) * 14;
  const y = Math.sin(dist * 0.0045) * 2.5 + Math.cos(dist * 0.009) * 1.2 + 0.15;
  const z = -dist;
  return { x, y, z };
}

function getRoadOrientation(dist) {
  const p0 = getRoadPoint(dist);
  const p1 = getRoadPoint(dist + 2.0);

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = -(p1.z - p0.z); // Distancia positiva hacia adelante

  // Rumbo correcto en Three.js mirando hacia -Z:
  const yaw = -Math.atan2(dx, dz);
  const pitch = -Math.atan2(dy, dz);
  const roll = (dx / dz) * 0.40;

  return { x: p0.x, y: p0.y, z: p0.z, yaw, pitch, roll, curveRate: dx / dz };
}

// ==========================================
// 2. TEXTURAS PROCEDURALES PBR DE ALTA DEFINICIÓN
// ==========================================

function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Asfalto gris oscuro con textura de árido
  ctx.fillStyle = '#22252c';
  ctx.fillRect(0, 0, 1024, 1024);

  const imgData = ctx.getImageData(0, 0, 1024, 1024);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 24;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  // Huellas de neumático
  ctx.fillStyle = 'rgba(12, 14, 18, 0.45)';
  ctx.fillRect(200, 0, 210, 1024);
  ctx.fillRect(614, 0, 210, 1024);

  // Línea divisoria central amarilla discontinua
  ctx.fillStyle = '#f59e0b';
  for (let y = 30; y < 1024; y += 180) {
    ctx.fillRect(504, y, 16, 110);
  }

  // Líneas blancas continuas laterales
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(50, 0, 14, 1024);
  ctx.fillRect(960, 0, 14, 1024);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2d4d23';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() < 0.5 ? '#3b612e' : '#233d1b';
    ctx.fillRect(x, y, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 60);
  return texture;
}

function createSignTexture(text, isYellow) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isYellow ? '#f59e0b' : '#f8fafc';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 236, 236);

  ctx.fillStyle = '#09090b';
  ctx.font = '700 80px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

// ==========================================
// 3. ESCENA 3D, CÁMARA Y RENDERIZADOR
// ==========================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x60a5fa);
scene.fog = new THREE.FogExp2(0x93c5fd, 0.0016);

let width = window.innerWidth;
let height = window.innerHeight;

const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 3500);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

btnFullscreen.addEventListener('click', toggleFullscreen);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') toggleFullscreen();
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ==========================================
// 4. ILUMINACIÓN SOLAR CINEMATOGRÁFICA
// ==========================================

const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e3a1e, 0.95);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffaed, 1.6);
sunLight.position.set(250, 450, -350);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// ==========================================
// 5. PAISAJE NATURAL: PRADERA, CORDILLERA Y NUBES
// ==========================================

const groundMat = new THREE.MeshStandardMaterial({ map: createGrassTexture(), roughness: 0.9 });
const groundGeo = new THREE.PlaneGeometry(5000, 5000);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
scene.add(ground);

// Cordillera alpina
const mountainsGroup = new THREE.Group();
const mtnGeo = new THREE.ConeGeometry(140, 260, 7);
const mtnMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, flatShading: true });
const snowGeo = new THREE.ConeGeometry(50, 95, 7);
const snowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });

for (let i = 0; i < 30; i++) {
  const m = new THREE.Group();
  const rock = new THREE.Mesh(mtnGeo, mtnMat);
  rock.position.y = 130;
  m.add(rock);
  const snow = new THREE.Mesh(snowGeo, snowMat);
  snow.position.y = 212;
  m.add(snow);

  const ang = (i / 30) * Math.PI * 2;
  const rad = 1100 + Math.random() * 350;
  m.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
  m.scale.set(1.2 + Math.random() * 1.5, 1 + Math.random() * 1.4, 1.2 + Math.random() * 1.5);
  mountainsGroup.add(m);
}
scene.add(mountainsGroup);

// Nubes volumétricas 3D en el cielo
const cloudGroup = new THREE.Group();
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.85 });
for (let i = 0; i < 24; i++) {
  const c = new THREE.Group();
  for (let j = 0; j < 5; j++) {
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(25 + Math.random() * 20, 1), cloudMat);
    puff.position.set((j - 2) * 22, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 18);
    c.add(puff);
  }
  const dist = 600 + Math.random() * 600;
  const ang = Math.random() * Math.PI * 2;
  c.position.set(Math.cos(ang) * dist, 180 + Math.random() * 90, Math.sin(ang) * dist);
  cloudGroup.add(c);
}
scene.add(cloudGroup);

// ==========================================
// 6. CARRETERA CONTINUA EN CINTA 3D (SEAMLESS RIBBON)
// ==========================================

const RIBBON_POINTS = 140;
const POINT_STEP = 3.2;
const ROAD_WIDTH = 11.2;

const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, (RIBBON_POINTS - 1) * POINT_STEP, 1, RIBBON_POINTS - 1);
const asphaltMat = new THREE.MeshStandardMaterial({
  map: createAsphaltTexture(),
  roughness: 0.65,
  metalness: 0.15,
  side: THREE.DoubleSide
});
const roadMesh = new THREE.Mesh(roadGeo, asphaltMat);
scene.add(roadMesh);

const roadPosAttr = roadGeo.attributes.position;
roadPosAttr.setUsage(THREE.DynamicDrawUsage);

// Tachas reflectantes amarillas (Ojos de gato) en la línea central
const catEyesGroup = new THREE.Group();
const catEyeGeo = new THREE.BoxGeometry(0.18, 0.05, 0.18);
const catEyeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.8, emissive: 0xf59e0b, emissiveIntensity: 0.3 });
const catEyes = [];
for (let i = 0; i < 35; i++) {
  const ce = new THREE.Mesh(catEyeGeo, catEyeMat);
  catEyesGroup.add(ce);
  catEyes.push({ mesh: ce, distOffset: i * 8 });
}
scene.add(catEyesGroup);

// ==========================================
// 7. VEGETACIÓN REALISTA: PINOS, ÁRBOLES Y FLORES
// ==========================================

const natureGroup = new THREE.Group();

// Creador de pino de montaña
function createDetailedPine() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.36, 4.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x3d2616, roughness: 0.9 })
  );
  trunk.position.y = 2.1;
  g.add(trunk);

  // 4 capas cónicas con hojas sombreadas
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x193b2a, roughness: 0.8, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(2.4 - i * 0.45, 3.0, 8), foliageMat);
    f.position.y = 3.2 + i * 1.6;
    g.add(f);
  }
  return g;
}

// Creador de árbol frondoso de hoja caduca
function createDeciduousTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.40, 4.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 })
  );
  trunk.position.y = 2.25;
  g.add(trunk);

  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2e6b2e, roughness: 0.85, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const sphere = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + Math.random() * 0.8, 1), foliageMat);
    sphere.position.set((Math.random() - 0.5) * 1.5, 4.0 + i * 1.1, (Math.random() - 0.5) * 1.5);
    g.add(sphere);
  }
  return g;
}

const natureProps = [];
for (let i = 0; i < 50; i++) {
  const isPine = (i % 2 === 0);
  const tree = isPine ? createDetailedPine() : createDeciduousTree();
  const scale = 1.0 + Math.random() * 0.7;
  tree.scale.set(scale, scale, scale);
  natureGroup.add(tree);

  natureProps.push({
    mesh: tree,
    side: (i % 4 < 2 ? 1 : -1),
    offsetLateral: 8.5 + Math.random() * 9,
    distAhead: i * 16
  });
}
scene.add(natureGroup);

// Carteles viales reflectantes
const signGroup = new THREE.Group();
const signPoleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
const signBoardGeo = new THREE.BoxGeometry(1.2, 1.2, 0.05);

const signs = [
  { text: '⚠️', isYellow: true, distAhead: 60, side: 1 },
  { text: '80', isYellow: false, distAhead: 150, side: 1 },
  { text: '⮞⮞', isYellow: true, distAhead: 240, side: 1 },
  { text: '⚠️', isYellow: true, distAhead: 340, side: 1 }
];

const roadSigns = [];
signs.forEach(s => {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), signPoleMat);
  pole.position.y = 1.4;
  g.add(pole);

  const boardMat = new THREE.MeshBasicMaterial({ map: createSignTexture(s.text, s.isYellow) });
  const board = new THREE.Mesh(signBoardGeo, boardMat);
  board.position.y = 2.4;
  g.add(board);

  signGroup.add(g);
  roadSigns.push({ mesh: g, distAhead: s.distAhead, side: s.side });
});
scene.add(signGroup);

// ==========================================
// 8. TRÁFICO 3D (AUTOS Y CAMIONES)
// ==========================================

const trafficGroup = new THREE.Group();
const vehicles = [
  createDetailedVehicle('truck', 0x991b1b, -2.5, 90),
  createDetailedVehicle('car', 0x2563eb, -2.5, 220),
  createDetailedVehicle('pickup', 0xd97706, 2.2, 50)
];
vehicles.forEach(v => trafficGroup.add(v.mesh));
scene.add(trafficGroup);

function createDetailedVehicle(type, colorHex, laneOffset, initialRelDist) {
  const group = new THREE.Group();
  const isTruck = type === 'truck';
  const w = isTruck ? 2.8 : 2.0;
  const h = isTruck ? 3.6 : 1.5;
  const l = isTruck ? 8.5 : 4.4;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, l),
    new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.5, roughness: 0.3 })
  );
  body.position.y = h / 2 + 0.35;
  body.castShadow = true;
  group.add(body);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
  [[-w/2, 0.42, -l*0.3], [w/2, 0.42, -l*0.3], [-w/2, 0.42, l*0.3], [w/2, 0.42, l*0.3]].forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.position.set(...pos);
    group.add(wheel);
  });

  return {
    mesh: group,
    type: type,
    speed: isTruck ? 68 : 82,
    laneOffset: laneOffset,
    distAhead: initialRelDist,
    passed: false
  };
}

// ==========================================
// 9. CABINA REALISTA: TANQUE ESCULPIDO Y GUANTES
// ==========================================

const cockpitGroup = new THREE.Group();

// Tanque deportivo esculpido
const tankGroup = new THREE.Group();
const tankMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.75, roughness: 0.2 });
const padMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.95 });

const tankCenter = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.70), tankMat);
tankCenter.position.set(0, -0.38, -0.28);
tankCenter.rotation.x = Math.PI / 10;
tankGroup.add(tankCenter);

const padLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.42), padMat);
padLeft.position.set(-0.13, -0.36, -0.26);
padLeft.rotation.x = Math.PI / 10;
tankGroup.add(padLeft);

const padRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.42), padMat);
padRight.position.set(0.13, -0.36, -0.26);
padRight.rotation.x = Math.PI / 10;
tankGroup.add(padRight);

const cap = new THREE.Mesh(
  new THREE.CylinderGeometry(0.04, 0.04, 0.012, 16),
  new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.1 })
);
cap.position.set(0, -0.25, -0.25);
tankGroup.add(cap);
cockpitGroup.add(tankGroup);

// Tija y Manillar
const clampMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 });
const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.08), clampMat);
clamp.position.set(0, -0.20, -0.52);
cockpitGroup.add(clamp);

const barMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });
const barGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.92, 16);
barGeo.rotateZ(Math.PI / 2);
const handlebar = new THREE.Mesh(barGeo, barMat);
handlebar.position.set(0, -0.18, -0.54);
cockpitGroup.add(handlebar);

// Puños
const gripMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.95 });
const gripGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.15, 14);
gripGeo.rotateZ(Math.PI / 2);
const leftGrip = new THREE.Mesh(gripGeo, gripMat); leftGrip.position.set(-0.36, -0.18, -0.54);
const rightGrip = new THREE.Mesh(gripGeo, gripMat); rightGrip.position.set(0.36, -0.18, -0.54);
cockpitGroup.add(leftGrip);
cockpitGroup.add(rightGrip);

// Manetas
const leverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
const leverGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.17, 10);
leverGeo.rotateZ(Math.PI / 3);
const leftLever = new THREE.Mesh(leverGeo, leverMat); leftLever.position.set(-0.30, -0.16, -0.57);
const rightLever = new THREE.Mesh(leverGeo, leverMat); rightLever.rotation.y = Math.PI; rightLever.position.set(0.30, -0.16, -0.57);
cockpitGroup.add(leftLever);
cockpitGroup.add(rightLever);

// Depósito transparente de líquido de freno delantero
const reservoirMat = new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.75, roughness: 0.1 });
const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.038, 12), reservoirMat);
reservoir.position.set(0.26, -0.12, -0.55);
cockpitGroup.add(reservoir);

// Manos del Piloto con Guantes 3D
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.2 });
const armorMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 });

function createHand(isLeft) {
  const h = new THREE.Group();
  const dir = isLeft ? -1 : 1;

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.058, 0.42, 12), gloveMat);
  arm.position.set(0, -0.15, 0.18);
  arm.rotation.x = Math.PI / 3.4;
  h.add(arm);

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.042, 0.07), gloveMat);
  h.add(palm);

  const armor = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.016, 0.032), armorMat);
  armor.position.set(0, 0.022, -0.01);
  h.add(armor);

  h.position.set(dir * 0.36, -0.18, -0.54);
  return h;
}
cockpitGroup.add(createHand(true));
cockpitGroup.add(createHand(false));

// Pantalla Digital TFT HD
const dashCanvas = document.createElement('canvas');
dashCanvas.width = 1024;
dashCanvas.height = 512;
const dashCtx = dashCanvas.getContext('2d');
const dashTexture = new THREE.CanvasTexture(dashCanvas);
const dashMat = new THREE.MeshBasicMaterial({ map: dashTexture });

const dashMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.28, 0.15, 0.02),
  dashMat
);
dashMesh.position.set(0, -0.08, -0.62);
dashMesh.rotation.x = -Math.PI / 5.5;
cockpitGroup.add(dashMesh);

camera.add(cockpitGroup);
scene.add(camera);

// ==========================================
// 10. CONTROLES Y TECLADO (CORREGIDOS Y NATURALES)
// ==========================================

const keys = { throttle: false, brake: false, steerLeft: false, steerRight: false };

window.addEventListener('keydown', (e) => {
  if (['KeyW', 'ArrowUp'].includes(e.code)) keys.throttle = true;
  if (['KeyS', 'ArrowDown'].includes(e.code)) keys.brake = true;
  // A / Flecha Izquierda = Dobla hacia la IZQUIERDA
  if (['KeyA', 'ArrowLeft'].includes(e.code)) keys.steerLeft = true;
  // D / Flecha Derecha = Dobla hacia la DERECHA
  if (['KeyD', 'ArrowRight'].includes(e.code)) keys.steerRight = true;

  if (e.code === 'KeyE') shiftUp();
  if (e.code === 'KeyQ') shiftDown();
  if (e.code === 'KeyH') window.soundEngine.playHorn();
});

window.addEventListener('keyup', (e) => {
  if (['KeyW', 'ArrowUp'].includes(e.code)) keys.throttle = false;
  if (['KeyS', 'ArrowDown'].includes(e.code)) keys.brake = false;
  if (['KeyA', 'ArrowLeft'].includes(e.code)) keys.steerLeft = false;
  if (['KeyD', 'ArrowRight'].includes(e.code)) keys.steerRight = false;
});

function shiftUp() {
  if (!simState.active || simState.paused) return;
  if (simState.gear < 6) {
    simState.gear++;
    window.soundEngine.playGearShift();
    simState.rpm = Math.max(simState.idleRpm, simState.rpm * 0.72);
  }
}

function shiftDown() {
  if (!simState.active || simState.paused) return;
  if (simState.gear > 0) {
    simState.gear--;
    window.soundEngine.playGearShift();
    if (simState.gear > 0) {
      simState.rpm = Math.min(simState.maxRpm, simState.rpm * 1.35);
    }
  }
}

btnIgnite.addEventListener('click', () => {
  startModal.classList.remove('active');
  window.soundEngine.start();
  simState.active = true;
  simState.paused = false;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
});

btnRespawn.addEventListener('click', () => {
  location.reload();
});

// ==========================================
// 11. BUCLE DE FÍSICA Y MANEJO REALISTA
// ==========================================

let lastTime = performance.now();

function gameLoop(now) {
  const dt = Math.min(0.08, (now - lastTime) / 1000);
  lastTime = now;

  if (simState.active && !simState.paused) {
    updateHandlingPhysics(dt);
  }

  updateContinuousRoadMesh();
  updateTFT();
  renderer.render(scene, camera);

  if (simState.active) {
    requestAnimationFrame(gameLoop);
  }
}

function updateHandlingPhysics(dt) {
  const currentGear = simState.gear;
  const maxGearSpeed = simState.gearLimits[currentGear];
  const minGearSpeed = simState.gearMinSpeed[currentGear];

  // Acelerador y Potencia
  if (keys.throttle) {
    if (currentGear === 0) {
      simState.rpm = Math.min(simState.maxRpm, simState.rpm + 6800 * dt);
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, 0, 0.1);
    } else {
      const idealRpm = (simState.rpm >= 3800 && simState.rpm <= 7800);
      const accelFactor = idealRpm ? 1.35 : 0.8;
      
      if (simState.speed < minGearSpeed - 15) {
        simState.speed = Math.max(0, simState.speed + 6 * dt);
      } else {
        const topRatio = Math.max(0, 1 - (simState.speed / maxGearSpeed));
        simState.speed = Math.min(simState.maxSpeed, simState.speed + (32 * accelFactor * topRatio) * dt);
      }

      const gearRatio = simState.speed / maxGearSpeed;
      simState.rpm = simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm));
      simState.fuelLiters = Math.max(0, simState.fuelLiters - (0.007 + (simState.rpm / simState.maxRpm) * 0.02) * dt);
      
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, 0.03, 0.08);
    }
  } else {
    if (currentGear === 0) {
      simState.rpm = Math.max(simState.idleRpm, simState.rpm - 4200 * dt);
      simState.speed = Math.max(0, simState.speed - 9 * dt);
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, 0, 0.1);
    } else {
      const engineBraking = 11 + (currentGear === 1 ? 18 : 9);
      simState.speed = Math.max(0, simState.speed - engineBraking * dt);
      const gearRatio = simState.speed / maxGearSpeed;
      simState.rpm = Math.max(simState.idleRpm, simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm)));
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, -0.015, 0.08);
    }
  }

  // Freno Combinado
  if (keys.brake) {
    simState.speed = Math.max(0, simState.speed - 56 * dt);
    simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, -0.055, 0.15);
    if (simState.speed > 55 && Math.random() < 0.06) {
      window.soundEngine.playTireScreech();
    }
  }

  // ========================================================
  // FÍSICA DE MANEJO CORREGIDA (DIRECCIÓN TOTALMENTE NATURAL):
  // - A / Izquierda: steerInput negativo -> laneOffset se desplaza a la IZQUIERDA (-)
  // - D / Derecha: steerInput positivo -> laneOffset se desplaza a la DERECHA (+)
  // ========================================================
  let steer = 0;
  if (keys.steerLeft) steer -= 1;
  if (keys.steerRight) steer += 1;

  const steerSpeed = (simState.speed > 120 ? 5.0 : (simState.speed > 50 ? 6.5 : 8.0));
  simState.steeringInput = THREE.MathUtils.lerp(simState.steeringInput, steer, steerSpeed * dt);

  // Inclinación física de la moto: al doblar a la izquierda, la moto se inclina a la izquierda
  const maxLean = 0.42; // ~24 grados
  simState.leanAngle = THREE.MathUtils.lerp(simState.leanAngle, simState.steeringInput * maxLean, 6.5 * dt);

  // Desplazamiento lateral directo y suave según la velocidad
  const turnRate = 5.6 * Math.min(1.4, (simState.speed + 15) / 75);
  simState.laneOffset += simState.steeringInput * turnRate * dt;
  simState.laneOffset = Math.max(-4.8, Math.min(4.8, simState.laneOffset));

  // Avance del jugador
  simState.playerDistance += (simState.speed / 3.6) * dt;

  // Orientación en la posición del piloto
  const roadOri = getRoadOrientation(simState.playerDistance);

  // La inercia en curva empuja levemente hacia afuera si vas muy rápido
  simState.laneOffset += roadOri.curveRate * (simState.speed / 100) * 1.6 * dt;
  simState.onRumble = (Math.abs(simState.laneOffset) > 4.2);

  // Mirada hacia el ápice de la curva (Head tracking dinámico)
  const targetLook = -simState.steeringInput * 0.08;
  simState.headLookApex = THREE.MathUtils.lerp(simState.headLookApex, targetLook, 5.0 * dt);

  // Posición de la cámara en el carril
  const perpX = Math.cos(roadOri.yaw);
  const perpZ = Math.sin(roadOri.yaw);

  const speedWindBuffet = Math.pow(Math.max(0, simState.speed - 110) / 85, 2) * 0.008;
  const vib = (simState.rpm / simState.maxRpm) * 0.005 + (simState.onRumble ? 0.02 : 0) + speedWindBuffet;

  camera.position.x = roadOri.x + (perpX * simState.laneOffset) + (Math.random() - 0.5) * vib;
  camera.position.y = roadOri.y + 1.42 + (Math.random() - 0.5) * vib;
  camera.position.z = roadOri.z + (perpZ * simState.laneOffset);

  // Orientación limpia y alineada de la cámara
  camera.rotation.set(0, 0, 0);
  camera.rotation.y = roadOri.yaw + simState.headLookApex;
  camera.rotation.x = roadOri.pitch + simState.pitchSuspension;
  camera.rotation.z = -simState.leanAngle * 0.72 + roadOri.roll;

  // FOV dinámico con efecto de velocidad
  camera.fov = 65 + (simState.speed / simState.maxSpeed) * 10;
  camera.updateProjectionMatrix();

  // Giro suave del manillar
  handlebar.rotation.y = -simState.steeringInput * 0.07;

  // Actualizar Vegetación (Pinos y Árboles)
  natureProps.forEach(p => {
    let pDist = simState.playerDistance + p.distAhead;
    const pt = getRoadPoint(pDist);
    const ori = getRoadOrientation(pDist);

    const px = Math.cos(ori.yaw) * (p.side * p.offsetLateral);
    const pz = Math.sin(ori.yaw) * (p.side * p.offsetLateral);

    p.mesh.position.set(pt.x + px, pt.y, pt.z + pz);

    p.distAhead -= ((simState.speed / 3.6) * dt);
    if (p.distAhead < -20) {
      p.distAhead += (natureProps.length * 16);
    }
  });

  // Actualizar Tachas Reflectantes (Ojos de gato) en la línea amarilla
  catEyes.forEach(ce => {
    let cDist = simState.playerDistance + ce.distOffset;
    const pt = getRoadPoint(cDist);
    ce.mesh.position.set(pt.x, pt.y + 0.03, pt.z);

    ce.distOffset -= ((simState.speed / 3.6) * dt);
    if (ce.distOffset < -10) {
      ce.distOffset += (catEyes.length * 8);
    }
  });

  // Actualizar Carteles Viales
  roadSigns.forEach(s => {
    let sDist = simState.playerDistance + s.distAhead;
    const pt = getRoadPoint(sDist);
    const ori = getRoadOrientation(sDist);

    const sx = Math.cos(ori.yaw) * (s.side * 7.5);
    const sz = Math.sin(ori.yaw) * (s.side * 7.5);

    s.mesh.position.set(pt.x + sx, pt.y, pt.z + sz);
    s.mesh.rotation.y = ori.yaw;

    s.distAhead -= ((simState.speed / 3.6) * dt);
    if (s.distAhead < -20) {
      s.distAhead += 400;
    }
  });

  // Actualizar Tráfico 3D
  vehicles.forEach(v => {
    if (v.laneOffset < 0) {
      v.distAhead -= ((v.speed + simState.speed) / 3.6) * dt;
    } else {
      v.distAhead += ((v.speed - simState.speed) / 3.6) * dt;
    }

    const vDist = simState.playerDistance + v.distAhead;
    const vp = getRoadPoint(vDist);
    const vOri = getRoadOrientation(vDist);

    const vx = Math.cos(vOri.yaw) * v.laneOffset;
    const vz = Math.sin(vOri.yaw) * v.laneOffset;

    v.mesh.position.set(vp.x + vx, vp.y, vp.z + vz);
    v.mesh.rotation.set(0, 0, 0);
    v.mesh.rotation.y = vOri.yaw + (v.laneOffset < 0 ? Math.PI : 0);

    if (v.distAhead < 6 && v.distAhead > -6 && !v.passed && v.laneOffset < 0) {
      window.soundEngine.playPassWhoosh();
      v.passed = true;
    }

    const distToPlayer = Math.hypot(camera.position.x - v.mesh.position.x, camera.position.z - v.mesh.position.z);
    if (distToPlayer < 2.8) {
      simState.speed = Math.max(0, simState.speed - 50);
      simState.bikeHealth = Math.max(0, simState.bikeHealth - 35);
      window.soundEngine.playTireScreech();
      if (simState.bikeHealth <= 0) {
        triggerBreakdown("Colisión Vial", "Choque contra otro vehículo en el camino.");
      }
    }

    if (v.distAhead < -25 || v.distAhead > 500) {
      v.distAhead = 350 + Math.random() * 200;
      v.passed = false;
    }
  });

  // Temperatura y Audio
  if (simState.rpm > simState.redlineRpm) {
    simState.engineTemp = Math.min(130, simState.engineTemp + 4.5 * dt);
  } else {
    const cooling = (simState.speed / 100) * 1.6;
    simState.engineTemp = Math.max(78, simState.engineTemp + (0.45 - cooling) * dt);
  }

  window.soundEngine.update(simState.rpm, simState.maxRpm, simState.speed, simState.maxSpeed, simState.onRumble);

  // Progreso
  if (simState.speed > 0) {
    const kmCovered = (simState.speed / 3600) * dt * 18;
    simState.targetDistanceKm = Math.max(0, simState.targetDistanceKm - kmCovered);
    simState.odometer += kmCovered;

    if (simState.targetDistanceKm <= 0) arriveAtWaypoint();
  }

  if (simState.fuelLiters <= 0) triggerBreakdown("Sin Combustible", "El motor se apagó por falta de nafta.");
  if (simState.engineTemp >= 125) triggerBreakdown("Motor Fundido", "Temperatura crítica del motor.");

  updateGps();
}

// ACTUALIZACIÓN DE LA MALLA CONTINUA DE ASFALTO
function updateContinuousRoadMesh() {
  const positions = roadPosAttr.array;
  const halfW = ROAD_WIDTH / 2;

  for (let i = 0; i < RIBBON_POINTS; i++) {
    const sampleDist = simState.playerDistance + (i * POINT_STEP) - 8;
    const p = getRoadPoint(sampleDist);
    const ori = getRoadOrientation(sampleDist);

    const nx = Math.cos(ori.yaw);
    const nz = Math.sin(ori.yaw);

    const idxL = i * 2 * 3;
    positions[idxL]     = p.x - (nx * halfW);
    positions[idxL + 1] = p.y + 0.03;
    positions[idxL + 2] = p.z - (nz * halfW);

    const idxR = (i * 2 + 1) * 3;
    positions[idxR]     = p.x + (nx * halfW);
    positions[idxR + 1] = p.y + 0.03;
    positions[idxR + 2] = p.z + (nz * halfW);
  }

  roadPosAttr.needsUpdate = true;
}

// ACTUALIZACIÓN DEL TABLERO TFT
function updateTFT() {
  const c = dashCtx;
  c.fillStyle = '#030712';
  c.fillRect(0, 0, 1024, 512);

  c.strokeStyle = '#0284c7';
  c.lineWidth = 8;
  c.strokeRect(10, 10, 1004, 492);

  // SHIFT LIGHT (Luces LED de corte)
  const isShiftWarning = simState.rpm >= 8200;
  for (let i = 0; i < 7; i++) {
    const lx = 260 + (i * 72);
    let ledColor = '#1e293b';
    if (simState.rpm > 6500 && i < 3) ledColor = '#f59e0b';
    if (simState.rpm > 7500 && i >= 3 && i < 5) ledColor = '#ef4444';
    if (isShiftWarning && i >= 5) {
      ledColor = (performance.now() % 160 < 80) ? '#38bdf8' : '#ef4444';
    }
    c.fillStyle = ledColor;
    c.beginPath();
    c.roundRect(lx, 30, 52, 16, 4);
    c.fill();
  }

  // Indicador de Giro en el tablero (Corregido y sincronizado)
  if (keys.steerLeft && performance.now() % 500 < 250) {
    c.fillStyle = '#22c55e';
    c.font = '700 48px sans-serif';
    c.fillText('◀', 100, 60);
  }
  if (keys.steerRight && performance.now() % 500 < 250) {
    c.fillStyle = '#22c55e';
    c.font = '700 48px sans-serif';
    c.fillText('▶', 920, 60);
  }

  // Marcha grande
  c.fillStyle = simState.gear === 0 ? '#22c55e' : '#38bdf8';
  c.font = '700 160px "Chakra Petch", monospace';
  c.textAlign = 'center';
  const gText = simState.gear === 0 ? 'N' : simState.gear;
  c.fillText(gText, 200, 240);
  c.font = '36px "Chakra Petch"';
  c.fillStyle = '#64748b';
  c.fillText('MARCHA', 200, 310);

  // Velocímetro digital
  c.fillStyle = '#ffffff';
  c.font = '700 210px "Share Tech Mono", monospace';
  c.fillText(Math.round(simState.speed).toString().padStart(3, ' '), 560, 260);
  c.font = '42px "Chakra Petch"';
  c.fillStyle = '#38bdf8';
  c.fillText('KM / H', 560, 330);

  // Barra de Tacómetro RPM
  const rpmRatio = Math.min(1, simState.rpm / simState.maxRpm);
  c.fillStyle = '#1e293b';
  c.fillRect(80, 400, 864, 45);
  c.fillStyle = simState.rpm >= simState.redlineRpm ? '#ef4444' : '#38bdf8';
  c.fillRect(80, 400, 864 * rpmRatio, 45);

  // Métricas
  c.font = '40px "Share Tech Mono"';
  c.textAlign = 'right';
  c.fillStyle = simState.fuelLiters < 4 ? '#ef4444' : '#cbd5e1';
  c.fillText(`FUEL: ${simState.fuelLiters.toFixed(1)}L`, 960, 115);
  c.fillStyle = simState.engineTemp > 105 ? '#ef4444' : '#cbd5e1';
  c.fillText(`TEMP: ${Math.round(simState.engineTemp)}°C`, 960, 175);

  dashTexture.needsUpdate = true;
}

function updateGps() {
  const current = window.WaypointSystem.getCurrent();
  if (current) {
    gpsTarget.textContent = current.name.split('-')[0];
    gpsRoute.textContent = `${current.biome.toUpperCase()} // ${current.roadCondition.toUpperCase()}`;
  }
  gpsDist.textContent = simState.targetDistanceKm.toFixed(1) + " km";
  if (simState.speed > 5) {
    const etaMin = Math.ceil((simState.targetDistanceKm / simState.speed) * 60);
    gpsEta.textContent = "ETA " + etaMin + " min";
  } else {
    gpsEta.textContent = "ETA -- min";
  }
}

function arriveAtWaypoint() {
  simState.paused = true;
  simState.speed = 0;
  simState.rpm = simState.idleRpm;
  window.soundEngine.stop();

  const current = window.WaypointSystem.getCurrent();
  document.getElementById('service-name').textContent = current.name;
  document.getElementById('srv-fuel').textContent = `${simState.fuelLiters.toFixed(1)} L`;
  document.getElementById('srv-temp').textContent = `${Math.round(simState.engineTemp)}°C`;
  document.getElementById('srv-tires').textContent = `${simState.tirePressure} PSI`;
  document.getElementById('srv-money').textContent = `$${simState.money}`;
  document.getElementById('service-narrative').textContent = current.description;

  const container = document.getElementById('service-actions');
  container.innerHTML = '';

  current.actions.forEach(action => {
    const btn = document.createElement('button');
    btn.className = 'srv-btn';

    const label = document.createElement('span');
    label.textContent = action.text;
    btn.appendChild(label);

    if (action.cost > 0) {
      const cost = document.createElement('span');
      cost.className = 'srv-cost';
      cost.textContent = `-$${action.cost}`;
      btn.appendChild(cost);
      if (simState.money < action.cost) btn.disabled = true;
    }

    btn.addEventListener('click', () => {
      if (action.cost > 0) simState.money -= action.cost;
      if (action.effect) {
        const msg = action.effect(simState);
        document.getElementById('service-narrative').textContent = msg;
        document.getElementById('srv-fuel').textContent = `${simState.fuelLiters.toFixed(1)} L`;
        document.getElementById('srv-temp').textContent = `${Math.round(simState.engineTemp)}°C`;
        document.getElementById('srv-tires').textContent = `${simState.tirePressure} PSI`;
        document.getElementById('srv-money').textContent = `$${simState.money}`;
      }

      if (action.isNext) {
        const next = window.WaypointSystem.advance();
        if (next) {
          serviceModal.classList.remove('active');
          simState.paused = false;
          simState.targetDistanceKm = next.distance;
          simState.gear = 1;
          window.soundEngine.start();
        } else {
          triggerBreakdown("¡Travesía Conquistada!", "Completaste toda la ruta en moto hasta la costa.");
        }
      }
    });

    container.appendChild(btn);
  });

  serviceModal.classList.add('active');
}

function triggerBreakdown(title, desc) {
  simState.active = false;
  window.soundEngine.stop();
  document.getElementById('breakdown-title').textContent = title;
  document.getElementById('breakdown-desc').textContent = desc;
  breakdownModal.classList.add('active');
}
