// Motor de Simulación 3D Real (Three.js WebGL Engine)
// Física de Marchas, Cockpit Tridimensional, Iluminación Dinámica y Tráfico

const container = document.getElementById('webgl-container');

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

// Configuración de la Simulación
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
  
  // Posición y Física
  leanAngle: 0,
  roadX: 2.5, // 0 = centro, -5 = carril izq, +5 = banquina der
  roadCurve: 0,
  targetDistanceKm: 15.0,
  odometer: 0,
  onRumble: false,
  
  gearLimits: [0, 48, 80, 115, 145, 175, 205],
  gearMinSpeed: [0, 0, 20, 40, 65, 88, 110]
};

// --- ESCENA 3D (THREE.JS) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6b8fae);
scene.fog = new THREE.FogExp2(0x7d9db8, 0.0022);

const camera = new THREE.PerspectiveCamera(65, 960 / 600, 0.1, 2500);
camera.position.set(0, 1.45, 0); // Altura de los ojos del piloto sobre la moto

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(960, 600);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- ILUMINACIÓN 3D ---
const hemiLight = new THREE.HemisphereLight(0xfffaed, 0x3d4b58, 0.85);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffae0, 1.35);
sunLight.position.set(200, 350, -400);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
scene.add(sunLight);

// Faro delantero de la moto (SpotLight 3D real)
const motoHeadlight = new THREE.SpotLight(0xfffae0, 2.5, 90, Math.PI / 5, 0.4, 1.2);
motoHeadlight.position.set(0, 1.2, -0.5);
const headlightTarget = new THREE.Object3D();
headlightTarget.position.set(0, 0.5, -30);
scene.add(headlightTarget);
motoHeadlight.target = headlightTarget;
scene.add(motoHeadlight);

// --- ELEMENTOS DEL MUNDO 3D ---
// 1. Suelo / Terreno circundante
const groundGeo = new THREE.PlaneGeometry(3000, 3000);
const groundMat = new THREE.MeshLambertMaterial({ color: 0x5a4d38 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);

// 2. Montañas 3D en el horizonte
const mountainsGroup = new THREE.Group();
const mtnGeo = new THREE.ConeGeometry(80, 140, 6);
const mtnMat = new THREE.MeshLambertMaterial({ color: 0x384a5c, flatShading: true });
for (let i = 0; i < 28; i++) {
  const m = new THREE.Mesh(mtnGeo, mtnMat);
  const ang = (i / 28) * Math.PI * 2;
  const rad = 750 + Math.random() * 200;
  m.position.set(Math.cos(ang) * rad, 50 + Math.random() * 30, Math.sin(ang) * rad);
  m.scale.set(1 + Math.random() * 1.5, 1 + Math.random() * 1.2, 1 + Math.random() * 1.5);
  mountainsGroup.add(m);
}
scene.add(mountainsGroup);

// 3. Sistema de Carretera Infinita 3D
const ROAD_SEGMENTS = 60;
const SEGMENT_LENGTH = 15;
const roadGroup = new THREE.Group();

const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.85 });
const curbMatRed = new THREE.MeshBasicMaterial({ color: 0xb91c1c });
const curbMatWhite = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 });
const stripeMatYellow = new THREE.MeshBasicMaterial({ color: 0xeab308 });
const stripeMatWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });

const roadSegments = [];

