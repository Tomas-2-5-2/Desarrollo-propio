// Motor Gráfico 3D Ultra: Ruta Panorámica de Montaña con Curvas, Relieve y Naturaleza
// Física de Trazada en Curva, Peraltes Reales, Pinos 3D y Desfiladero

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
  headlights: true,
  
  // Posición a lo largo del camino panorámico
  playerDistance: 0, // Progreso en metros
  laneOffset: 1.8,   // Desplazamiento lateral (-4.5 izq a +4.5 der)
  leanAngle: 0,      // Inclinación del piloto
  targetDistanceKm: 16.0,
  odometer: 0,
  onRumble: false,
  
  gearLimits: [0, 48, 80, 115, 145, 175, 205],
  gearMinSpeed: [0, 0, 20, 40, 65, 88, 110]
};

// ==========================================
// 1. CÁLCULO DE LA RUTA PANORÁMICA 3D (CURVAS Y RELIEVE)
// ==========================================

// Retorna la posición X (curvas) e Y (elevación) y ángulo para cualquier distancia Z
function getRoadPath(dist) {
  // Sucesión orgánica de curvas amplias y cerradas de montaña
  const curveA = Math.sin(dist * 0.009) * 36;
  const curveB = Math.cos(dist * 0.004) * 22;
  const curveC = Math.sin(dist * 0.022) * 12;
  const x = curveA + curveB + curveC;

  // Subidas, bajadas y crestas de montaña
  const hillA = Math.sin(dist * 0.007) * 15;
  const hillB = Math.cos(dist * 0.014) * 8;
  const y = hillA + hillB + 10;

  // Derivada matemática (tangente para orientar la moto y el asfalto)
  const delta = 1.0;
  const nextX = (Math.sin((dist + delta) * 0.009) * 36) + (Math.cos((dist + delta) * 0.004) * 22) + (Math.sin((dist + delta) * 0.022) * 12);
  const nextY = (Math.sin((dist + delta) * 0.007) * 15) + (Math.cos((dist + delta) * 0.014) * 8) + 10;
  
  const yaw = Math.atan2(nextX - x, delta);
  const pitch = -Math.atan2(nextY - y, delta);
  const roll = -(nextX - x) * 0.08; // Peralte bancado de la curva

  return { x, y, z: -dist, yaw, pitch, roll, curveIntensity: (nextX - x) };
}

// ==========================================
// 2. GENERADORES DE TEXTURAS PBR
// ==========================================

function createScenicAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Asfalto gris oscuro de montaña
  ctx.fillStyle = '#23272f';
  ctx.fillRect(0, 0, 1024, 1024);

  // Micrograno de piedra y asfalto
  const imgData = ctx.getImageData(0, 0, 1024, 1024);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 32;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  // Desgaste de huella de rodamiento
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, 'rgba(15, 18, 22, 0.4)');
  grad.addColorStop(0.3, 'rgba(10, 12, 16, 0.65)');
  grad.addColorStop(0.5, 'rgba(15, 18, 22, 0.2)');
  grad.addColorStop(0.7, 'rgba(10, 12, 16, 0.65)');
  grad.addColorStop(1, 'rgba(15, 18, 22, 0.4)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Línea divisoria central discontinua amarilla
  ctx.fillStyle = '#f59e0b';
  for (let y = 30; y < 1024; y += 180) {
    ctx.fillRect(504, y, 16, 110);
  }

  // Líneas blancas continuas laterales
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(60, 0, 16, 1024);
  ctx.fillRect(948, 0, 16, 1024);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createAlpineGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Verde alpino con matices de tierra
  ctx.fillStyle = '#2d4a22';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 1 + Math.random() * 3;
    ctx.fillStyle = Math.random() < 0.5 ? '#365928' : (Math.random() < 0.4 ? '#4a6b32' : '#233d1b');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(40, 40);
  return texture;
}

// ==========================================
// 3. ESCENA, CÁMARA Y RENDERIZADOR 3D
// ==========================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x38bdf8);
scene.fog = new THREE.FogExp2(0x93c5fd, 0.0018);

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
// 4. ILUMINACIÓN SOLAR DE MONTAÑA
// ==========================================

const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e3a1e, 0.9);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffedd5, 1.6);
sunLight.position.set(300, 500, -300);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// Faro delantero de la moto
const motoHeadlight = new THREE.SpotLight(0xfffae0, 3.5, 120, Math.PI / 4.8, 0.4, 1.2);
motoHeadlight.position.set(0, 1.2, -0.6);
const headlightTarget = new THREE.Object3D();
headlightTarget.position.set(0, 0.2, -45);
scene.add(headlightTarget);
motoHeadlight.target = headlightTarget;
scene.add(motoHeadlight);

