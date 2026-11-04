// Motor Gráfico 3D Ultra (Three.js WebGL Engine)
// Texturas PBR Procedurales, Manos del Piloto 3D, Cabina Hiperrealista y Pantalla Completa

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

// Estado de la Simulación
const simState = {
  active: false,
  paused: false,
  
  // Transmisión y Motor
  gear: 1, // 0 = Neutro, 1 a 6
  rpm: 1200,
  idleRpm: 1200,
  maxRpm: 10000,
  redlineRpm: 8500,
  speed: 0, // km/h
  maxSpeed: 195,
  
  // Mecánica
  fuelLiters: 18.0,
  engineTemp: 82.0, // °C
  tirePressure: 32.0, // PSI
  bikeHealth: 100,
  money: 180,
  headlights: true,
  
  // Posición y Dinámica
  leanAngle: 0,
  roadX: 2.4, // 0 = centro, -5.5 = carril izq, +5.5 = banquina der
  roadCurve: 0,
  targetDistanceKm: 15.0,
  odometer: 0,
  onRumble: false,
  
  gearLimits: [0, 48, 80, 115, 145, 175, 205],
  gearMinSpeed: [0, 0, 20, 40, 65, 88, 110]
};

// ==========================================
// 1. GENERADORES DE TEXTURAS PBR PROCEDURALES
// ==========================================

function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Base oscura de asfalto
  ctx.fillStyle = '#1e2229';
  ctx.fillRect(0, 0, 1024, 1024);

  // Micrograno de grava y asfalto triturado
  const imgData = ctx.getImageData(0, 0, 1024, 1024);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 36;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  // Mancha de desgaste y aceite en los carriles
  const oilGrad = ctx.createLinearGradient(0, 0, 1024, 0);
  oilGrad.addColorStop(0, 'rgba(10, 12, 16, 0.4)');
  oilGrad.addColorStop(0.28, 'rgba(10, 12, 16, 0.7)');
  oilGrad.addColorStop(0.5, 'rgba(10, 12, 16, 0.2)');
  oilGrad.addColorStop(0.72, 'rgba(10, 12, 16, 0.7)');
  oilGrad.addColorStop(1, 'rgba(10, 12, 16, 0.4)');
  ctx.fillStyle = oilGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Doble línea amarilla reflectante central
  ctx.fillStyle = '#eab308';
  ctx.fillRect(502, 0, 8, 1024);
  ctx.fillRect(514, 0, 8, 1024);

  // Líneas blancas laterales exteriores
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(48, 0, 12, 1024);
  ctx.fillRect(964, 0, 12, 1024);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createTerrainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#5c4d3c';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 3500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const s = 1 + Math.random() * 3;
    ctx.fillStyle = Math.random() < 0.6 ? '#473b2d' : (Math.random() < 0.5 ? '#6b5c47' : '#3d4d38');
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(40, 40);
  return texture;
}

function createCarbonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillRect(32, 32, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

// ==========================================
// 2. ESCENA, CÁMARA Y RENDERIZADOR 3D
// ==========================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x38bdf8);
scene.fog = new THREE.FogExp2(0x94a3b8, 0.0016);

let width = window.innerWidth;
let height = window.innerHeight;

const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 3000);
camera.position.set(0, 1.48, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

// Redimensionar al cambiar tamaño de pantalla
window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

// Pantalla Completa
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
// 3. ILUMINACIÓN SOLAR Y ATMOSFÉRICA
// ==========================================

const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.95);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffedd5, 1.6);
sunLight.position.set(250, 400, -350);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// Faro delantero de la moto (SpotLight 3D real)
const motoHeadlight = new THREE.SpotLight(0xfffae0, 3.2, 110, Math.PI / 5, 0.35, 1.2);
motoHeadlight.position.set(0, 1.2, -0.6);
const headlightTarget = new THREE.Object3D();
headlightTarget.position.set(0, 0.4, -40);
scene.add(headlightTarget);
motoHeadlight.target = headlightTarget;
scene.add(motoHeadlight);

// ==========================================
// 4. MUNDO 3D: CARRETERA, PAISAJE Y POSTES
// ==========================================

