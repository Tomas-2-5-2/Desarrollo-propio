// Motor Gráfico 3D Ultra: Carretera Continua en Cinta 3D, Cabina Realista con Tanque y Paisaje Integrado

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
  
  // Posición a lo largo del camino
  playerDistance: 0, // Progreso en metros
  laneOffset: 1.8,   // -4.5 izq a +4.5 der
  leanAngle: 0,      // Inclinación del piloto
  targetDistanceKm: 16.0,
  odometer: 0,
  onRumble: false,
  
  gearLimits: [0, 48, 80, 115, 145, 175, 205],
  gearMinSpeed: [0, 0, 20, 40, 65, 88, 110]
};

// ==========================================
// 1. TRAYECTORIA CONTINUA Y SUAVE DE LA RUTA
// ==========================================

function getRoadPoint(dist) {
  // Curvas de montaña fluidas y armoniosas
  const x = Math.sin(dist * 0.007) * 28 + Math.cos(dist * 0.003) * 16;
  // Desniveles suaves sobre el terreno (sin flotar en el vacío)
  const y = Math.sin(dist * 0.005) * 3.5 + Math.cos(dist * 0.01) * 1.5 + 0.2;
  const z = -dist;

  // Tangente y orientación
  const d = 1.0;
  const nextX = Math.sin((dist + d) * 0.007) * 28 + Math.cos((dist + d) * 0.003) * 16;
  const nextY = Math.sin((dist + d) * 0.005) * 3.5 + Math.cos((dist + d) * 0.01) * 1.5 + 0.2;

  const dx = nextX - x;
  const dy = nextY - y;

  const yaw = Math.atan2(dx, d);
  const pitch = -Math.atan2(dy, d);
  const roll = -dx * 0.06; // Peralte sutil de curva

  return { x, y, z, yaw, pitch, roll, curveRate: dx };
}

// ==========================================
// 2. GENERADORES DE TEXTURAS PROCEDURALES PBR
// ==========================================

function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Base de asfalto gris grafito
  ctx.fillStyle = '#262930';
  ctx.fillRect(0, 0, 1024, 1024);

  // Micrograno
  const imgData = ctx.getImageData(0, 0, 1024, 1024);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  // Huellas de neumático
  ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
  ctx.fillRect(200, 0, 220, 1024);
  ctx.fillRect(604, 0, 220, 1024);

  // Doble línea continua amarilla reflectante
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(502, 0, 8, 1024);
  ctx.fillRect(514, 0, 8, 1024);

  // Líneas blancas laterales
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(40, 0, 14, 1024);
  ctx.fillRect(970, 0, 14, 1024);

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

  ctx.fillStyle = '#2f4f24';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() < 0.5 ? '#3b612e' : '#26421c';
    ctx.fillRect(x, y, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(50, 50);
  return texture;
}

// ==========================================
// 3. ESCENA 3D, CÁMARA Y RENDERIZADOR
// ==========================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x70a5d8);
scene.fog = new THREE.FogExp2(0x9cc3e8, 0.0016);

let width = window.innerWidth;
let height = window.innerHeight;

const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 3500);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
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
// 4. ILUMINACIÓN SOLAR
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
// 5. PAISAJE NATURAL: TERRENO Y CORDILLERA
// ==========================================

// Gran pradera montañosa firmemente en el suelo
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

// ==========================================
// 6. CARRETERA CONTINUA EN CINTA 3D (SEAMLESS RIBBON)
// ==========================================

// Construimos una sola geometría continua de asfalto y banquina unificada
const RIBBON_POINTS = 140;
const POINT_STEP = 3.5; // Distancia entre vértices de la cinta (metros)
const ROAD_WIDTH = 11.0;

const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, (RIBBON_POINTS - 1) * POINT_STEP, 1, RIBBON_POINTS - 1);
const asphaltMat = new THREE.MeshStandardMaterial({
  map: createAsphaltTexture(),
  roughness: 0.65,
  metalness: 0.15,
  side: THREE.DoubleSide
});
const roadMesh = new THREE.Mesh(roadGeo, asphaltMat);
scene.add(roadMesh);

// Guardarraíl metálico continuo izquierdo y derecho
const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 });
const railLeftGeo = new THREE.BufferGeometry();
const railRightGeo = new THREE.BufferGeometry();

// Preparamos los buffers de vértices para actualizar cada cuadro
const roadPosAttr = roadGeo.attributes.position;
roadPosAttr.setUsage(THREE.DynamicDrawUsage);

// ==========================================
// 7. VEGETACIÓN Y PINOS ALPINOS
// ==========================================

const pineGroup = new THREE.Group();