// ==========================================
// 5. MUNDO PANORÁMICO: VALLES, PICOS NEVADOS Y LAGO
// ==========================================

// Gran terreno montañoso
const groundTexture = createAlpineGrassTexture();
const groundGeo = new THREE.PlaneGeometry(4500, 4500);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.9, metalness: 0.05 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -5;
scene.add(ground);

// Lago alpino en el fondo del valle (a la izquierda)
const waterGeo = new THREE.PlaneGeometry(800, 2400);
const waterMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.8 });
const lake = new THREE.Mesh(waterGeo, waterMat);
lake.rotation.x = -Math.PI / 2;
lake.position.set(-180, -3.5, -600);
scene.add(lake);

// Cúpula celeste
const skyGeo = new THREE.SphereGeometry(1800, 32, 20);
const skyMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, side: THREE.BackSide });
const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

// Cordillera alpina con picos nevados en 3D
const mountainsGroup = new THREE.Group();
const mtnGeo = new THREE.ConeGeometry(120, 240, 6);
const mtnRockMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, flatShading: true });
const snowCapGeo = new THREE.ConeGeometry(45, 90, 6);
const snowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });

for (let i = 0; i < 30; i++) {
  const m = new THREE.Group();
  const rock = new THREE.Mesh(mtnGeo, mtnRockMat);
  rock.position.y = 120;
  m.add(rock);

  const snow = new THREE.Mesh(snowCapGeo, snowMat);
  snow.position.y = 195;
  m.add(snow);

  const ang = (i / 30) * Math.PI * 2;
  const rad = 950 + Math.random() * 300;
  m.position.set(Math.cos(ang) * rad, 30 + Math.random() * 50, Math.sin(ang) * rad);
  m.scale.set(1.2 + Math.random() * 1.5, 1 + Math.random() * 1.4, 1.2 + Math.random() * 1.5);
  mountainsGroup.add(m);
}
scene.add(mountainsGroup);

// ==========================================
// 6. CARRETERA DINÁMICA CON CURVAS Y ELEVACIÓN REAL
// ==========================================

const ROAD_SEGMENTS = 85;
const SEGMENT_LENGTH = 14;
const roadGroup = new THREE.Group();

const asphaltTexture = createScenicAsphaltTexture();
const asphaltMat = new THREE.MeshStandardMaterial({
  map: asphaltTexture,
  roughness: 0.6,
  metalness: 0.15
});

const curbMatRed = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });
const curbMatWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });

const roadSegments = [];

for (let i = 0; i < ROAD_SEGMENTS; i++) {
  const seg = new THREE.Group();
  
  // Asfalto
  const aspGeo = new THREE.PlaneGeometry(12.4, SEGMENT_LENGTH);
  const aspMesh = new THREE.Mesh(aspGeo, asphaltMat);
  aspMesh.rotation.x = -Math.PI / 2;
  aspMesh.receiveShadow = true;
  seg.add(aspMesh);

  // Banquina rugosa (Rumble strips)
  const curbGeo = new THREE.BoxGeometry(0.65, 0.14, SEGMENT_LENGTH);
  const curbLeft = new THREE.Mesh(curbGeo, (i % 2 === 0) ? curbMatRed : curbMatWhite);
  curbLeft.position.set(-6.4, 0.06, 0);
  const curbRight = new THREE.Mesh(curbGeo, (i % 2 === 0) ? curbMatRed : curbMatWhite);
  curbRight.position.set(6.4, 0.06, 0);
  seg.add(curbLeft);
  seg.add(curbRight);

  // Guardarraíl de madera rústica alpina
  const fenceGeo = new THREE.BoxGeometry(0.18, 0.55, SEGMENT_LENGTH);
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
  const fenceLeft = new THREE.Mesh(fenceGeo, fenceMat);
  fenceLeft.position.set(-6.9, 0.55, 0);
  const fenceRight = new THREE.Mesh(fenceGeo, fenceMat);
  fenceRight.position.set(6.9, 0.55, 0);
  seg.add(fenceLeft);
  seg.add(fenceRight);

  roadGroup.add(seg);
  roadSegments.push({ group: seg, index: i });
}
scene.add(roadGroup);

// Pinos 3D y Rocas de Montaña a los Costados del Camino
const naturePropsGroup = new THREE.Group();