// Suelo
const groundTexture = createTerrainTexture();
const groundGeo = new THREE.PlaneGeometry(4000, 4000);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.95, metalness: 0.05 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);

// Cúpula del cielo / Sol visible
const skyGeo = new THREE.SphereGeometry(1400, 32, 20);
const skyMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, side: THREE.BackSide });
const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

// Cordillera de Montañas en 3D
const mountainsGroup = new THREE.Group();
const mtnGeo = new THREE.ConeGeometry(90, 160, 7);
const mtnMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, flatShading: true });
for (let i = 0; i < 32; i++) {
  const m = new THREE.Mesh(mtnGeo, mtnMat);
  const ang = (i / 32) * Math.PI * 2;
  const rad = 850 + Math.random() * 250;
  m.position.set(Math.cos(ang) * rad, 60 + Math.random() * 35, Math.sin(ang) * rad);
  m.scale.set(1.2 + Math.random() * 1.6, 1 + Math.random() * 1.5, 1.2 + Math.random() * 1.6);
  mountainsGroup.add(m);
}
scene.add(mountainsGroup);

// Sistema de Carretera Infinita Texturizada en 3D
const ROAD_SEGMENTS = 70;
const SEGMENT_LENGTH = 16;
const roadGroup = new THREE.Group();

const asphaltTexture = createAsphaltTexture();
const asphaltMat = new THREE.MeshStandardMaterial({
  map: asphaltTexture,
  roughness: 0.65,
  metalness: 0.15
});

const curbMatRed = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });
const curbMatWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
const roadSegments = [];

for (let i = 0; i < ROAD_SEGMENTS; i++) {
  const seg = new THREE.Group();
  
  // Asfalto (ancho 12.8 metros con textura PBR)
  const aspGeo = new THREE.PlaneGeometry(12.8, SEGMENT_LENGTH);
  const aspMesh = new THREE.Mesh(aspGeo, asphaltMat);
  aspMesh.rotation.x = -Math.PI / 2;
  aspMesh.receiveShadow = true;
  seg.add(aspMesh);

  // Banquina rugosa tridimensional (Rumble strips)
  const curbGeo = new THREE.BoxGeometry(0.65, 0.12, SEGMENT_LENGTH);
  const curbLeft = new THREE.Mesh(curbGeo, (i % 2 === 0) ? curbMatRed : curbMatWhite);
  curbLeft.position.set(-6.6, 0.05, 0);
  const curbRight = new THREE.Mesh(curbGeo, (i % 2 === 0) ? curbMatRed : curbMatWhite);
  curbRight.position.set(6.6, 0.05, 0);
  seg.add(curbLeft);
  seg.add(curbRight);

  // Guardarraíl metálico en curvas
  const railGeo = new THREE.BoxGeometry(0.12, 0.45, SEGMENT_LENGTH);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 });
  const railLeft = new THREE.Mesh(railGeo, railMat);
  railLeft.position.set(-7.2, 0.65, 0);
  const railRight = new THREE.Mesh(railGeo, railMat);
  railRight.position.set(7.2, 0.65, 0);
  seg.add(railLeft);
  seg.add(railRight);

  seg.position.z = -i * SEGMENT_LENGTH;
  roadGroup.add(seg);
  roadSegments.push(seg);
}
scene.add(roadGroup);

// Postes de tendido eléctrico y árboles a la orilla
const propsGroup = new THREE.Group();
const poleGeo = new THREE.CylinderGeometry(0.24, 0.32, 10, 8);
const poleMat = new THREE.MeshStandardMaterial({ color: 0x3e2c1c, roughness: 0.9 });
const crossGeo = new THREE.BoxGeometry(3.6, 0.22, 0.22);

const treeGeo = new THREE.DodecahedronGeometry(2.8, 1);
const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d4f26, roughness: 0.85, flatShading: true });

const roadsideProps = [];
for (let i = 0; i < 22; i++) {
  const p = new THREE.Group();
  
  // Poste
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 5;
  p.add(pole);
  const cross = new THREE.Mesh(crossGeo, poleMat);
  cross.position.y = 9.2;
  p.add(cross);

  // Árbol / arbusto al lado
  const tree = new THREE.Mesh(treeGeo, treeMat);
  tree.position.set(Math.random() < 0.5 ? -18 : 18, 3.2, 0);
  p.add(tree);

  p.position.set(9.2, 0, -i * 50);
  propsGroup.add(p);
  roadsideProps.push(p);
}
scene.add(propsGroup);