function createPine() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 4, 7),
    new THREE.MeshStandardMaterial({ color: 0x3d2616, roughness: 0.9 })
  );
  trunk.position.y = 2;
  g.add(trunk);

  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x193b2a, roughness: 0.8, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(2.3 - i * 0.45, 3.2, 7), foliageMat);
    f.position.y = 3.5 + i * 1.8;
    g.add(f);
  }
  return g;
}

const pines = [];
for (let i = 0; i < 45; i++) {
  const p = createPine();
  const scale = 1.0 + Math.random() * 0.8;
  p.scale.set(scale, scale, scale);
  pineGroup.add(p);
  pines.push({
    mesh: p,
    side: (i % 2 === 0 ? 1 : -1),
    offsetLateral: 8.5 + Math.random() * 9,
    distAhead: i * 18
  });
}
scene.add(pineGroup);

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

  // Ruedas
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
// 9. CABINA REALISTA CON TANQUE DE MOTO Y GUANTES 3D
// ==========================================

const cockpitGroup = new THREE.Group();

// A. Tanque de Combustible (ancla visual de la moto)
const tankGeo = new THREE.BoxGeometry(0.34, 0.28, 0.75);
const tankMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.6, roughness: 0.25 });
const tank = new THREE.Mesh(tankGeo, tankMat);
tank.position.set(0, -0.42, -0.32);
tank.rotation.x = Math.PI / 8;
cockpitGroup.add(tank);

// Tapa del tanque cromada
const capGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.015, 16);
const capMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });
const cap = new THREE.Mesh(capGeo, capMat);
cap.position.set(0, -0.26, -0.28);
cockpitGroup.add(cap);

// B. Plaqueta de dirección / Triple Clamp
const clampGeo = new THREE.BoxGeometry(0.24, 0.04, 0.08);
const clampMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
const clamp = new THREE.Mesh(clampGeo, clampMat);
clamp.position.set(0, -0.22, -0.52);
cockpitGroup.add(clamp);

// C. Manillar
const barGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.90, 16);
barGeo.rotateZ(Math.PI / 2);
const handlebar = new THREE.Mesh(barGeo, clampMat);
handlebar.position.set(0, -0.20, -0.54);
cockpitGroup.add(handlebar);

// Puños
const gripMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95 });
const gripGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 14);
gripGeo.rotateZ(Math.PI / 2);
const leftGrip = new THREE.Mesh(gripGeo, gripMat); leftGrip.position.set(-0.36, -0.20, -0.54);
const rightGrip = new THREE.Mesh(gripGeo, gripMat); rightGrip.position.set(0.36, -0.20, -0.54);
cockpitGroup.add(leftGrip);
cockpitGroup.add(rightGrip);

// Manetas
const leverMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.95, roughness: 0.15 });
const leverGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.17, 10);
leverGeo.rotateZ(Math.PI / 3);
const leftLever = new THREE.Mesh(leverGeo, leverMat); leftLever.position.set(-0.30, -0.18, -0.57);
const rightLever = new THREE.Mesh(leverGeo, leverMat); rightLever.rotation.y = Math.PI; rightLever.position.set(0.30, -0.18, -0.57);
cockpitGroup.add(leftLever);
cockpitGroup.add(rightLever);

// D. Manos del Piloto con Guantes 3D
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.2 });
const armorMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 });

function createHand(isLeft) {
  const h = new THREE.Group();
  const dir = isLeft ? -1 : 1;

  // Brazo
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 12), gloveMat);
  arm.position.set(0, -0.16, 0.18);
  arm.rotation.x = Math.PI / 3.4;
  h.add(arm);

  // Mano
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.075), gloveMat);
  h.add(palm);

  const armor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.018, 0.035), armorMat);
  armor.position.set(0, 0.024, -0.01);
  h.add(armor);

  h.position.set(dir * 0.36, -0.20, -0.54);
  return h;
}
cockpitGroup.add(createHand(true));
cockpitGroup.add(createHand(false));

// E. Pantalla Digital TFT
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
dashMesh.position.set(0, -0.11, -0.60);
dashMesh.rotation.x = -Math.PI / 6;
cockpitGroup.add(dashMesh);

camera.add(cockpitGroup);
scene.add(camera);

// ==========================================
// 10. CONTROLES Y TECLADO
// ==========================================

const keys = { throttle: false, brake: false, steerLeft: false, steerRight: false };