function createPineTree() {
  const tree = new THREE.Group();
  // Tronco
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.38, 4.5, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2.25;
  tree.add(trunk);

  // Follaje en capas cónicas verdes
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.85, flatShading: true });
  for (let c = 0; c < 3; c++) {
    const fGeo = new THREE.ConeGeometry(2.4 - c * 0.5, 3.2, 7);
    const foliage = new THREE.Mesh(fGeo, pineMat);
    foliage.position.y = 3.8 + c * 1.9;
    tree.add(foliage);
  }
  return tree;
}

const natureProps = [];
for (let i = 0; i < 40; i++) {
  const p = new THREE.Group();
  const tree = createPineTree();
  const scale = 1.0 + Math.random() * 0.9;
  tree.scale.set(scale, scale, scale);
  p.add(tree);

  // Roca al pie
  const rockGeo = new THREE.DodecahedronGeometry(1.2 + Math.random() * 1.5, 1);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, flatShading: true });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.position.set((Math.random() - 0.5) * 4, 0.5, (Math.random() - 0.5) * 4);
  p.add(rock);

  naturePropsGroup.add(p);
  natureProps.push({
    group: p,
    side: (i % 2 === 0 ? 1 : -1),
    lateralDist: 10 + Math.random() * 8,
    distOffset: i * 32
  });
}
scene.add(naturePropsGroup);

// ==========================================
// 7. TRÁFICO DINÁMICO EN LA RUTA CON CURVAS
// ==========================================

const trafficGroup = new THREE.Group();
const vehicles = [
  createDetailedVehicle('truck', 0x991b1b, -2.6, 120),
  createDetailedVehicle('car', 0x2563eb, -2.6, 280),
  createDetailedVehicle('pickup', 0xd97706, 2.4, 70)
];
vehicles.forEach(v => trafficGroup.add(v.mesh));
scene.add(trafficGroup);

function createDetailedVehicle(type, colorHex, laneOffset, initialRelDist) {
  const group = new THREE.Group();
  const isTruck = type === 'truck';
  const w = isTruck ? 2.8 : 2.0;
  const h = isTruck ? 3.6 : 1.5;
  const l = isTruck ? 8.5 : 4.4;

  const bodyGeo = new THREE.BoxGeometry(w, h, l);
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.5, roughness: 0.3 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = h / 2 + 0.38;
  body.castShadow = true;
  group.add(body);

  const glassGeo = new THREE.BoxGeometry(w * 0.92, h * 0.42, l * 0.38);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, h * 0.76, l * 0.15);
  group.add(glass);

  // Ruedas
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
  [[-w/2, 0.42, -l*0.3], [w/2, 0.42, -l*0.3], [-w/2, 0.42, l*0.3], [w/2, 0.42, l*0.3]].forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.position.set(...pos);
    group.add(wheel);
  });

  // Luces
  const lGeo = new THREE.BoxGeometry(0.4, 0.22, 0.1);
  const frontLight = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
  const rearLight = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const fl1 = new THREE.Mesh(lGeo, frontLight); fl1.position.set(-w*0.38, 0.85, -l/2); group.add(fl1);
  const fl2 = new THREE.Mesh(lGeo, frontLight); fl2.position.set(w*0.38, 0.85, -l/2); group.add(fl2);
  const rl1 = new THREE.Mesh(lGeo, rearLight);  rl1.position.set(-w*0.38, 0.85, l/2);  group.add(rl1);
  const rl2 = new THREE.Mesh(lGeo, rearLight);  rl2.position.set(w*0.38, 0.85, l/2);  group.add(rl2);

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
// 8. CABINA 3D HIPERREALISTA CON GUANTES DEL PILOTO
// ==========================================

const cockpitGroup = new THREE.Group();

// Manillar en aleación
const barMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
const barGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.92, 16);
barGeo.rotateZ(Math.PI / 2);
const handlebar = new THREE.Mesh(barGeo, barMat);
handlebar.position.set(0, -0.30, -0.58);
cockpitGroup.add(handlebar);

// Puños
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

// Guantes de cuero 3D
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.2 });
const armorMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 });