// Tráfico 3D Realista (Camiones y Autos)
const trafficGroup = new THREE.Group();
const vehicles = [
  createDetailedVehicle('truck', 0x991b1b, -2.9, -150),
  createDetailedVehicle('car', 0x2563eb, -2.9, -320),
  createDetailedVehicle('pickup', 0xd97706, 2.7, -90)
];
vehicles.forEach(v => trafficGroup.add(v.mesh));
scene.add(trafficGroup);

function createDetailedVehicle(type, colorHex, x, z) {
  const group = new THREE.Group();
  const isTruck = type === 'truck';
  const w = isTruck ? 2.8 : 2.0;
  const h = isTruck ? 3.6 : 1.5;
  const l = isTruck ? 8.5 : 4.4;

  // Carrocería lacada con reflejo
  const bodyGeo = new THREE.BoxGeometry(w, h, l);
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.45, roughness: 0.3 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = h / 2 + 0.38;
  body.castShadow = true;
  group.add(body);

  // Parabrisas polarizado
  const glassGeo = new THREE.BoxGeometry(w * 0.92, h * 0.42, l * 0.38);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, h * 0.76, l * 0.15);
  group.add(glass);

  // Ruedas de goma con llantas cromadas
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });

  const wheelPositions = [
    [-w / 2, 0.42, -l * 0.32], [w / 2, 0.42, -l * 0.32],
    [-w / 2, 0.42, l * 0.32],  [w / 2, 0.42, l * 0.32]
  ];
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.position.set(...pos);
    group.add(wheel);
  });

  // Faros LED y ópticas traseras
  const frontLightMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
  const rearLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const lGeo = new THREE.BoxGeometry(0.4, 0.22, 0.1);

  const fl1 = new THREE.Mesh(lGeo, frontLightMat); fl1.position.set(-w * 0.38, 0.85, -l / 2); group.add(fl1);
  const fl2 = new THREE.Mesh(lGeo, frontLightMat); fl2.position.set(w * 0.38, 0.85, -l / 2); group.add(fl2);
  const rl1 = new THREE.Mesh(lGeo, rearLightMat);  rl1.position.set(-w * 0.38, 0.85, l / 2);  group.add(rl1);
  const rl2 = new THREE.Mesh(lGeo, rearLightMat);  rl2.position.set(w * 0.38, 0.85, l / 2);  group.add(rl2);

  group.position.set(x, 0, z);

  return {
    mesh: group,
    type: type,
    speed: isTruck ? 72 : 88,
    lane: x < 0 ? -1 : 1,
    passed: false
  };
}

// ==========================================
// 5. CABINA 3D HIPERREALISTA CON GUANTES DEL PILOTO
// ==========================================

const cockpitGroup = new THREE.Group();
const carbonTexture = createCarbonTexture();
const carbonMat = new THREE.MeshStandardMaterial({ map: carbonTexture, roughness: 0.35, metalness: 0.6 });

// Manillar en aleación deportiva
const barMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
const barGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.92, 16);
barGeo.rotateZ(Math.PI / 2);
const handlebar = new THREE.Mesh(barGeo, barMat);
handlebar.position.set(0, -0.30, -0.58);
cockpitGroup.add(handlebar);

// Puños antideslizantes
const gripMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95 });
const gripGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.16, 14);
gripGeo.rotateZ(Math.PI / 2);
const leftGrip = new THREE.Mesh(gripGeo, gripMat); leftGrip.position.set(-0.38, -0.30, -0.58);
const rightGrip = new THREE.Mesh(gripGeo, gripMat); rightGrip.position.set(0.38, -0.30, -0.58);
cockpitGroup.add(leftGrip);
cockpitGroup.add(rightGrip);