for (let i = 0; i < ROAD_SEGMENTS; i++) {
  const seg = new THREE.Group();
  
  // Asfalto (ancho 12 metros)
  const aspGeo = new THREE.PlaneGeometry(12, SEGMENT_LENGTH);
  const aspMesh = new THREE.Mesh(aspGeo, asphaltMat);
  aspMesh.rotation.x = -Math.PI / 2;
  seg.add(aspMesh);

  // Línea doble amarilla central
  const stripeGeo = new THREE.PlaneGeometry(0.18, SEGMENT_LENGTH * 0.6);
  const stripe1 = new THREE.Mesh(stripeGeo, stripeMatYellow);
  stripe1.rotation.x = -Math.PI / 2;
  stripe1.position.set(-0.15, 0.02, 0);
  const stripe2 = new THREE.Mesh(stripeGeo, stripeMatYellow);
  stripe2.rotation.x = -Math.PI / 2;
  stripe2.position.set(0.15, 0.02, 0);
  seg.add(stripe1);
  seg.add(stripe2);

  // Líneas blancas laterales
  const whiteEdgeGeo = new THREE.PlaneGeometry(0.2, SEGMENT_LENGTH);
  const leftEdge = new THREE.Mesh(whiteEdgeGeo, stripeMatWhite);
  leftEdge.rotation.x = -Math.PI / 2;
  leftEdge.position.set(-5.6, 0.02, 0);
  const rightEdge = new THREE.Mesh(whiteEdgeGeo, stripeMatWhite);
  rightEdge.rotation.x = -Math.PI / 2;
  rightEdge.position.set(5.6, 0.02, 0);
  seg.add(leftEdge);
  seg.add(rightEdge);

  // Banquina rugosa (Rumble strips)
  const curbGeo = new THREE.BoxGeometry(0.5, 0.08, SEGMENT_LENGTH);
  const curbLeft = new THREE.Mesh(curbGeo, (i % 2 === 0) ? curbMatRed : curbMatWhite);
  curbLeft.position.set(-6.1, 0.04, 0);
  const curbRight = new THREE.Mesh(curbGeo, (i % 2 === 0) ? curbMatRed : curbMatWhite);
  curbRight.position.set(6.1, 0.04, 0);
  seg.add(curbLeft);
  seg.add(curbRight);

  seg.position.z = -i * SEGMENT_LENGTH;
  roadGroup.add(seg);
  roadSegments.push(seg);
}
scene.add(roadGroup);

// 4. Postes de tendido eléctrico 3D a la vera del camino
const poleGroup = new THREE.Group();
const poleGeo = new THREE.CylinderGeometry(0.22, 0.28, 9, 8);
const poleMat = new THREE.MeshLambertMaterial({ color: 0x3d2f21 });
const crossarmGeo = new THREE.BoxGeometry(3.5, 0.2, 0.2);
const crossarmMat = new THREE.MeshLambertMaterial({ color: 0x271e15 });

const poles = [];
for (let i = 0; i < 20; i++) {
  const p = new THREE.Group();
  const poleMesh = new THREE.Mesh(poleGeo, poleMat);
  poleMesh.position.y = 4.5;
  p.add(poleMesh);

  const crossarm = new THREE.Mesh(crossarmGeo, crossarmMat);
  crossarm.position.y = 8.2;
  p.add(crossarm);

  p.position.set(8.5, 0, -i * 45);
  poleGroup.add(p);
  poles.push(p);
}
scene.add(poleGroup);

// 5. Tráfico 3D (Vehículos que circulan en la ruta)
const trafficGroup = new THREE.Group();
const vehicles = [
  create3DVehicle('truck', 0x991b1b, -2.8, -120),
  create3DVehicle('car', 0x1e40af, -2.8, -260),
  create3DVehicle('pickup', 0xd97706, 2.5, -80)
];
vehicles.forEach(v => trafficGroup.add(v.mesh));
scene.add(trafficGroup);