function createRiderHand(isLeft) {
  const hand = new THREE.Group();
  const dir = isLeft ? -1 : 1;

  const armGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.45, 14);
  const arm = new THREE.Mesh(armGeo, gloveMat);
  arm.position.set(0, -0.18, 0.22);
  arm.rotation.x = Math.PI / 3.2;
  hand.add(arm);

  const palmGeo = new THREE.BoxGeometry(0.075, 0.05, 0.08);
  const palm = new THREE.Mesh(palmGeo, gloveMat);
  hand.add(palm);

  const armorGeo = new THREE.BoxGeometry(0.065, 0.02, 0.04);
  const armor = new THREE.Mesh(armorGeo, armorMat);
  armor.position.set(0, 0.028, -0.01);
  hand.add(armor);

  const fingerGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.07, 10);
  fingerGeo.rotateZ(Math.PI / 2);
  const finger = new THREE.Mesh(fingerGeo, gloveMat);
  finger.position.set(0, -0.02, -0.03);
  hand.add(finger);

  hand.position.set(dir * 0.38, -0.30, -0.58);
  return hand;
}

cockpitGroup.add(createRiderHand(true));
cockpitGroup.add(createRiderHand(false));

// Pantalla TFT HD
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

// Parabrisas Touring
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

camera.add(cockpitGroup);
scene.add(camera);

// ==========================================
// 9. TECLADO Y CONTROLES
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

btnIgnite.addEventListener('click', () => {
  startModal.classList.remove('active');
  window.soundEngine.start();
  simState.active = true;
  simState.paused = false;
  lastTime = performance.now();
  requestAnimationFrame(scenicLoop);
});

btnRespawn.addEventListener('click', () => {
  location.reload();
});

// ==========================================
// 10. BUCLE DE SIMULACIÓN Y TRAZADA EN CURVA
// ==========================================

let lastTime = performance.now();

function scenicLoop(now) {
  const dt = Math.min(0.08, (now - lastTime) / 1000);
  lastTime = now;

  if (simState.active && !simState.paused) {
    updateScenicPhysics(dt);
  }

  updateTFTDashboard();
  renderer.render(scene, camera);

  if (simState.active) {
    requestAnimationFrame(scenicLoop);
  }
}