window.addEventListener('keydown', (e) => {
  if (['KeyW', 'ArrowUp'].includes(e.code)) keys.throttle = true;
  if (['KeyS', 'ArrowDown'].includes(e.code)) keys.brake = true;
  if (['KeyA', 'ArrowLeft'].includes(e.code)) keys.steerLeft = true;
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
// 11. BUCLE DE FÍSICA Y ACTUALIZACIÓN CONTINUA
// ==========================================

let lastTime = performance.now();

function gameLoop(now) {
  const dt = Math.min(0.08, (now - lastTime) / 1000);
  lastTime = now;

  if (simState.active && !simState.paused) {
    updatePhysics(dt);
  }

  updateContinuousRoadMesh();
  updateTFT();
  renderer.render(scene, camera);

  if (simState.active) {
    requestAnimationFrame(gameLoop);
  }
}

function updatePhysics(dt) {
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

  // Giro / Contramanillar
  if (keys.steerLeft) {
    simState.laneOffset = Math.max(-4.8, simState.laneOffset - (6.8 * dt));
    simState.leanAngle = Math.max(-0.42, simState.leanAngle - 1.4 * dt);
  } else if (keys.steerRight) {
    simState.laneOffset = Math.min(4.8, simState.laneOffset + (6.8 * dt));
    simState.leanAngle = Math.min(0.42, simState.leanAngle + 1.4 * dt);
  } else {
    simState.leanAngle *= 0.88;
  }

  // Avance del jugador
  const speedMps = simState.speed / 3.6;
  simState.playerDistance += speedMps * dt;

  // Trayectoria actual en la posición del jugador
  const curP = getRoadPoint(simState.playerDistance);

  // Fuerza centrífuga en curva
  simState.laneOffset += curP.curveRate * (simState.speed / simState.maxSpeed) * 3.2 * dt;
  simState.onRumble = (Math.abs(simState.laneOffset) > 4.2);

  // Posición de la Cámara
  const normX = Math.cos(curP.yaw) * simState.laneOffset;
  const normZ = -Math.sin(curP.yaw) * simState.laneOffset;

  const vib = (simState.rpm / simState.maxRpm) * 0.006 + (simState.onRumble ? 0.025 : 0);
  camera.position.x = curP.x + normX + (Math.random() - 0.5) * vib;
  camera.position.y = curP.y + 1.42 + (Math.random() - 0.5) * vib;
  camera.position.z = curP.z + normZ;

  camera.rotation.set(0, 0, 0);
  camera.rotation.y = curP.yaw;
  camera.rotation.x = curP.pitch;
  camera.rotation.z = -simState.leanAngle * 0.72 + curP.roll;

  // Actualizar Pinos a los lados de la ruta
  pines.forEach(p => {
    let propDist = simState.playerDistance + p.distAhead;
    const pt = getRoadPoint(propDist);

    const nx = Math.cos(pt.yaw) * (p.side * p.offsetLateral);
    const nz = -Math.sin(pt.yaw) * (p.side * p.offsetLateral);

    p.mesh.position.set(pt.x + nx, pt.y, pt.z + nz);

    p.distAhead -= (speedMps * dt);
    if (p.distAhead < -20) {
      p.distAhead += (pines.length * 18);
    }
  });

  // Actualizar Tráfico 3D
  vehicles.forEach(v => {
    if (v.laneOffset < 0) {
      v.distAhead -= ((v.speed + simState.speed) / 3.6) * dt;
    } else {
      v.distAhead += ((v.speed - simState.speed) / 3.6) * dt;
    }

    const vp = getRoadPoint(simState.playerDistance + v.distAhead);
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

  // Audio y Temperatura
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

// ACTUALIZACIÓN DE LA MALLA CONTINUA DE ASFALTO (CERO CORTES O ESCALONES)
function updateContinuousRoadMesh() {
  const positions = roadPosAttr.array;
  const halfW = ROAD_WIDTH / 2;

  for (let i = 0; i < RIBBON_POINTS; i++) {
    const sampleDist = simState.playerDistance + (i * POINT_STEP) - 10;
    const p = getRoadPoint(sampleDist);

    // Vector perpendicular al rumbo de la ruta
    const nx = Math.cos(p.yaw);
    const nz = -Math.sin(p.yaw);

    // Vértice izquierdo
    const idxL = i * 2 * 3;
    positions[idxL]     = p.x - (nx * halfW);
    positions[idxL + 1] = p.y + 0.04;
    positions[idxL + 2] = p.z - (nz * halfW);

    // Vértice derecho
    const idxR = (i * 2 + 1) * 3;
    positions[idxR]     = p.x + (nx * halfW);
    positions[idxR + 1] = p.y + 0.04;
    positions[idxR + 2] = p.z + (nz * halfW);
  }

  roadPosAttr.needsUpdate = true;
}

function updateTFT() {
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