function create3DVehicle(type, colorHex, x, z) {
  const group = new THREE.Group();
  const isTruck = type === 'truck';
  const w = isTruck ? 2.6 : 1.9;
  const h = isTruck ? 3.4 : 1.5;
  const l = isTruck ? 7.5 : 4.2;

  // Carrocería
  const bodyGeo = new THREE.BoxGeometry(w, h, l);
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4, metalness: 0.2 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = h / 2 + 0.35;
  body.castShadow = true;
  group.add(body);

  // Vidrios
  const glassGeo = new THREE.BoxGeometry(w * 0.95, h * 0.45, l * 0.4);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, h * 0.75, l * 0.15);
  group.add(glass);

  // Ruedas
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 12);
  const wheelMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  wheelGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [-w / 2, 0.38, -l * 0.3], [w / 2, 0.38, -l * 0.3],
    [-w / 2, 0.38, l * 0.3],  [w / 2, 0.38, l * 0.3]
  ];
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(...pos);
    group.add(wheel);
  });

  // Luces
  const lightGeo = new THREE.BoxGeometry(0.35, 0.2, 0.1);
  const frontLightMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
  const rearLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  const fl1 = new THREE.Mesh(lightGeo, frontLightMat); fl1.position.set(-w * 0.38, 0.8, -l / 2); group.add(fl1);
  const fl2 = new THREE.Mesh(lightGeo, frontLightMat); fl2.position.set(w * 0.38, 0.8, -l / 2); group.add(fl2);
  const rl1 = new THREE.Mesh(lightGeo, rearLightMat);  rl1.position.set(-w * 0.38, 0.8, l / 2);  group.add(rl1);
  const rl2 = new THREE.Mesh(lightGeo, rearLightMat);  rl2.position.set(w * 0.38, 0.8, l / 2);  group.add(rl2);

  group.position.set(x, 0, z);

  return {
    mesh: group,
    type: type,
    speed: isTruck ? 70 : 85,
    lane: x < 0 ? -1 : 1, // -1 = de frente, 1 = mismo sentido
    passed: false
  };
}

// 6. Cockpit 3D Tridimensional de la Moto (anclado a la cámara)
const cockpitGroup = new THREE.Group();

// Manillar en tubo 3D
const barMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
const barGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.85, 12);
barGeo.rotateZ(Math.PI / 2);
const handlebar = new THREE.Mesh(barGeo, barMat);
handlebar.position.set(0, -0.28, -0.55);
cockpitGroup.add(handlebar);

// Puños de goma
const gripMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.9 });
const gripGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.14, 12);
gripGeo.rotateZ(Math.PI / 2);
const leftGrip = new THREE.Mesh(gripGeo, gripMat);
leftGrip.position.set(-0.35, -0.28, -0.55);
const rightGrip = new THREE.Mesh(gripGeo, gripMat);
rightGrip.position.set(0.35, -0.28, -0.55);
cockpitGroup.add(leftGrip);
cockpitGroup.add(rightGrip);

// Manetas de freno y embrague (aluminio)
const leverMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
const leverGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8);
leverGeo.rotateZ(Math.PI / 3);
const leftLever = new THREE.Mesh(leverGeo, leverMat);
leftLever.position.set(-0.30, -0.25, -0.58);
const rightLever = new THREE.Mesh(leverGeo, leverMat);
rightLever.rotation.y = Math.PI;
rightLever.position.set(0.30, -0.25, -0.58);
cockpitGroup.add(leftLever);
cockpitGroup.add(rightLever);

// Pantalla / Tablero Digital en 3D
const dashScreenGeo = new THREE.BoxGeometry(0.26, 0.14, 0.02);
const dashScreenCanvas = document.createElement('canvas');
dashScreenCanvas.width = 512;
dashScreenCanvas.height = 256;
const dashScreenCtx = dashScreenCanvas.getContext('2d');
const dashTexture = new THREE.CanvasTexture(dashScreenCanvas);
const dashMat = new THREE.MeshBasicMaterial({ map: dashTexture });

const dashMesh = new THREE.Mesh(dashScreenGeo, dashMat);
dashMesh.position.set(0, -0.21, -0.62);
dashMesh.rotation.x = -Math.PI / 6;
cockpitGroup.add(dashMesh);

// Parabrisas transparente curvo
const shieldGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.40, 16, 1, true, 0, Math.PI);
const shieldMat = new THREE.MeshPhysicalMaterial({
  color: 0x93c5fd,
  transparent: true,
  opacity: 0.35,
  roughness: 0.1,
  metalness: 0.1,
  clearcoat: 1.0,
  side: THREE.DoubleSide
});
const windshield = new THREE.Mesh(shieldGeo, shieldMat);
windshield.position.set(0, -0.05, -0.68);
windshield.rotation.x = -Math.PI / 5;
windshield.rotation.y = Math.PI;
cockpitGroup.add(windshield);

// Espejos retrovisores
const mirrorHousingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
const mirrorGlassMat = new THREE.MeshBasicMaterial({ color: 0x1e3a5f });
const mirrorGeo = new THREE.BoxGeometry(0.12, 0.07, 0.02);