// Manetas de freno y embrague
const leverMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.95, roughness: 0.15 });
const leverGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.18, 10);
leverGeo.rotateZ(Math.PI / 3);
const leftLever = new THREE.Mesh(leverGeo, leverMat); leftLever.position.set(-0.32, -0.27, -0.61);
const rightLever = new THREE.Mesh(leverGeo, leverMat); rightLever.rotation.y = Math.PI; rightLever.position.set(0.32, -0.27, -0.61);
cockpitGroup.add(leftLever);
cockpitGroup.add(rightLever);

// --- MANOS DEL PILOTO EN CUERO NEGRO (GUANTES 3D) ---
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.2 });
const armorMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 }); // Protecciones de nudillos

function createRiderHand(isLeft) {
  const hand = new THREE.Group();
  const dir = isLeft ? -1 : 1;

  // Antebrazo / Manga de la campera
  const armGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.45, 14);
  const arm = new THREE.Mesh(armGeo, gloveMat);
  arm.position.set(0, -0.18, 0.22);
  arm.rotation.x = Math.PI / 3.2;
  hand.add(arm);

  // Dorso de la mano
  const palmGeo = new THREE.BoxGeometry(0.075, 0.05, 0.08);
  const palm = new THREE.Mesh(palmGeo, gloveMat);
  palm.position.set(0, 0, 0);
  hand.add(palm);

  // Protector rígido de nudillos (Kevlar/Titanio)
  const armorGeo = new THREE.BoxGeometry(0.065, 0.02, 0.04);
  const armor = new THREE.Mesh(armorGeo, armorMat);
  armor.position.set(0, 0.028, -0.01);
  hand.add(armor);

  // Dedos aferrados al manillar
  const fingerGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.07, 10);
  fingerGeo.rotateZ(Math.PI / 2);
  const finger = new THREE.Mesh(fingerGeo, gloveMat);
  finger.position.set(0, -0.02, -0.03);
  hand.add(finger);

  hand.position.set(dir * 0.38, -0.30, -0.58);
  return hand;
}

const leftHand = createRiderHand(true);
const rightHand = createRiderHand(false);
cockpitGroup.add(leftHand);
cockpitGroup.add(rightHand);

// Pantalla / Tablero Digital TFT (1024x512)
const dashCanvas = document.createElement('canvas');
dashCanvas.width = 1024;
dashCanvas.height = 512;
const dashCtx = dashCanvas.getContext('2d');
const dashTexture = new THREE.CanvasTexture(dashCanvas);
const dashMat = new THREE.MeshBasicMaterial({ map: dashTexture });

const dashGeo = new THREE.BoxGeometry(0.32, 0.17, 0.03);
const dashMesh = new THREE.Mesh(dashGeo, dashMat);
dashMesh.position.set(0, -0.21, -0.65);
dashMesh.rotation.x = -Math.PI / 5.5;
cockpitGroup.add(dashMesh);

// Parabrisas Touring curvo y biselado
const shieldGeo = new THREE.CylinderGeometry(0.36, 0.44, 0.45, 24, 1, true, 0, Math.PI);
const shieldMat = new THREE.MeshPhysicalMaterial({
  color: 0x93c5fd,
  transparent: true,
  opacity: 0.32,
  roughness: 0.05,
  metalness: 0.1,
  clearcoat: 1.0,
  side: THREE.DoubleSide
});
const windshield = new THREE.Mesh(shieldGeo, shieldMat);
windshield.position.set(0, -0.04, -0.72);
windshield.rotation.x = -Math.PI / 4.8;
windshield.rotation.y = Math.PI;
cockpitGroup.add(windshield);

// Espejos retrovisores de aleación
function addMirror(x, y, z) {
  const m = new THREE.Group();
  const housingGeo = new THREE.BoxGeometry(0.14, 0.08, 0.03);
  const housing = new THREE.Mesh(housingGeo, carbonMat);
  
  const glassGeo = new THREE.PlaneGeometry(0.13, 0.07);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x1e3a5f });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.z = 0.016;

  m.add(housing);
  m.add(glass);
  m.position.set(x, y, z);
  m.rotation.y = (x < 0 ? 0.32 : -0.32);
  cockpitGroup.add(m);
}
addMirror(-0.46, -0.16, -0.62);
addMirror(0.46, -0.16, -0.62);