function updateScenicPhysics(dt) {
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

  // Girar la moto e inclinar (Contramanillar)
  if (keys.steerLeft) {
    simState.laneOffset = Math.max(-5.4, simState.laneOffset - (7.5 * dt));
    simState.leanAngle = Math.max(-0.45, simState.leanAngle - 1.4 * dt);
  } else if (keys.steerRight) {
    simState.laneOffset = Math.min(5.4, simState.laneOffset + (7.5 * dt));
    simState.leanAngle = Math.min(0.45, simState.leanAngle + 1.4 * dt);
  } else {
    simState.leanAngle *= 0.88;
  }

  // Avance del jugador en la ruta
  const speedMps = (simState.speed / 3.6);
  simState.playerDistance += speedMps * dt;

  // Punto actual de la carretera donde está el piloto
  const currentPath = getRoadPath(simState.playerDistance);

  // Fuerza centrífuga en curva: si vas rápido, te tira hacia afuera
  const lateralForce = currentPath.curveIntensity * (simState.speed / simState.maxSpeed) * 3.8;
  simState.laneOffset += lateralForce * dt;

  // Detección de banquina
  simState.onRumble = (Math.abs(simState.laneOffset) > 4.8);

  // POSICIÓN Y ORIENTACIÓN DE LA CÁMARA (VISTA DEL PILOTO)
  const normX = Math.cos(currentPath.yaw) * simState.laneOffset;
  const normZ = -Math.sin(currentPath.yaw) * simState.laneOffset;

  const vibMagnitude = (simState.rpm / simState.maxRpm) * 0.007 + (simState.onRumble ? 0.03 : 0);
  camera.position.x = currentPath.x + normX + (Math.random() - 0.5) * vibMagnitude;
  camera.position.y = currentPath.y + 1.48 + (Math.random() - 0.5) * vibMagnitude;
  camera.position.z = currentPath.z + normZ;

  // Inclinación giroscópica + peralte real de la curva
  camera.rotation.set(0, 0, 0);
  camera.rotation.y = currentPath.yaw;
  camera.rotation.x = currentPath.pitch;
  camera.rotation.z = -simState.leanAngle * 0.75 + currentPath.roll;

  // ACTUALIZAR CARRETERA DINÁMICA CON CURVAS REALES EN 3D
  roadSegments.forEach(item => {
    // Distancia de cada segmento relativa al jugador
    const segDist = Math.floor(simState.playerDistance / SEGMENT_LENGTH) * SEGMENT_LENGTH + (item.index * SEGMENT_LENGTH);
    const p = getRoadPath(segDist);
    
    item.group.position.set(p.x, p.y, p.z);
    item.group.rotation.set(0, 0, 0);
    item.group.rotation.y = p.yaw;
    item.group.rotation.x = p.pitch;
    item.group.rotation.z = p.roll;
  });

  // ACTUALIZAR PINOS Y ROCAS A LO LARGO DE LAS CURVAS
  natureProps.forEach(prop => {
    const pDist = Math.floor(simState.playerDistance / 50) * 50 + prop.distOffset;
    const p = getRoadPath(pDist);
    
    // Desplazar hacia el lado de la ruta
    const nx = Math.cos(p.yaw) * (prop.side * prop.lateralDist);
    const nz = -Math.sin(p.yaw) * (prop.side * prop.lateralDist);

    prop.group.position.set(p.x + nx, p.y - 0.2, p.z + nz);
  });

  // ACTUALIZAR TRÁFICO SIGUIENDO LAS CURVAS 3D
  vehicles.forEach(v => {
    // Si viene de frente o va adelante
    if (v.laneOffset < 0) {
      v.distAhead -= ((v.speed + simState.speed) / 3.6) * dt;
    } else {
      v.distAhead += ((v.speed - simState.speed) / 3.6) * dt;
    }

    const vWorldDist = simState.playerDistance + v.distAhead;
    const vp = getRoadPath(vWorldDist);
    const vnx = Math.cos(vp.yaw) * v.laneOffset;
    const vnz = -Math.sin(vp.yaw) * v.laneOffset;

    v.mesh.position.set(vp.x + vnx, vp.y, vp.z + vnz);
    v.mesh.rotation.set(0, 0, 0);
    v.mesh.rotation.y = vp.yaw + (v.laneOffset < 0 ? Math.PI : 0);

    // Sonido Doppler
    if (v.distAhead < 6 && v.distAhead > -6 && !v.passed && v.laneOffset < 0) {
      window.soundEngine.playPassWhoosh();
      v.passed = true;
    }

    // Colisión
    const distToPlayer = Math.hypot(camera.position.x - v.mesh.position.x, camera.position.z - v.mesh.position.z);
    if (distToPlayer < 3.0) {
      simState.speed = Math.max(0, simState.speed - 50);
      simState.bikeHealth = Math.max(0, simState.bikeHealth - 35);
      window.soundEngine.playTireScreech();
      if (simState.bikeHealth <= 0) {
        triggerBreakdown("Accidente en Curva", "Colisión contra otro vehículo en una curva cerrada.");
      }
    }

    // Respawn adelante o atrás
    if (v.distAhead < -30 || v.distAhead > 550) {
      v.distAhead = 350 + Math.random() * 200;
      v.passed = false;
    }
  });

  // Temperatura y audio
  if (simState.rpm > simState.redlineRpm) {
    simState.engineTemp = Math.min(130, simState.engineTemp + 4.5 * dt);
  } else {
    const cooling = (simState.speed / 100) * 1.6;
    simState.engineTemp = Math.max(78, simState.engineTemp + (0.45 - cooling) * dt);
  }

  window.soundEngine.update(simState.rpm, simState.maxRpm, simState.speed, simState.maxSpeed, simState.onRumble);

  // Progreso hacia la próxima parada
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

function updateTFTDashboard() {
  const c = dashCtx;
  c.fillStyle = '#030712';
  c.fillRect(0, 0, 1024, 512);

  c.strokeStyle = '#0284c7';
  c.lineWidth = 8;
  c.strokeRect(10, 10, 1004, 492);

  c.fillStyle = simState.gear === 0 ? '#22c55e' : '#38bdf8';
  c.font = '700 160px "Chakra Petch", monospace';
  c.textAlign = 'center';
  const gText = simState.gear === 0 ? 'N' : simState.gear;
  c.fillText(gText, 200, 240);
  c.font = '36px "Chakra Petch"';
  c.fillStyle = '#64748b';
  c.fillText('MARCHA', 200, 310);

  c.fillStyle = '#ffffff';
  c.font = '700 210px "Share Tech Mono", monospace';
  c.fillText(Math.round(simState.speed).toString().padStart(3, ' '), 560, 260);
  c.font = '42px "Chakra Petch"';
  c.fillStyle = '#38bdf8';
  c.fillText('KM / H', 560, 330);

  const rpmRatio = Math.min(1, simState.rpm / simState.maxRpm);
  c.fillStyle = '#1e293b';
  c.fillRect(80, 400, 864, 45);
  c.fillStyle = simState.rpm >= simState.redlineRpm ? '#ef4444' : '#38bdf8';
  c.fillRect(80, 400, 864 * rpmRatio, 45);

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