function addMirror(x, y, z) {
  const m = new THREE.Group();
  const housing = new THREE.Mesh(mirrorGeo, mirrorHousingMat);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.06), mirrorGlassMat);
  glass.position.z = 0.012;
  m.add(housing);
  m.add(glass);
  m.position.set(x, y, z);
  m.rotation.y = (x < 0 ? 0.3 : -0.3);
  cockpitGroup.add(m);
}
addMirror(-0.42, -0.15, -0.58);
addMirror(0.42, -0.15, -0.58);

camera.add(cockpitGroup);
scene.add(camera);

// --- TECLADO Y MANDOS ---
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

// Iniciar
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

// Bucle de Render 3D (60 FPS)
let lastTime = performance.now();

function game3DLoop(now) {
  const dt = Math.min(0.08, (now - lastTime) / 1000);
  lastTime = now;

  if (simState.active && !simState.paused) {
    update3DPhysics(dt);
  }

  updateDashboardTexture();
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
      simState.rpm = Math.min(simState.maxRpm, simState.rpm + 6500 * dt);
    } else {
      const idealRpm = (simState.rpm >= 3800 && simState.rpm <= 7800);
      const accelFactor = idealRpm ? 1.3 : 0.75;
      
      if (simState.speed < minGearSpeed - 15) {
        simState.speed = Math.max(0, simState.speed + 5 * dt);
      } else {
        const topRatio = Math.max(0, 1 - (simState.speed / maxGearSpeed));
        simState.speed = Math.min(simState.maxSpeed, simState.speed + (30 * accelFactor * topRatio) * dt);
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
    simState.speed = Math.max(0, simState.speed - 54 * dt);
    if (simState.speed > 55 && Math.random() < 0.06) {
      window.soundEngine.playTireScreech();
    }
  }

  // Dirección y Contramanillar 3D
  if (keys.steerLeft) {
    simState.roadX = Math.max(-5.5, simState.roadX - (7.5 * dt));
    simState.leanAngle = Math.max(-0.35, simState.leanAngle - 1.2 * dt);
  } else if (keys.steerRight) {
    simState.roadX = Math.min(5.5, simState.roadX + (7.5 * dt));
    simState.leanAngle = Math.min(0.35, simState.leanAngle + 1.2 * dt);
  } else {
    simState.leanAngle *= 0.88;
  }

  // Curvas suaves de carretera
  simState.roadCurve = Math.sin(performance.now() * 0.0006) * 0.45;
  simState.roadX += (simState.roadCurve * (simState.speed / simState.maxSpeed) * 3.5) * dt;

  // Detección de banquina rugosa
  simState.onRumble = (Math.abs(simState.roadX) > 4.8);

  // Cámara 3D (Piloto sobre la moto)
  const vibMagnitude = (simState.rpm / simState.maxRpm) * 0.008 + (simState.onRumble ? 0.025 : 0);
  camera.position.x = simState.roadX + (Math.random() - 0.5) * vibMagnitude;
  camera.position.y = 1.45 + (Math.random() - 0.5) * vibMagnitude;
  camera.rotation.z = -simState.leanAngle * 0.65; // Inclinación giroscópica real
  camera.rotation.y = -simState.roadCurve * 0.15;

  // Movimiento de la carretera en 3D
  const worldSpeed = (simState.speed / 3.6) * dt; // metros por segundo
  roadSegments.forEach(seg => {
    seg.position.z += worldSpeed;
    if (seg.position.z > SEGMENT_LENGTH) {
      seg.position.z -= ROAD_SEGMENTS * SEGMENT_LENGTH;
    }
  });

  // Movimiento de postes
  poles.forEach(p => {
    p.position.z += worldSpeed;
    if (p.position.z > 20) {
      p.position.z -= 20 * 45;
    }
  });

  // Movimiento de tráfico 3D
  vehicles.forEach(v => {
    const vSpeedMps = (v.speed / 3.6) * dt;
    if (v.lane < 0) {
      // De frente
      v.mesh.position.z += (worldSpeed + vSpeedMps);
    } else {
      // Mismo sentido
      v.mesh.position.z += (worldSpeed - vSpeedMps);
    }

    if (v.mesh.position.z > 5 && !v.passed && v.lane < 0) {
      window.soundEngine.playPassWhoosh();
      v.passed = true;
    }

    // Colisión 3D
    const distToBike = Math.hypot(camera.position.x - v.mesh.position.x, camera.position.z - v.mesh.position.z);
    if (distToBike < 2.8) {
      simState.speed = Math.max(0, simState.speed - 50);
      simState.bikeHealth = Math.max(0, simState.bikeHealth - 35);
      window.soundEngine.playTireScreech();
      if (simState.bikeHealth <= 0) {
        triggerBreakdown("Accidente de Tránsito", "Colisión violenta contra otro vehículo.");
      }
    }

    // Respawn
    if (v.mesh.position.z > 30 || v.mesh.position.z < -900) {
      v.mesh.position.z = -400 - Math.random() * 400;
      v.mesh.position.x = Math.random() < 0.6 ? -2.8 : 2.5;
      v.lane = v.mesh.position.x < 0 ? -1 : 1;
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

  // Distancia restante
  if (simState.speed > 0) {
    const kmCovered = (simState.speed / 3600) * dt * 18;
    simState.targetDistanceKm = Math.max(0, simState.targetDistanceKm - kmCovered);
    simState.odometer += kmCovered;

    if (simState.targetDistanceKm <= 0) {
      arriveAtWaypoint();
    }
  }

  if (simState.fuelLiters <= 0) triggerBreakdown("Sin Combustible", "El motor se detuvo por falta de nafta.");
  if (simState.engineTemp >= 125) triggerBreakdown("Motor Fundido", "Temperatura excesiva en la tapa de cilindros.");

  updateGps();
}

// Actualizar la textura del tablero digital en 3D
function updateDashboardTexture() {
  const c = dashScreenCtx;
  c.fillStyle = '#090d16';
  c.fillRect(0, 0, 512, 256);

  // Borde
  c.strokeStyle = '#00e6b4';
  c.lineWidth = 4;
  c.strokeRect(6, 6, 500, 244);

  // Marcha (GEAR)
  c.fillStyle = simState.gear === 0 ? '#22c55e' : '#00e6b4';
  c.font = '700 80px "Chakra Petch", monospace';
  c.textAlign = 'center';
  const gText = simState.gear === 0 ? 'N' : simState.gear;
  c.fillText(gText, 95, 120);
  c.font = '22px "Chakra Petch"';
  c.fillStyle = '#64748b';
  c.fillText('MARCHA', 95, 160);

  // Velocímetro digital central
  c.fillStyle = '#ffffff';
  c.font = '700 105px "Share Tech Mono", monospace';
  c.fillText(Math.round(simState.speed).toString().padStart(3, ' '), 280, 130);
  c.font = '26px "Chakra Petch"';
  c.fillStyle = '#00e6b4';
  c.fillText('KM / H', 280, 175);

  // Barra de Tacómetro RPM
  const rpmRatio = Math.min(1, simState.rpm / simState.maxRpm);
  c.fillStyle = '#1e293b';
  c.fillRect(40, 200, 432, 24);
  c.fillStyle = simState.rpm >= simState.redlineRpm ? '#ef4444' : '#00e6b4';
  c.fillRect(40, 200, 432 * rpmRatio, 24);

  // Métricas de Nafta y Temp
  c.font = '22px "Share Tech Mono"';
  c.textAlign = 'right';
  c.fillStyle = simState.fuelLiters < 4 ? '#ef4444' : '#cbd5e1';
  c.fillText(`FUEL: ${simState.fuelLiters.toFixed(1)}L`, 480, 50);
  c.fillStyle = simState.engineTemp > 105 ? '#ef4444' : '#cbd5e1';
  c.fillText(`TEMP: ${Math.round(simState.engineTemp)}°C`, 480, 85);

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
    gpsEta.textContent = etaMin + " min";
  } else {
    gpsEta.textContent = "-- min";
  }
}

// Parada de Servicio
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