camera.add(cockpitGroup);
scene.add(camera);

// ==========================================
// 6. TECLADO Y MANDOS DEL PILOTO
// ==========================================

const keys = { throttle: false, brake: false, steerLeft: false, steerRight: false };

window.addEventListener('keydown', (e) => {
  if (['KeyW', 'ArrowUp'].includes(e.code)) keys.throttle = true;
  if (['KeyS', 'ArrowDown'].includes(e.code)) keys.brake = true;
  if (['KeyA', 'ArrowLeft'].includes(e.code)) keys.steerLeft = true;
  if (['KeyD', 'ArrowRight'].includes(e.code)) keys.steerRight = true;

  if (e.code === 'KeyE') shiftUp();
  if (e.code === 'KeyQ') shiftDown();
  if (e.code === 'KeyL') {
    simState.headlights = !simState.headlights;
    motoHeadlight.visible = simState.headlights;
  }
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

// Iniciar simulación
btnIgnite.addEventListener('click', () => {
  startModal.classList.remove('active');
  window.soundEngine.start();
  simState.active = true;
  simState.paused = false;
  lastTime = performance.now();
  requestAnimationFrame(game3DLoop);
});

btnRespawn.addEventListener('click', () => {
  location.reload();
});

// ==========================================
// 7. BUCLE DE FÍSICA Y RENDERIZADO 3D (60 FPS)
// ==========================================

let lastTime = performance.now();

function game3DLoop(now) {
  const dt = Math.min(0.08, (now - lastTime) / 1000);
  lastTime = now;

  if (simState.active && !simState.paused) {
    update3DPhysics(dt);
  }

  updateTFTDashboard();
  renderer.render(scene, camera);

  if (simState.active) {
    requestAnimationFrame(game3DLoop);
  }
}

function update3DPhysics(dt) {
  const currentGear = simState.gear;
  const maxGearSpeed = simState.gearLimits[currentGear];
  const minGearSpeed = simState.gearMinSpeed[currentGear];

  // Acelerador
  if (keys.throttle) {
    if (currentGear === 0) {
      simState.rpm = Math.min(simState.maxRpm, simState.rpm + 6800 * dt);
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
    }
  } else {
    if (currentGear === 0) {
      simState.rpm = Math.max(simState.idleRpm, simState.rpm - 4200 * dt);
      simState.speed = Math.max(0, simState.speed - 9 * dt);
    } else {
      const engineBraking = 11 + (currentGear === 1 ? 18 : 9);
      simState.speed = Math.max(0, simState.speed - engineBraking * dt);
      const gearRatio = simState.speed / maxGearSpeed;
      simState.rpm = Math.max(simState.idleRpm, simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm)));
    }
  }

  // Freno
  if (keys.brake) {
    simState.speed = Math.max(0, simState.speed - 56 * dt);
    if (simState.speed > 55 && Math.random() < 0.06) {
      window.soundEngine.playTireScreech();
    }
  }

  // Contramanillar y Dirección 3D
  if (keys.steerLeft) {
    simState.roadX = Math.max(-5.8, simState.roadX - (7.8 * dt));
    simState.leanAngle = Math.max(-0.38, simState.leanAngle - 1.3 * dt);
  } else if (keys.steerRight) {
    simState.roadX = Math.min(5.8, simState.roadX + (7.8 * dt));
    simState.leanAngle = Math.min(0.38, simState.leanAngle + 1.3 * dt);
  } else {
    simState.leanAngle *= 0.88;
  }

  // Curvatura de la ruta
  simState.roadCurve = Math.sin(performance.now() * 0.0006) * 0.45;
  simState.roadX += (simState.roadCurve * (simState.speed / simState.maxSpeed) * 3.6) * dt;

  // Banquina
  simState.onRumble = (Math.abs(simState.roadX) > 5.0);

  // Cámara 3D (Cabeza del piloto)
  const vibMagnitude = (simState.rpm / simState.maxRpm) * 0.007 + (simState.onRumble ? 0.03 : 0);
  camera.position.x = simState.roadX + (Math.random() - 0.5) * vibMagnitude;
  camera.position.y = 1.48 + (Math.random() - 0.5) * vibMagnitude;
  camera.rotation.z = -simState.leanAngle * 0.65;
  camera.rotation.y = -simState.roadCurve * 0.16;

  // Campo de visión dinámico (Efecto túnel de velocidad)
  camera.fov = 65 + (simState.speed / simState.maxSpeed) * 12;
  camera.updateProjectionMatrix();

  // Movimiento de la carretera
  const worldSpeed = (simState.speed / 3.6) * dt;
  roadSegments.forEach(seg => {
    seg.position.z += worldSpeed;
    if (seg.position.z > SEGMENT_LENGTH) {
      seg.position.z -= ROAD_SEGMENTS * SEGMENT_LENGTH;
    }
  });

  // Movimiento de postes y árboles
  roadsideProps.forEach(p => {
    p.position.z += worldSpeed;
    if (p.position.z > 25) {
      p.position.z -= 22 * 50;
    }
  });

  // Tráfico 3D
  vehicles.forEach(v => {
    const vSpeedMps = (v.speed / 3.6) * dt;
    if (v.lane < 0) {
      v.mesh.position.z += (worldSpeed + vSpeedMps);
    } else {
      v.mesh.position.z += (worldSpeed - vSpeedMps);
    }

    if (v.mesh.position.z > 5 && !v.passed && v.lane < 0) {
      window.soundEngine.playPassWhoosh();
      v.passed = true;
    }

    const distToBike = Math.hypot(camera.position.x - v.mesh.position.x, camera.position.z - v.mesh.position.z);
    if (distToBike < 3.0) {
      simState.speed = Math.max(0, simState.speed - 50);
      simState.bikeHealth = Math.max(0, simState.bikeHealth - 35);
      window.soundEngine.playTireScreech();
      if (simState.bikeHealth <= 0) {
        triggerBreakdown("Accidente Vial", "Impacto violento contra un vehículo en la ruta.");
      }
    }

    if (v.mesh.position.z > 35 || v.mesh.position.z < -950) {
      v.mesh.position.z = -420 - Math.random() * 450;
      v.mesh.position.x = Math.random() < 0.6 ? -2.9 : 2.7;
      v.lane = v.mesh.position.x < 0 ? -1 : 1;
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

  // Progreso de viaje
  if (simState.speed > 0) {
    const kmCovered = (simState.speed / 3600) * dt * 18;
    simState.targetDistanceKm = Math.max(0, simState.targetDistanceKm - kmCovered);
    simState.odometer += kmCovered;

    if (simState.targetDistanceKm <= 0) {
      arriveAtWaypoint();
    }
  }

  if (simState.fuelLiters <= 0) triggerBreakdown("Sin Combustible", "El motor se detuvo por falta de combustible.");
  if (simState.engineTemp >= 125) triggerBreakdown("Motor Fundido", "Temperatura excesiva en el bloque del motor.");

  updateGps();
}

// Actualizar el Tablero TFT de Alta Resolución
function updateTFTDashboard() {
  const c = dashCtx;
  c.fillStyle = '#030712';
  c.fillRect(0, 0, 1024, 512);

  // Marco de fibra con acento cian
  c.strokeStyle = '#0284c7';
  c.lineWidth = 8;
  c.strokeRect(10, 10, 1004, 492);

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

  // Arco / Barra de RPM
  const rpmRatio = Math.min(1, simState.rpm / simState.maxRpm);
  c.fillStyle = '#1e293b';
  c.fillRect(80, 400, 864, 45);
  c.fillStyle = simState.rpm >= simState.redlineRpm ? '#ef4444' : '#38bdf8';
  c.fillRect(80, 400, 864 * rpmRatio, 45);

  // Métricas
  c.font = '40px "Share Tech Mono"';
  c.textAlign = 'right';
  c.fillStyle = simState.fuelLiters < 4 ? '#ef4444' : '#cbd5e1';
  c.fillText(`FUEL: ${simState.fuelLiters.toFixed(1)}L`, 960, 100);
  c.fillStyle = simState.engineTemp > 105 ? '#ef4444' : '#cbd5e1';
  c.fillText(`TEMP: ${Math.round(simState.engineTemp)}°C`, 960, 165);

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

// Parada de Asistencia
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
