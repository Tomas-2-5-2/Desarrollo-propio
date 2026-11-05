// ============================================================================
// MOTO-TRAVEL ULTRA 3D - MOTOR GRÁFICO NEXT-GEN (ESTILO PS4 / RIDE 4 / DRIVECLUB)
// - Shader Atmosférico Rayleigh/Mie + Iluminación Basada en Imágenes (PMREM HDRI)
// - Valle Cordillerano Abierto con Transición Suave de Banquinas, Acantilados y Lago
// - Asfalto PBR con Mapa de Normales, Rugosidad y Desplazamiento UV Continuo
// - Sombras Dinámicas en Tiempo Real (2048x2048 PCFSoftShadowMap)
// - Árboles Texturizados de Alta Densidad, Rocas Graníticas y Señalética Vial (RN 40)
// - Cabina Superbike/Adventure Sin Obstrucciones (Amortiguador Öhlins, Frenos Brembo,
//   Mangueras Malladas, Espejos con Reflejo Vial y Tablero TFT OLED Nítido)
// ============================================================================

const container = document.getElementById('webgl-container');
const btnFullscreen = document.getElementById('btn-fullscreen');

// Elementos UI
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
  maxSpeed: 208,

  // Mecánica
  fuelLiters: 18.0,
  engineTemp: 82.0,
  tirePressure: 32.0,
  bikeHealth: 100,
  money: 180,
  headlights: true,

  // Dinámica de Conducción Sandbox 360°, Trazada Puntual y Física Asfalto vs. Tierra
  bikeInitialized: false,
  bikeX: 0,              // Posición X real en el mundo 3D
  bikeZ: 0,              // Posición Z real en el mundo 3D
  bikeYaw: 0,            // Rumbo 360° libre (solo cambia cuando la moto rueda, nunca parada sobre su eje)
  velX: 0,               // Velocidad real en X (bloqueada al neumático en asfalto, con deriva en tierra)
  velZ: 0,               // Velocidad real en Z
  surfaceType: 'asphalt',// 'asphalt' | 'shoulder' | 'dirt'
  rearWheelSpin: 0,      // Patinamiento de rueda trasera en tierra al acelerar fuerte
  playerDistance: 0,     // Estación longitudinal más cercana sobre la ruta
  laneOffset: 2.2,       // Desplazamiento lateral respecto al eje de la ruta (libre / off-road)
  steeringInput: 0,      // -1 (izq) a +1 (der)
  leanAngle: 0,          // Radianes de inclinación física
  leanRate: 0,           // Velocidad angular de inclinación (efecto giroscópico)
  pitchSuspension: 0,    // Cabeceo de horquilla (freno / aceleración)
  suspensionOffset: 0,   // Compresión vertical del chasis sobre el suelo (m)
  suspensionVel: 0,      // Velocidad vertical de la suspensión
  prevGroundY: 6.0,      // Altura previa del suelo para calcular trabajo de suspensión
  groundPitch: 0,        // Pendiente longitudinal real bajo las ruedas
  headLookApex: 0,       // Giro natural de la vista buscando el interior del giro
  clutchPull: 0,         // Animación maneta embrague
  brakePull: 0,          // Animación maneta freno

  targetDistanceKm: 16.0,
  odometer: 0,
  onRumble: false,

  gearLimits: [0, 52, 86, 122, 154, 182, 210],
  gearMinSpeed: [0, 0, 22, 42, 68, 92, 115]
};

// ============================================================================
// 1. MATEMÁTICA DE RUIDO PROCEDURAL (PERLIN / SIMPLEX FBM PARA ROCA Y MONTAÑAS)
// ============================================================================
function hash2D(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function noise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);

  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, octaves = 4) {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise2D(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ============================================================================
// 2. TRAZADO DE LA CARRETERA DE MONTAÑA EN 3D
// ============================================================================
function getRoadPoint(dist) {
  const x = Math.sin(dist * 0.0052) * 36 + Math.cos(dist * 0.0022) * 22 + Math.sin(dist * 0.011) * 5;
  const y = Math.sin(dist * 0.0038) * 4.0 + Math.cos(dist * 0.008) * 1.6 + 6.0;
  const z = -dist;
  return { x, y, z };
}

function getRoadOrientation(dist) {
  const p0 = getRoadPoint(dist);
  const p1 = getRoadPoint(dist + 2.0);
  const p2 = getRoadPoint(dist + 4.0);

  const dx1 = p1.x - p0.x;
  const dy1 = p1.y - p0.y;
  const dz1 = -(p1.z - p0.z);

  const dx2 = p2.x - p1.x;
  const dz2 = -(p2.z - p1.z);

  const yaw = -Math.atan2(dx1, dz1);
  const yawNext = -Math.atan2(dx2, dz2);

  // Curvatura real de la ruta (positiva = curva a la izquierda, negativa = curva a la derecha)
  const curvature = (yawNext - yaw) / 2.0;

  // Pendiente longitudinal real (positiva al subir cuesta, negativa al bajar)
  const horizDist = Math.hypot(dx1, dz1);
  const pitch = Math.atan2(dy1, horizDist);

  // Peralte físico suave de la calzada en curvas
  const roll = -curvature * 2.8;

  // Vector perpendicular ortogonal exacto hacia la mano derecha de la ruta
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  return {
    x: p0.x,
    y: p0.y,
    z: p0.z,
    yaw,
    pitch,
    roll,
    curvature,
    curveRate: dx1 / dz1,
    rightX,
    rightZ
  };
}

// ============================================================================
// 3. GENERADORES DE TEXTURAS PBR, NORMAL MAPS Y ROUGHNESS MAPS
// ============================================================================
function createPBRAsphaltMaps() {
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = 1024;
  diffCanvas.height = 1024;
  const ctx = diffCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rCtx = roughCanvas.getContext('2d');

  const normCanvas = document.createElement('canvas');
  normCanvas.width = 512;
  normCanvas.height = 512;
  const nCtx = normCanvas.getContext('2d');

  // Base de asfalto desgastado con áridos minerales
  ctx.fillStyle = '#1b1e24';
  ctx.fillRect(0, 0, 1024, 1024);

  const img = ctx.getImageData(0, 0, 1024, 1024);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const grain = (Math.random() - 0.5) * 34;
    const pebble = Math.random() < 0.11 ? 24 : (Math.random() < 0.05 ? -18 : 0);
    d[i]     = Math.min(255, Math.max(0, 27 + grain + pebble));
    d[i + 1] = Math.min(255, Math.max(0, 30 + grain + pebble));
    d[i + 2] = Math.min(255, Math.max(0, 35 + grain + pebble));
  }
  ctx.putImageData(img, 0, 0);

  // Parches de bacheo vial (Asphalt repair patches) oscuros y claros para romper la monotonía
  for (let p = 0; p < 14; p++) {
    const px = 90 + Math.random() * 820;
    const py = Math.random() * 1024;
    const pw = 45 + Math.random() * 130;
    const ph = 70 + Math.random() * 210;
    ctx.fillStyle = Math.random() > 0.45 ? 'rgba(12, 14, 18, 0.42)' : 'rgba(52, 56, 64, 0.28)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(8, 9, 12, 0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
  }

  // Huellas de neumáticos pulidas y manchas de aceite/grasa en el centro de cada mano
  const trackGrad = ctx.createLinearGradient(0, 0, 1024, 0);
  trackGrad.addColorStop(0.0, 'rgba(58, 48, 38, 0.72)');  // Polvo de banquina
  trackGrad.addColorStop(0.11, 'rgba(20, 22, 26, 0.25)');
  trackGrad.addColorStop(0.20, 'rgba(9, 11, 15, 0.58)');  // Huella rueda izq
  trackGrad.addColorStop(0.28, 'rgba(6, 7, 10, 0.75)');   // Franja central de aceite/grasa
  trackGrad.addColorStop(0.36, 'rgba(9, 11, 15, 0.58)');  // Huella rueda der
  trackGrad.addColorStop(0.50, 'rgba(32, 34, 38, 0.22)');
  trackGrad.addColorStop(0.64, 'rgba(9, 11, 15, 0.58)');
  trackGrad.addColorStop(0.72, 'rgba(6, 7, 10, 0.75)');   // Franja central de aceite/grasa
  trackGrad.addColorStop(0.80, 'rgba(9, 11, 15, 0.58)');
  trackGrad.addColorStop(0.89, 'rgba(20, 22, 26, 0.25)');
  trackGrad.addColorStop(1.0, 'rgba(58, 48, 38, 0.72)');
  ctx.fillStyle = trackGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Marcas de caucho y frenadas intermitentes
  ctx.fillStyle = 'rgba(7, 8, 10, 0.52)';
  for (let s = 0; s < 18; s++) {
    const sx = (Math.random() > 0.5 ? 210 : 660) + (Math.random() - 0.5) * 140;
    const sy = Math.random() * 900;
    ctx.fillRect(sx, sy, 9 + Math.random() * 8, 80 + Math.random() * 160);
  }

  // Grietas longitudinales y transversales selladas con brea (Tar snakes)
  ctx.strokeStyle = 'rgba(6, 7, 10, 0.82)';
  ctx.lineWidth = 3.2;
  for (let c = 0; c < 9; c++) {
    ctx.beginPath();
    let cx = 110 + Math.random() * 804;
    ctx.moveTo(cx, 0);
    for (let y = 0; y <= 1024; y += 48) {
      cx += (Math.random() - 0.5) * 32;
      ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }

  // Banquinas de ripio, tierra suelta y polvo invadiendo el borde del asfalto
  const leftShoulder = ctx.createLinearGradient(0, 0, 95, 0);
  leftShoulder.addColorStop(0, '#4a3e31');
  leftShoulder.addColorStop(0.55, '#362f28');
  leftShoulder.addColorStop(1, 'rgba(28,31,38,0)');
  ctx.fillStyle = leftShoulder;
  ctx.fillRect(0, 0, 95, 1024);

  const rightShoulder = ctx.createLinearGradient(929, 0, 1024, 0);
  rightShoulder.addColorStop(0, 'rgba(28,31,38,0)');
  rightShoulder.addColorStop(0.45, '#362f28');
  rightShoulder.addColorStop(1, '#4a3e31');
  ctx.fillStyle = rightShoulder;
  ctx.fillRect(929, 0, 95, 1024);

  // Bandas sonoras (Rumble strips) labradas con suciedad acumulada
  ctx.fillStyle = 'rgba(12, 14, 18, 0.55)';
  for (let y = 0; y < 1024; y += 32) {
    ctx.fillRect(42, y, 22, 14);
    ctx.fillRect(960, y, 22, 14);
  }

  // Doble línea amarilla central y líneas blancas laterales
  ctx.fillStyle = '#d99b07';
  ctx.fillRect(496, 0, 10, 1024);
  ctx.fillRect(518, 0, 10, 1024);

  ctx.fillStyle = '#dce3ec';
  ctx.fillRect(68, 0, 14, 1024);
  ctx.fillRect(942, 0, 14, 1024);

  // Desgaste y suciedad sobre la pintura vial (para que no se vea pintura digital limpia)
  for (let w = 0; w < 220; w++) {
    const wy = Math.random() * 1024;
    const wh = 4 + Math.random() * 18;
    ctx.fillStyle = 'rgba(27, 30, 36, 0.58)';
    ctx.fillRect(494, wy, 36, wh);
    ctx.fillStyle = 'rgba(54, 47, 40, 0.55)';
    ctx.fillRect(65, (wy + 170) % 1024, 20, wh * 1.4);
    ctx.fillRect(939, (wy + 410) % 1024, 20, wh * 1.4);
  }

  // Manchas irregulares de tierra y piedritas sueltas en los bordes
  for (let g = 0; g < 450; g++) {
    const gx = Math.random() < 0.5 ? Math.random() * 135 : 889 + Math.random() * 135;
    const gy = Math.random() * 1024;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(92, 78, 62, 0.45)' : 'rgba(24, 22, 19, 0.5)';
    ctx.fillRect(gx, gy, 3 + Math.random() * 5, 3 + Math.random() * 5);
  }

  // Roughness Map (huellas y manchas de aceite más reflectantes a contraluz)
  rCtx.fillStyle = '#c2c2c2';
  rCtx.fillRect(0, 0, 512, 512);
  const rGrad = rCtx.createLinearGradient(0, 0, 512, 0);
  rGrad.addColorStop(0, '#eaeaea');
  rGrad.addColorStop(0.20, '#5a5a5a');
  rGrad.addColorStop(0.28, '#383838'); // Brillo aceitoso en la huella
  rGrad.addColorStop(0.36, '#5a5a5a');
  rGrad.addColorStop(0.50, '#b0b0b0');
  rGrad.addColorStop(0.64, '#5a5a5a');
  rGrad.addColorStop(0.72, '#383838');
  rGrad.addColorStop(0.80, '#5a5a5a');
  rGrad.addColorStop(1, '#eaeaea');
  rCtx.fillStyle = rGrad;
  rCtx.fillRect(0, 0, 512, 512);

  // Normal Map con micro-relieve de piedras y grietas
  const nImg = nCtx.createImageData(512, 512);
  const nd = nImg.data;
  for (let i = 0; i < nd.length; i += 4) {
    nd[i]     = 128 + (Math.random() - 0.5) * 58;
    nd[i + 1] = 128 + (Math.random() - 0.5) * 58;
    nd[i + 2] = 242;
    nd[i + 3] = 255;
  }
  nCtx.putImageData(nImg, 0, 0);

  const diffTex = new THREE.CanvasTexture(diffCanvas);
  diffTex.wrapS = THREE.RepeatWrapping;
  diffTex.wrapT = THREE.RepeatWrapping;
  diffTex.anisotropy = 8;

  const roughTex = new THREE.CanvasTexture(roughCanvas);
  roughTex.wrapS = THREE.RepeatWrapping;
  roughTex.wrapT = THREE.RepeatWrapping;

  const normTex = new THREE.CanvasTexture(normCanvas);
  normTex.wrapS = THREE.RepeatWrapping;
  normTex.wrapT = THREE.RepeatWrapping;

  return { diffTex, roughTex, normTex };
}

function createWeatheredGuardrailTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');

  // Perfil acanalado W-Beam de acero galvanizado con suciedad y óxido
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.0, '#94a3b8');
  g.addColorStop(0.25, '#cbd5e1');
  g.addColorStop(0.50, '#475569'); // Canal central hundido
  g.addColorStop(0.75, '#cbd5e1');
  g.addColorStop(1.0, '#64748b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);

  // Manchas de óxido, musgo y salpicaduras de barro vial
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = Math.random() > 0.4 ? 'rgba(92, 64, 42, 0.35)' : 'rgba(45, 52, 40, 0.35)';
    ctx.fillRect(Math.random() * 256, 45 + Math.random() * 83, 4 + Math.random() * 14, 6 + Math.random() * 25);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 30);
  return tex;
}

function createGrimeMetalTexture(baseHex, grimeAmount = 0.35) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Veta de metal cepillado y micro-rayones de uso en ruta
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  // Salpicaduras de polvo seco, barro e insectos de viaje
  for (let i = 0; i < 320 * grimeAmount; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 1 + Math.random() * 4.5;
    ctx.fillStyle = Math.random() > 0.35 ? 'rgba(78, 64, 48, 0.38)' : 'rgba(28, 24, 20, 0.42)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createDistressedLeatherTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#583118';
  ctx.fillRect(0, 0, 256, 256);

  // Pátina de cuero gastado, pliegues oscuros y desgaste en nudillos
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(32, 16, 6, 0.22)' : 'rgba(130, 82, 44, 0.16)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 2 + Math.random() * 6);
  }
  // Costuras claras en los bordes
  ctx.strokeStyle = 'rgba(195, 155, 105, 0.55)';
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, 236, 236);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createContactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  g.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function createTerrainPBRMaps() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base neutra texturizada (se multiplica por los vertexColors sin crear rayas blancas)
  ctx.fillStyle = '#c8cebe';
  ctx.fillRect(0, 0, 512, 512);

  const img = ctx.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 32;
    d[i]     = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  // Detalles orgánicos suaves (matas de pasto y grietas de roca)
  ctx.fillStyle = 'rgba(40, 50, 35, 0.14)';
  for (let i = 0; i < 600; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 6, 3 + Math.random() * 6);
  }

  const nCanvas = document.createElement('canvas');
  nCanvas.width = 256;
  nCanvas.height = 256;
  const nCtx = nCanvas.getContext('2d');
  const nImg = nCtx.createImageData(256, 256);
  for (let i = 0; i < nImg.data.length; i += 4) {
    nImg.data[i]     = 128 + (Math.random() - 0.5) * 65;
    nImg.data[i + 1] = 128 + (Math.random() - 0.5) * 65;
    nImg.data[i + 2] = 238;
    nImg.data[i + 3] = 255;
  }
  nCtx.putImageData(nImg, 0, 0);

  const diff = new THREE.CanvasTexture(canvas);
  diff.wrapS = THREE.RepeatWrapping;
  diff.wrapT = THREE.RepeatWrapping;
  diff.repeat.set(14, 24);

  const norm = new THREE.CanvasTexture(nCanvas);
  norm.wrapS = THREE.RepeatWrapping;
  norm.wrapT = THREE.RepeatWrapping;
  norm.repeat.set(24, 40);

  return { diff, norm };
}

function createPineFoliageTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#183824';
  ctx.fillRect(0, 0, 256, 256);

  // Miles de agujas de pino para evitar aspecto plástico liso
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.strokeStyle = Math.random() > 0.45 ? '#265437' : '#0f2618';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 10, y + 6 + Math.random() * 8);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

function createCarbonWeaveTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101318';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#202631';
  for (let y = 0; y < 64; y += 4) {
    for (let x = 0; x < 64; x += 4) {
      if ((x + y) % 8 === 0) ctx.fillRect(x, y, 3, 2);
      else ctx.fillRect(x, y + 2, 2, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createMirrorReflectionTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');

  // Cielo reflejado en el espejo retrovisor
  const skyG = ctx.createLinearGradient(0, 0, 0, 72);
  skyG.addColorStop(0, '#2b588c');
  skyG.addColorStop(1, '#c7baa8');
  ctx.fillStyle = skyG;
  ctx.fillRect(0, 0, 256, 72);

  // Silueta de montañas detrás del piloto
  ctx.fillStyle = '#334638';
  ctx.beginPath();
  ctx.moveTo(0, 72);
  ctx.lineTo(45, 38);
  ctx.lineTo(95, 62);
  ctx.lineTo(155, 30);
  ctx.lineTo(215, 55);
  ctx.lineTo(256, 42);
  ctx.lineTo(256, 72);
  ctx.fill();

  // Ruta alejándose detrás en el espejo
  ctx.fillStyle = '#262b30';
  ctx.fillRect(0, 72, 256, 56);
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.moveTo(126, 72);
  ctx.lineTo(130, 72);
  ctx.lineTo(142, 128);
  ctx.lineTo(114, 128);
  ctx.fill();

  return new THREE.CanvasTexture(c);
}

function createChevronSignTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 122, 122);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(32, 18);
  ctx.lineTo(68, 18);
  ctx.lineTo(104, 64);
  ctx.lineTo(68, 110);
  ctx.lineTo(32, 110);
  ctx.lineTo(68, 64);
  ctx.closePath();
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

// Cartel vial clásico de Ruta Nacional 40 con desgaste
function createRoute40SignTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#065f46';
  ctx.fillRect(0, 0, 128, 160);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 148);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RUTA NAC.', 64, 38);
  ctx.font = '700 54px sans-serif';
  ctx.fillText('40', 64, 96);
  ctx.font = '700 18px monospace';
  ctx.fillText('KM 2140', 64, 134);

  // Polvo vial en la base del cartel
  const grd = ctx.createLinearGradient(0, 110, 0, 160);
  grd.addColorStop(0, 'rgba(120, 95, 70, 0)');
  grd.addColorStop(1, 'rgba(120, 95, 70, 0.45)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 110, 128, 50);

  return new THREE.CanvasTexture(c);
}

// Mapa de normales animado para olas y reflejos solares en el lago glaciar
function createWaterNormalMap() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = Math.sin(x * 0.14 + y * 0.06) * 0.5 + Math.cos(x * 0.08 - y * 0.18) * 0.5;
      const ny = Math.cos(y * 0.16 - x * 0.05) * 0.5 + Math.sin(y * 0.22 + x * 0.11) * 0.5;
      d[idx]     = Math.min(255, Math.max(0, 128 + nx * 38));
      d[idx + 1] = Math.min(255, Math.max(0, 128 + ny * 38));
      d[idx + 2] = 245;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(55, 55);
  return tex;
}

// Textura de cuero bordado para el protector de barra transversal (Crossbar Pad Scrambler)
function createCrossbarPadTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#3b2314';
  ctx.fillRect(0, 0, 512, 256);

  // Grano de cuero y desgaste central
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(85, 52, 30, 0.28)' : 'rgba(18, 10, 5, 0.32)';
    ctx.fillRect(Math.random() * 512, Math.random() * 256, 3, 2);
  }

  // Costuras horizontales color crema
  ctx.strokeStyle = '#d6c7b2';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(0, 36); ctx.lineTo(512, 36);
  ctx.moveTo(0, 220); ctx.lineTo(512, 220);
  ctx.stroke();
  ctx.setLineDash([]);

  // Inscripción clásica estampada en el centro del pad mirando al piloto
  ctx.fillStyle = '#efe8d5';
  ctx.font = '700 28px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SCRAMBLER  //  650 TWIN', 256, 128);

  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Halo luminoso suave para faros del tráfico y destello solar
function createLightGlowTexture(colorStop0, colorStop1) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, colorStop0);
  g.addColorStop(0.35, colorStop1);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ============================================================================
// 4. ESCENA, RENDERER Y SHADER ATMOSFÉRICO FISICAMENTE BASADO (SKY + HDRI)
// ============================================================================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc4d4e0, 0.0012);

let width = window.innerWidth;
let height = window.innerHeight;

const camera = new THREE.PerspectiveCamera(64, width / height, 0.08, 3500);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputEncoding = THREE.sRGBEncoding;
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

// --- SHADER GLSL PARA CIELO FÍSICO RAYLEIGH/MIE Y NUBES VOLUMÉTRICAS ---
const skyVertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const skyFragmentShader = `
  varying vec3 vWorldPosition;
  uniform vec3 uSunDir;
  uniform float uTime;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbmCloud(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float elevation = max(dir.y, 0.0);

    vec3 zenithColor = vec3(0.10, 0.26, 0.54);
    vec3 midSkyColor = vec3(0.36, 0.60, 0.84);
    vec3 horizonColor = vec3(0.86, 0.82, 0.76);

    vec3 sky = mix(horizonColor, midSkyColor, pow(elevation, 0.45));
    sky = mix(sky, zenithColor, pow(elevation, 1.2));

    float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
    sky += vec3(1.0, 0.65, 0.32) * pow(sunAmt, 6.0) * 0.45;
    sky += vec3(1.0, 0.92, 0.75) * pow(sunAmt, 64.0) * 0.8;
    sky += vec3(1.0, 0.98, 0.9) * smoothstep(0.9985, 0.9996, sunAmt) * 2.5;

    if (dir.y > 0.03) {
      vec2 uv = dir.xz / (dir.y + 0.18) * 1.4 + vec2(uTime * 0.008, 0.0);
      float c = fbmCloud(uv);
      float cloudMask = smoothstep(0.46, 0.76, c) * smoothstep(0.03, 0.22, dir.y);
      vec3 cloudColor = mix(vec3(0.75, 0.78, 0.84), vec3(1.0, 0.95, 0.88), pow(sunAmt, 2.0));
      sky = mix(sky, cloudColor, cloudMask * 0.75);
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

const sunDirection = new THREE.Vector3(0.48, 0.36, -0.80).normalize();
const skyUniforms = {
  uSunDir: { value: sunDirection },
  uTime: { value: 0 }
};

const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(2400, 32, 24),
  new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false
  })
);
scene.add(skyDome);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileCubemapShader();
const envScene = new THREE.Scene();
envScene.add(skyDome.clone());
const envRT = pmremGenerator.fromScene(envScene, 0.04);
scene.environment = envRT.texture;

// ============================================================================
// 5. ILUMINACIÓN, CONTRASTE DRAMÁTICO Y SOMBRAS DE ALTA DENSIDAD
// ============================================================================
const hemiLight = new THREE.HemisphereLight(0xffedd5, 0x1e261c, 0.68);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffe4b5, 2.35);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 1.5;
sunLight.shadow.camera.far = 220;
const shadowCamSize = 42; // Frustum concentrado para sombras súper definidas en moto y ruta
sunLight.shadow.camera.left = -shadowCamSize;
sunLight.shadow.camera.right = shadowCamSize;
sunLight.shadow.camera.top = shadowCamSize;
sunLight.shadow.camera.bottom = -shadowCamSize;
sunLight.shadow.bias = -0.0003;
scene.add(sunLight);
scene.add(sunLight.target);

const motoHeadlight = new THREE.SpotLight(0xfffae0, 3.2, 130, Math.PI / 4.8, 0.48, 1.2);
scene.add(motoHeadlight);
scene.add(motoHeadlight.target);

const contactShadowTex = createContactShadowTexture();
const contactShadowMat = new THREE.MeshBasicMaterial({
  map: contactShadowTex,
  transparent: true,
  opacity: 0.75,
  depthWrite: false
});

// ============================================================================
// 6. TERRENO 3D CONTINUO (BANQUINAS SUAVES, ACANTILADOS, VALLE Y LAGO)
// ============================================================================
const RIBBON_POINTS = 200;
const POINT_STEP = 3.5;
const ROAD_WIDTH = 11.4;

// A. Carretera PBR con Normal Map, Roughness Map, Parches y Suciedad Vial
const asphaltMaps = createPBRAsphaltMaps();
const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, (RIBBON_POINTS - 1) * POINT_STEP, 1, RIBBON_POINTS - 1);
const roadMat = new THREE.MeshStandardMaterial({
  map: asphaltMaps.diffTex,
  roughnessMap: asphaltMaps.roughTex,
  normalMap: asphaltMaps.normTex,
  normalScale: new THREE.Vector2(0.58, 0.58),
  roughness: 0.78,
  metalness: 0.16,
  envMapIntensity: 1.45,
  side: THREE.DoubleSide
});
const roadMesh = new THREE.Mesh(roadGeo, roadMat);
roadMesh.receiveShadow = true;
scene.add(roadMesh);
const roadPosAttr = roadGeo.attributes.position;
const roadUvAttr = roadGeo.attributes.uv;
roadPosAttr.setUsage(THREE.DynamicDrawUsage);
roadUvAttr.setUsage(THREE.DynamicDrawUsage);

// B. Malla de Terreno 3D con Transición Suave de Banquinas (40 columnas x 120 filas)
const TERRAIN_COLS = 40;
const terrainGeo = new THREE.PlaneGeometry(320, (RIBBON_POINTS - 1) * POINT_STEP, TERRAIN_COLS - 1, RIBBON_POINTS - 1);
const terrainVertexCount = terrainGeo.attributes.position.count;
const terrainColors = new Float32Array(terrainVertexCount * 3);
terrainGeo.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));

const terrainMaps = createTerrainPBRMaps();
const terrainMat = new THREE.MeshStandardMaterial({
  map: terrainMaps.diff,
  normalMap: terrainMaps.norm,
  normalScale: new THREE.Vector2(0.75, 0.75),
  vertexColors: true,
  roughness: 0.90,
  metalness: 0.04,
  side: THREE.DoubleSide
});
const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);
const terrainPosAttr = terrainGeo.attributes.position;
const terrainColAttr = terrainGeo.attributes.color;
terrainPosAttr.setUsage(THREE.DynamicDrawUsage);
terrainColAttr.setUsage(THREE.DynamicDrawUsage);

// C. Lago Glaciar con Olas Animadas y Reflejos Dorados en el fondo del valle izquierdo
const waterNormTex = createWaterNormalMap();
const waterGeo = new THREE.PlaneGeometry(3600, 3600);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x0d586e,
  normalMap: waterNormTex,
  normalScale: new THREE.Vector2(0.42, 0.42),
  roughness: 0.08,
  metalness: 0.90,
  envMapIntensity: 2.1
});
const waterMesh = new THREE.Mesh(waterGeo, waterMat);
waterMesh.rotation.x = -Math.PI / 2;
waterMesh.position.y = -6.5;
scene.add(waterMesh);

// C2. Cordillera de los Andes Panorámica 360° en el Horizonte Lejano (Picos Nevados y Granito)
function createDistantMountainRange() {
  const radSegs = 96;
  const heightSegs = 14;
  const geo = new THREE.CylinderGeometry(1650, 2100, 540, radSegs, heightSegs, true);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const ang = Math.atan2(vz, vx);
    // Altura normalizada de la base (0) a la cumbre (1)
    const hRatio = (vy + 270) / 540;

    // Perfil cordillerano dentado tipo Fitz Roy / Andes Patagónicos
    const ridge1 = Math.abs(Math.sin(ang * 7.0 + 0.5)) * 1.15;
    const ridge2 = Math.abs(Math.cos(ang * 15.0 - 1.2)) * 0.62;
    const ridge3 = Math.sin(ang * 29.0) * 0.25;
    const peakProfile = 0.38 + ridge1 * 0.55 + ridge2 * 0.35 + ridge3 * 0.15;

    const newY = -120 + Math.pow(hRatio, 1.25) * 520 * peakProfile;
    const radNoise = 1.0 + (noise2D(Math.cos(ang) * 4.5, hRatio * 6.0) - 0.5) * 0.12 * hRatio;
    pos.setXYZ(i, vx * radNoise, newY, vz * radNoise);

    // Colores por altitud: base boscosa oscura -> granito gris azulado -> nieve eterna iluminada por el sol
    let r = 0.18, g = 0.24, b = 0.22;
    if (newY > 215) {
      // Cumbres nevadas con tinte cálido de hora dorada
      r = 0.94; g = 0.93; b = 0.95;
    } else if (newY > 110) {
      // Paredones de granito andino con vetas de nieve
      const snowMix = smoothstep(110, 215, newY);
      r = 0.34 + snowMix * 0.56;
      g = 0.38 + snowMix * 0.52;
      b = 0.44 + snowMix * 0.48;
    } else if (newY > 30) {
      r = 0.26; g = 0.31; b = 0.34;
    }
    cols[i * 3]     = r;
    cols[i * 3 + 1] = g;
    cols[i * 3 + 2] = b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalMap: terrainMaps.norm,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.88,
    metalness: 0.05,
    side: THREE.BackSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

const mountainRangeMesh = createDistantMountainRange();
scene.add(mountainRangeMesh);

// Resplandor Solar Atmosférico (Sun Glare Sprite en dirección al sol)
const sunGlowTex = createLightGlowTexture('rgba(255, 250, 225, 0.95)', 'rgba(255, 180, 90, 0.32)');
const sunGlareSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: sunGlowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
sunGlareSprite.scale.set(680, 680, 1);
scene.add(sunGlareSprite);

// D. Guardarraíl Metálico 3D Acanalado con Óxido y Barro Vial
const guardrailGeo = new THREE.PlaneGeometry(0.44, (RIBBON_POINTS - 1) * POINT_STEP, 1, RIBBON_POINTS - 1);
const guardrailMat = new THREE.MeshStandardMaterial({
  map: createWeatheredGuardrailTexture(),
  normalMap: terrainMaps.norm,
  normalScale: new THREE.Vector2(0.25, 0.25),
  metalness: 0.78,
  roughness: 0.38,
  side: THREE.DoubleSide
});
const guardrailMesh = new THREE.Mesh(guardrailGeo, guardrailMat);
guardrailMesh.castShadow = true;
guardrailMesh.receiveShadow = true;
scene.add(guardrailMesh);
const guardrailPosAttr = guardrailGeo.attributes.position;
guardrailPosAttr.setUsage(THREE.DynamicDrawUsage);

// E. Tachas Reflectantes, Postes Telegráficos, Arbustos Secos (Coirón) y Carteles de Ruta 40
const catEyesGroup = new THREE.Group();
const catEyeGeo = new THREE.BoxGeometry(0.16, 0.035, 0.22);
const catEyeMat = new THREE.MeshStandardMaterial({
  color: 0xfbbf24,
  emissive: 0xf59e0b,
  emissiveIntensity: 0.65,
  roughness: 0.2
});
const postGeo = new THREE.BoxGeometry(0.12, 0.76, 0.12);
const woodPostMat = new THREE.MeshStandardMaterial({
  color: 0x4a3728,
  normalMap: terrainMaps.norm,
  roughness: 0.92
});
const shrubMat = new THREE.MeshStandardMaterial({
  color: 0x6e6338, // Coirón / pasto seco patagónico en banquina
  map: terrainMaps.diff,
  roughness: 0.92
});
const reflGeo = new THREE.BoxGeometry(0.04, 0.16, 0.08);
const reflRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
const reflWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const chevronMat = new THREE.MeshStandardMaterial({
  map: createChevronSignTexture(),
  roughness: 0.35,
  metalness: 0.25
});
const route40Mat = new THREE.MeshStandardMaterial({
  map: createRoute40SignTexture(),
  roughness: 0.38,
  metalness: 0.22
});

const roadDetails = [];
for (let i = 0; i < 45; i++) {
  const g = new THREE.Group();

  // Tacha central amarilla
  const ce = new THREE.Mesh(catEyeGeo, catEyeMat);
  ce.position.set(0, 0.025, 0);
  g.add(ce);

  // Poste izquierdo de guardarraíl + reflector rojo
  const postL = new THREE.Mesh(postGeo, woodPostMat);
  postL.position.set(-ROAD_WIDTH / 2 - 0.18, 0.35, 0);
  postL.castShadow = true;
  g.add(postL);

  const refL = new THREE.Mesh(reflGeo, reflRedMat);
  refL.position.set(-ROAD_WIDTH / 2 - 0.10, 0.58, 0);
  g.add(refL);

  // Mojón delineador derecho con reflector blanco
  const postR = new THREE.Mesh(postGeo, woodPostMat);
  postR.position.set(ROAD_WIDTH / 2 + 0.45, 0.35, 0);
  postR.castShadow = true;
  g.add(postR);

  const refR = new THREE.Mesh(reflGeo, reflWhiteMat);
  refR.position.set(ROAD_WIDTH / 2 + 0.38, 0.58, 0);
  g.add(refR);

  // Matas de pasto seco / arbustos achaparrados junto a la banquina para realismo orgánico
  const shrub = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 1), shrubMat);
  shrub.scale.set(1.3, 0.65, 1.2);
  shrub.position.set(ROAD_WIDTH / 2 + 1.1 + (i % 3) * 0.45, 0.18, 2.2);
  shrub.castShadow = true;
  shrub.receiveShadow = true;
  g.add(shrub);

  // Postes telegráficos de madera antiguos al costado derecho que proyectan sombras largas en el asfalto
  if (i % 4 === 0) {
    const telePole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 6.8, 10), woodPostMat);
    telePole.position.set(ROAD_WIDTH / 2 + 2.8, 3.3, -1.5);
    telePole.castShadow = true;
    telePole.receiveShadow = true;
    g.add(telePole);

    const crossArm = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.10, 0.10), woodPostMat);
    crossArm.position.set(ROAD_WIDTH / 2 + 2.8, 6.1, -1.5);
    crossArm.castShadow = true;
    g.add(crossArm);

    [-0.55, -0.20, 0.20, 0.55].forEach(ix => {
      const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 8), reflWhiteMat);
      insulator.position.set(ROAD_WIDTH / 2 + 2.8 + ix, 6.22, -1.5);
      g.add(insulator);
    });
  }

  // Carteles viales de curva (Chevron amarillo/negro) y Carteles de Ruta Nacional 40
  if (i % 5 === 0) {
    const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8), guardrailMat);
    signPole.position.set(ROAD_WIDTH / 2 + 1.45, 0.9, 0);
    signPole.castShadow = true;
    g.add(signPole);

    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.04), chevronMat);
    signBoard.position.set(ROAD_WIDTH / 2 + 1.45, 1.65, 0);
    signBoard.castShadow = true;
    g.add(signBoard);
  } else if (i % 9 === 0) {
    const r40Pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 8), guardrailMat);
    r40Pole.position.set(ROAD_WIDTH / 2 + 1.65, 1.1, 0);
    r40Pole.castShadow = true;
    g.add(r40Pole);

    const r40Board = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.02, 0.04), route40Mat);
    r40Board.position.set(ROAD_WIDTH / 2 + 1.65, 1.95, 0);
    r40Board.castShadow = true;
    g.add(r40Board);
  }

  catEyesGroup.add(g);
  roadDetails.push({ group: g, distOffset: i * 9 });
}
scene.add(catEyesGroup);

// F. Sistema de Partículas 3D de Polvo en Suspensión y Tierra Vial a Contraluz
const DUST_COUNT = 420;
const dustGeo = new THREE.BufferGeometry();
const dustPositions = new Float32Array(DUST_COUNT * 3);
for (let i = 0; i < DUST_COUNT; i++) {
  dustPositions[i * 3]     = (Math.random() - 0.5) * 26;
  dustPositions[i * 3 + 1] = Math.random() * 4.5;
  dustPositions[i * 3 + 2] = -Math.random() * 75;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dustMat = new THREE.PointsMaterial({
  color: 0xfde68a,
  size: 0.085,
  transparent: true,
  opacity: 0.48,
  depthWrite: false
});
const dustParticles = new THREE.Points(dustGeo, dustMat);
scene.add(dustParticles);

// ============================================================================
// 7. BOSQUE PATAGÓNICO MULTI-ESPECIE (PINOS Y LENGAS OTOÑALES) Y ROCAS
// ============================================================================
const forestGroup = new THREE.Group();

const pineNeedleTex = createPineFoliageTexture();
const barkMat = new THREE.MeshStandardMaterial({
  color: 0x3d281a,
  normalMap: terrainMaps.norm,
  roughness: 0.92
});
const pineFoliageMat1 = new THREE.MeshStandardMaterial({
  color: 0xb8d4be,
  map: pineNeedleTex,
  roughness: 0.76
});
const pineFoliageMat2 = new THREE.MeshStandardMaterial({
  color: 0x9ec2a6,
  map: pineNeedleTex,
  roughness: 0.74
});
const autumnLengaMat1 = new THREE.MeshStandardMaterial({
  color: 0xd97706, // Dorado ocre otoñal patagónico
  map: pineNeedleTex,
  roughness: 0.78
});
const autumnLengaMat2 = new THREE.MeshStandardMaterial({
  color: 0xb45309, // Ámbar rojizo de montaña
  map: pineNeedleTex,
  roughness: 0.78
});
const rockBoulderMat = new THREE.MeshStandardMaterial({
  color: 0x56606b,
  normalMap: terrainMaps.norm,
  normalScale: new THREE.Vector2(1.0, 1.0),
  roughness: 0.84,
  metalness: 0.08
});

function createHighDetailPineTree() {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.42, 5.6, 10), barkMat);
  trunk.position.y = 2.8;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const layers = 7;
  for (let l = 0; l < layers; l++) {
    const ratio = l / (layers - 1);
    const radius = 3.0 * (1 - ratio * 0.70);
    const height = 2.5 - ratio * 0.7;
    const coneGeo = new THREE.ConeGeometry(radius, height, 16, 1, false);

    const pos = coneGeo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) < 0) {
        const ang = Math.atan2(pos.getZ(v), pos.getX(v));
        const jag = 0.84 + Math.sin(ang * 6 + l * 1.7) * 0.18;
        pos.setX(v, pos.getX(v) * jag);
        pos.setZ(v, pos.getZ(v) * jag);
        pos.setY(v, pos.getY(v) - Math.sin(ang * 6) * 0.22);
      }
    }
    coneGeo.computeVertexNormals();

    const bough = new THREE.Mesh(coneGeo, l % 2 === 0 ? pineFoliageMat1 : pineFoliageMat2);
    bough.position.y = 2.7 + l * 1.42;
    bough.rotation.y = l * 0.95;
    bough.castShadow = true;
    bough.receiveShadow = true;
    tree.add(bough);
  }
  return tree;
}

// Árbol de Lenga / Ñire Patagónico con copa frondosa en tonos ocres y dorados
function createAutumnLengaTree() {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.44, 4.4, 9), barkMat);
  trunk.position.y = 2.2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const canopyOffsets = [
    [0, 5.2, 0, 2.3],
    [-1.2, 4.5, 0.8, 1.75],
    [1.3, 4.7, -0.7, 1.8],
    [0.4, 6.4, 0.5, 1.65],
    [-0.7, 6.0, -0.8, 1.55]
  ];
  canopyOffsets.forEach((c, idx) => {
    const folGeo = new THREE.DodecahedronGeometry(c[3], 1);
    const pos = folGeo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const sc = 0.86 + 0.24 * Math.sin(v * 2.1 + idx);
      pos.setXYZ(v, pos.getX(v) * sc * 1.15, pos.getY(v) * sc * 0.82, pos.getZ(v) * sc * 1.12);
    }
    folGeo.computeVertexNormals();
    const crown = new THREE.Mesh(folGeo, idx % 2 === 0 ? autumnLengaMat1 : autumnLengaMat2);
    crown.position.set(c[0], c[1], c[2]);
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);
  });

  return tree;
}

function createSculptedRockBoulder() {
  const geo = new THREE.DodecahedronGeometry(2.1, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const n = 0.75 + 0.45 * noise2D(vx * 1.3, vz * 1.3);
    pos.setXYZ(i, vx * n * 1.35, vy * n * 0.82, vz * n * 1.25);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, rockBoulderMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Función compartida para calcular la altura exacta del terreno en cualquier punto
function getTerrainElevationOffset(lateral, wx, wz) {
  const halfRoad = ROAD_WIDTH / 2;
  if (Math.abs(lateral) <= halfRoad + 1.4) {
    return -0.05;
  } else if (lateral > halfRoad + 1.4) {
    const dRight = lateral - (halfRoad + 1.4);
    const fade = smoothstep(0, 26, dRight);
    const nVal = fbm(wx * 0.022, wz * 0.022, 4);
    const detail = noise2D(wx * 0.09, wz * 0.09);
    return fade * (Math.pow(dRight, 1.18) * 0.34 + nVal * 28.0 + detail * 2.2);
  } else {
    const dLeft = Math.abs(lateral) - (halfRoad + 1.4);
    const fade = smoothstep(0, 22, dLeft);
    const nVal = fbm(wx * 0.02, wz * 0.02, 4);
    if (dLeft < 48) {
      return fade * (-Math.min(13.5, dLeft * 0.38) + nVal * 2.5);
    } else {
      const dFar = dLeft - 48;
      const farFade = smoothstep(0, 30, dFar);
      return -11.5 + farFade * (Math.pow(dFar, 1.32) * 0.48 + nVal * 38.0);
    }
  }
}

// Encuentra el punto más cercano de la carretera y la altura exacta del suelo para cualquier coordenada 3D (wx, wz)
function getClosestRoadInfo(wx, wz) {
  const centerD = -wz;
  let bestDist = centerD;
  let minSq = Infinity;

  for (let d = centerD - 36; d <= centerD + 36; d += 4.0) {
    const p = getRoadPoint(d);
    const sq = (wx - p.x) * (wx - p.x) + (wz - p.z) * (wz - p.z);
    if (sq < minSq) {
      minSq = sq;
      bestDist = d;
    }
  }
  for (let step = 2.0; step >= 0.125; step *= 0.5) {
    const pMinus = getRoadPoint(bestDist - step);
    const pPlus = getRoadPoint(bestDist + step);
    const sqMinus = (wx - pMinus.x) * (wx - pMinus.x) + (wz - pMinus.z) * (wz - pMinus.z);
    const sqPlus = (wx - pPlus.x) * (wx - pPlus.x) + (wz - pPlus.z) * (wz - pPlus.z);
    if (sqMinus < minSq) {
      minSq = sqMinus;
      bestDist -= step;
    } else if (sqPlus < minSq) {
      minSq = sqPlus;
      bestDist += step;
    }
  }

  const roadOri = getRoadOrientation(bestDist);
  const dx = wx - roadOri.x;
  const dz = wz - roadOri.z;
  const lateral = dx * roadOri.rightX + dz * roadOri.rightZ;
  const halfRoad = ROAD_WIDTH / 2;
  const groundY = roadOri.y + (Math.abs(lateral) <= halfRoad ? 0.04 : getTerrainElevationOffset(lateral, wx, wz));

  return {
    roadDist: bestDist,
    lateral,
    groundY,
    roadOri
  };
}

const natureObjects = [];
for (let i = 0; i < 70; i++) {
  const wrapper = new THREE.Group();
  const tree = (i % 4 === 1) ? createAutumnLengaTree() : createHighDetailPineTree();
  const sc = 0.85 + (i % 5) * 0.22;
  tree.scale.set(sc, sc * (0.95 + (i % 3) * 0.12), sc);
  wrapper.add(tree);

  // Sombra de contacto (Ambient Occlusion) en la base del árbol para que no flote
  const treeAo = new THREE.Mesh(new THREE.PlaneGeometry(5.5 * sc, 5.5 * sc), contactShadowMat);
  treeAo.rotation.x = -Math.PI / 2;
  treeAo.position.y = 0.28;
  wrapper.add(treeAo);

  if (i % 2 === 0) {
    const rock = createSculptedRockBoulder();
    rock.position.set(-1.6, 0.5, 1.3);
    rock.scale.setScalar(0.55 + (i % 4) * 0.25);
    wrapper.add(rock);
  }

  forestGroup.add(wrapper);
  const side = (i % 3 === 0) ? -1 : 1;
  const lat = side > 0 ? (9.5 + (i % 8) * 3.6) : (-10.0 - (i % 5) * 3.8);

  natureObjects.push({
    mesh: wrapper,
    side: side,
    offsetLateral: lat,
    distAhead: i * 6.0
  });
}
scene.add(forestGroup);

// ============================================================================
// 8. TRÁFICO 3D MULTI-PIEZA CON HALOS DE LUCES, SOMBRAS AO Y RUEDAS GIRATORIAS
// ============================================================================
const headlightFlareTex = createLightGlowTexture('rgba(255, 252, 230, 0.95)', 'rgba(255, 210, 120, 0.35)');
const taillightFlareTex = createLightGlowTexture('rgba(255, 60, 60, 0.95)', 'rgba(220, 20, 20, 0.35)');

const trafficGroup = new THREE.Group();
const vehicles = [
  createRealistic3DVehicle('truck', 0xb91c1c, -2.7, 110),
  createRealistic3DVehicle('car', 0x1d4ed8, -2.7, 250),
  createRealistic3DVehicle('suv', 0x0f766e, 2.5, 65)
];
vehicles.forEach(v => trafficGroup.add(v.mesh));
scene.add(trafficGroup);

function createRealistic3DVehicle(type, colorHex, laneOffset, initialRelDist) {
  const group = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.78,
    roughness: 0.22,
    envMapIntensity: 1.6
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.75 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.95, roughness: 0.05, envMapIntensity: 2.0 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.1 });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });

  // Sombra de contacto AO oscura bajo todo el chasis del vehículo
  const aoLen = type === 'truck' ? 12.2 : 5.4;
  const aoWid = type === 'truck' ? 3.4 : 2.5;
  const carAo = new THREE.Mesh(new THREE.PlaneGeometry(aoWid, aoLen), contactShadowMat);
  carAo.rotation.x = -Math.PI / 2;
  carAo.position.set(0, 0.06, type === 'truck' ? 0.4 : 0);
  group.add(carAo);

  function addLightFlare(x, y, z, isHeadlight, scale) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: isHeadlight ? headlightFlareTex : taillightFlareTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    sp.position.set(x, y, z);
    sp.scale.set(scale, scale, 1);
    group.add(sp);
  }

  if (type === 'truck') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.9, 2.6), paintMat);
    cab.position.set(0, 1.85, -3.2);
    cab.castShadow = true;
    cab.receiveShadow = true;
    group.add(cab);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.95, 0.1), glassMat);
    windshield.position.set(0, 2.45, -4.51);
    group.add(windshield);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.1), chromeMat);
    grille.position.set(0, 1.25, -4.51);
    group.add(grille);

    const trailerMat = new THREE.MeshStandardMaterial({
      map: createGrimeMetalTexture('#cbd5e1', 0.55),
      roughness: 0.48,
      metalness: 0.32
    });
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.3, 7.2), trailerMat);
    trailer.position.set(0, 2.25, 1.9);
    trailer.castShadow = true;
    trailer.receiveShadow = true;
    group.add(trailer);

    const fl1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), headlightMat); fl1.position.set(-0.95, 0.9, -4.52); group.add(fl1);
    const fl2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), headlightMat); fl2.position.set(0.95, 0.9, -4.52); group.add(fl2);
    addLightFlare(-0.95, 0.9, -4.65, true, 1.65);
    addLightFlare(0.95, 0.9, -4.65, true, 1.65);

    const rl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.1), taillightMat); rl.position.set(0, 0.85, 5.51); group.add(rl);
    addLightFlare(-0.9, 0.85, 5.65, false, 1.35);
    addLightFlare(0.9, 0.85, 5.65, false, 1.35);
  } else {
    const isSuv = type === 'suv';
    const w = 1.95;
    const hBody = isSuv ? 0.82 : 0.65;
    const l = isSuv ? 4.6 : 4.4;

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(w, hBody, l), paintMat);
    lowerBody.position.set(0, 0.4 + hBody / 2, 0);
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    group.add(lowerBody);

    const cabLen = isSuv ? 2.7 : 2.1;
    const cabH = isSuv ? 0.68 : 0.55;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, cabH, cabLen), glassMat);
    cabin.position.set(0, 0.4 + hBody + cabH / 2 - 0.05, isSuv ? 0.25 : 0.1);
    cabin.castShadow = true;
    group.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.08, cabLen * 0.88), paintMat);
    roof.position.set(0, 0.4 + hBody + cabH - 0.02, isSuv ? 0.25 : 0.1);
    group.add(roof);

    // Barras portaequipaje de techo en SUV y espejos laterales en autos
    if (isSuv) {
      [-0.68, 0.68].forEach(rx => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, cabLen * 0.78), darkTrimMat);
        rail.position.set(rx, 0.4 + hBody + cabH + 0.04, 0.25);
        group.add(rail);
      });
    }
    [-w * 0.48, w * 0.48].forEach(mx => {
      const sideMir = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.12), paintMat);
      sideMir.position.set(mx, 0.4 + hBody + 0.12, -0.65);
      group.add(sideMir);
    });

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.28, l * 1.02), darkTrimMat);
    bumper.position.set(0, 0.42, 0);
    group.add(bumper);

    const fl1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), headlightMat); fl1.position.set(-w * 0.35, 0.72, -l / 2 - 0.02); group.add(fl1);
    const fl2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), headlightMat); fl2.position.set(w * 0.35, 0.72, -l / 2 - 0.02); group.add(fl2);
    addLightFlare(-w * 0.35, 0.72, -l / 2 - 0.12, true, 1.45);
    addLightFlare(w * 0.35, 0.72, -l / 2 - 0.12, true, 1.45);

    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.14, 0.08), taillightMat); tailBar.position.set(0, 0.78, l / 2 + 0.02); group.add(tailBar);
    addLightFlare(-w * 0.34, 0.78, l / 2 + 0.12, false, 1.25);
    addLightFlare(w * 0.34, 0.78, l / 2 + 0.12, false, 1.25);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.40, 0.40, 0.32, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 8);
  rimGeo.rotateZ(Math.PI / 2);

  const zOff = type === 'truck' ? 3.2 : 1.45;
  const xOff = type === 'truck' ? 1.25 : 0.96;
  const wheelMeshes = [];
  [[-xOff, 0.40, -zOff], [xOff, 0.40, -zOff], [-xOff, 0.40, zOff], [xOff, 0.40, zOff]].forEach(pos => {
    const wGrp = new THREE.Group();
    wGrp.position.set(...pos);
    const tire = new THREE.Mesh(wheelGeo, darkTrimMat);
    wGrp.add(tire);
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    wGrp.add(rim);
    group.add(wGrp);
    wheelMeshes.push(wGrp);
  });

  return {
    mesh: group,
    wheels: wheelMeshes,
    type: type,
    speed: type === 'truck' ? 68 : 84,
    laneOffset: laneOffset,
    distAhead: initialRelDist,
    passed: false
  };
}

// ============================================================================
// 9. CABINA EN PRIMERA PERSONA: SCRAMBLER CLÁSICA CON TEXTURAS DE USO Y SUCIEDAD
// ============================================================================
const cockpitGroup = new THREE.Group();
// Posición del chasis respecto a los ojos del piloto sentado en la Scrambler (altura real sobre el asfalto)
cockpitGroup.position.set(0, -0.22, -0.24);
cockpitGroup.rotation.x = 0.14;

const carbonWeaveTex = createCarbonWeaveTexture();
const scramblerGreenMat = new THREE.MeshPhysicalMaterial({
  map: createGrimeMetalTexture('#1f3b30', 0.22),
  roughness: 0.20,
  metalness: 0.58,
  clearcoat: 0.92,
  clearcoatRoughness: 0.14,
  envMapIntensity: 1.9
});
const creamBadgeMat = new THREE.MeshPhysicalMaterial({
  map: createGrimeMetalTexture('#efe8d5', 0.25),
  metalness: 0.22,
  roughness: 0.24,
  clearcoat: 0.85,
  envMapIntensity: 1.5
});
const goldAnodizedMat = new THREE.MeshStandardMaterial({
  map: createGrimeMetalTexture('#d4af37', 0.28),
  metalness: 0.88,
  roughness: 0.24,
  envMapIntensity: 1.8
});
const chromeBrightMat = new THREE.MeshStandardMaterial({
  color: 0xf8fafc,
  metalness: 0.98,
  roughness: 0.07,
  envMapIntensity: 2.4
});
const brushedAluminumMat = new THREE.MeshStandardMaterial({
  map: createGrimeMetalTexture('#cbd5e1', 0.45),
  normalMap: terrainMaps.norm,
  normalScale: new THREE.Vector2(0.08, 0.08),
  metalness: 0.86,
  roughness: 0.32,
  envMapIntensity: 1.6
});
const darkTitaniumMat = new THREE.MeshStandardMaterial({
  map: createGrimeMetalTexture('#262b33', 0.35),
  metalness: 0.78,
  roughness: 0.36,
  envMapIntensity: 1.4
});
const matteBlackMat = new THREE.MeshStandardMaterial({
  map: createGrimeMetalTexture('#14171d', 0.42),
  roughness: 0.82,
  metalness: 0.18
});
const vintageLeatherMat = new THREE.MeshStandardMaterial({
  map: createDistressedLeatherTexture(),
  normalMap: terrainMaps.norm,
  normalScale: new THREE.Vector2(0.32, 0.32),
  roughness: 0.62,
  metalness: 0.08
});
const rubberPadMat = new THREE.MeshStandardMaterial({
  color: 0x181a1f,
  normalMap: terrainMaps.norm,
  normalScale: new THREE.Vector2(0.35, 0.35),
  roughness: 0.92,
  metalness: 0.05
});

// A. Faro Delantero Redondo Clásico con Aro Cromado, Rejilla Scrambler y Guardabarros Alto
const headlightGroup = new THREE.Group();
headlightGroup.position.set(0, -0.18, -0.66);

// Cazoleta redonda del faro (vista desde arriba por el piloto)
const bowlGeo = new THREE.SphereGeometry(0.105, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.65);
const headlightBowl = new THREE.Mesh(bowlGeo, matteBlackMat);
headlightBowl.rotation.x = -Math.PI / 2;
headlightGroup.add(headlightBowl);

// Aro cromado clásico del faro redondo
const headlightRim = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.010, 16, 36), chromeBrightMat);
headlightRim.position.set(0, 0, -0.035);
headlightGroup.add(headlightRim);

// Rejilla protectora de faro estilo Scrambler (barras horizontales negras)
for (let g = -2; g <= 2; g++) {
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.19, 8), matteBlackMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, g * 0.028, -0.048);
  headlightGroup.add(bar);
}

// Pequeña visera / placa portanúmero de aluminio cepillado sobre el faro (estilo Triumph 400 X)
const flyscreenGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.09, 24, 1, true, Math.PI * 0.72, Math.PI * 0.56);
const flyscreen = new THREE.Mesh(flyscreenGeo, brushedAluminumMat);
flyscreen.rotation.x = -0.45;
flyscreen.position.set(0, 0.075, -0.01);
headlightGroup.add(flyscreen);

// Guiños delanteros redondos tipo bala (Bullet Turn Signals) a los lados de la horquilla
[-1, 1].forEach(s => {
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), matteBlackMat);
  stalk.rotation.z = Math.PI / 2;
  stalk.position.set(s * 0.17, -0.02, 0.04);
  headlightGroup.add(stalk);

  const bulletBody = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), chromeBrightMat);
  bulletBody.scale.set(1.0, 1.0, 1.4);
  bulletBody.position.set(s * 0.20, -0.02, 0.04);
  headlightGroup.add(bulletBody);

  const amberLens = new THREE.Mesh(
    new THREE.SphereGeometry(0.020, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b })
  );
  amberLens.position.set(s * 0.20, -0.02, 0.025);
  headlightGroup.add(amberLens);
});

// Guardabarros delantero de aluminio cepillado y neumático con tacos Scrambler giratorio abajo adelante
const frontFender = new THREE.Mesh(
  new THREE.BoxGeometry(0.13, 0.015, 0.28),
  brushedAluminumMat
);
frontFender.position.set(0, -0.15, -0.10);
frontFender.rotation.x = 0.20;
headlightGroup.add(frontFender);

// Grupo giratorio de la rueda delantera con tacos Scrambler y disco de freno perforado
const frontWheelSpinGroup = new THREE.Group();
frontWheelSpinGroup.position.set(0, -0.44, -0.12);

const frontTireCrown = new THREE.Mesh(
  new THREE.TorusGeometry(0.28, 0.068, 16, 36),
  rubberPadMat
);
frontTireCrown.rotation.y = Math.PI / 2;
frontWheelSpinGroup.add(frontTireCrown);

// Tacos off-road / Scrambler esculpidos alrededor de la banda de rodadura
for (let k = 0; k < 18; k++) {
  const ang = (k / 18) * Math.PI * 2;
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.018, 0.036), rubberPadMat);
  knob.position.set(0, Math.sin(ang) * 0.342, Math.cos(ang) * 0.342);
  knob.rotation.x = -ang;
  frontWheelSpinGroup.add(knob);
}

// Disco de freno delantero flotante en acero cepillado
const brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.008, 24), brushedAluminumMat);
brakeDisc.rotation.z = Math.PI / 2;
brakeDisc.position.x = -0.065;
frontWheelSpinGroup.add(brakeDisc);

headlightGroup.add(frontWheelSpinGroup);

cockpitGroup.add(headlightGroup);

// B. Reloj Circular Único Clásico-Moderno (Estilo Triumph 400 X / Royal Enfield Bear 650)
const dashCanvas = document.createElement('canvas');
dashCanvas.width = 512;
dashCanvas.height = 512;
const dashCtx = dashCanvas.getContext('2d');
const dashTexture = new THREE.CanvasTexture(dashCanvas);
dashTexture.anisotropy = 4;

const dashGroup = new THREE.Group();
// Montado sobre las torretas e inclinado hacia los ojos altos del piloto
dashGroup.position.set(0, -0.032, -0.53);
dashGroup.rotation.x = -0.52;

// Copa cilíndrica trasera en aluminio cepillado y negro
const gaugeCup = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.088, 0.042, 48), matteBlackMat);
gaugeCup.rotation.x = Math.PI / 2;
gaugeCup.position.z = -0.015;
dashGroup.add(gaugeCup);

// Aro biselado cromado clásico alrededor del reloj
const gaugeChromeBezel = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.007, 18, 48), chromeBrightMat);
gaugeChromeBezel.position.z = 0.006;
dashGroup.add(gaugeChromeBezel);

// Esfera circular del reloj (Dial analógico + pantalla digital integrada)
const dashScreen = new THREE.Mesh(
  new THREE.CircleGeometry(0.090, 48),
  new THREE.MeshBasicMaterial({ map: dashTexture })
);
dashScreen.position.set(0, 0, 0.008);
dashGroup.add(dashScreen);

// Cristal convexo antirreflejo sobre el reloj
const gaugeGlass = new THREE.Mesh(
  new THREE.CircleGeometry(0.090, 36),
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.14,
    roughness: 0.04,
    clearcoat: 1.0,
    envMapIntensity: 2.2
  })
);
gaugeGlass.position.set(0, 0, 0.010);
dashGroup.add(gaugeGlass);

cockpitGroup.add(dashGroup);

// C. Horquilla Dorada de 43mm, Fuelles de Goma Clásicos (Fork Gaiters), Tija Forjada y Torretas Altas
const forkGeo = new THREE.CylinderGeometry(0.032, 0.030, 0.48, 20);

[-1, 1].forEach(s => {
  const fork = new THREE.Mesh(forkGeo, goldAnodizedMat);
  fork.position.set(s * 0.148, -0.26, -0.53);
  fork.rotation.x = Math.PI / 7.2;
  cockpitGroup.add(fork);

  // Fuelles de goma acanalada clásicos de Scrambler en la parte inferior de la horquilla
  for (let r = 0; r < 6; r++) {
    const bellowRing = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 10, 20), rubberPadMat);
    bellowRing.rotation.x = Math.PI / 2 + Math.PI / 7.2;
    bellowRing.position.set(
      s * 0.148,
      -0.31 - r * 0.018,
      -0.555 - r * 0.008
    );
    cockpitGroup.add(bellowRing);
  }

  // Tapas superiores de horquilla en aluminio mecanizado plata
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), brushedAluminumMat);
  cap.position.set(s * 0.148, -0.055, -0.435);
  cap.rotation.x = Math.PI / 7.2;
  cockpitGroup.add(cap);

  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 6), goldAnodizedMat);
  bolt.position.set(s * 0.148, -0.052, -0.433);
  bolt.rotation.x = Math.PI / 7.2;
  cockpitGroup.add(bolt);
});

// Tija Superior Forjada (Triple Clamp) y Torretas Altas
const tripleClampGroup = new THREE.Group();
tripleClampGroup.position.set(0, -0.095, -0.465);
tripleClampGroup.rotation.x = Math.PI / 7.2;

const clampMain = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.022, 0.088), matteBlackMat);
tripleClampGroup.add(clampMain);

[-0.072, 0.072].forEach(rx => {
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.048, 12), matteBlackMat);
  riser.position.set(rx, 0.026, 0.015);
  tripleClampGroup.add(riser);

  const riserCap = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.010, 0.044), brushedAluminumMat);
  riserCap.position.set(rx, 0.050, 0.015);
  tripleClampGroup.add(riserCap);
});

const stemNut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 6), chromeBrightMat);
stemNut.position.set(0, 0.014, -0.005);
tripleClampGroup.add(stemNut);

// Tambor de llave con llavero de cuero marrón clásico
const ignitionBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.024, 16), chromeBrightMat);
ignitionBarrel.position.set(0.065, 0.015, -0.045);
tripleClampGroup.add(ignitionBarrel);

const keyTag = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.005, 0.042), vintageLeatherMat);
keyTag.position.set(0.065, 0.028, -0.028);
keyTag.rotation.y = 0.35;
tripleClampGroup.add(keyTag);

cockpitGroup.add(tripleClampGroup);

// D. Tanque Lágrima Clásico Bitono, Aletas del Motor Bicilíndrico y Curvas de Escape Cromadas
const tankGroup = new THREE.Group();

// Cuerpo principal del tanque lágrima en Verde Scrambler
const tankMain = new THREE.Mesh(new THREE.SphereGeometry(0.245, 32, 24), scramblerGreenMat);
tankMain.scale.set(0.92, 0.60, 1.58);
tankMain.position.set(0, -0.32, -0.22);
tankGroup.add(tankMain);

// Paneles laterales crema bitono con filete dorado
const tankCreamPanel = new THREE.Mesh(
  new THREE.SphereGeometry(0.246, 28, 18, 0, Math.PI * 2, 0.55, 0.65),
  creamBadgeMat
);
tankCreamPanel.scale.set(0.925, 0.60, 1.52);
tankCreamPanel.position.set(0, -0.32, -0.22);
tankGroup.add(tankCreamPanel);

// Almohadillas laterales de goma negra acanalada para las rodillas (Knee Pads)
[-1, 1].forEach(s => {
  const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.22), rubberPadMat);
  kneePad.position.set(s * 0.205, -0.30, -0.20);
  kneePad.rotation.z = s * -0.25;
  kneePad.rotation.y = s * 0.12;
  tankGroup.add(kneePad);
});

// Correa central de aluminio cepillado y cuero sobre el lomo del tanque
const tankStrap = new THREE.Mesh(
  new THREE.SphereGeometry(0.248, 24, 16, -0.14, 0.28, 0.25, 1.1),
  vintageLeatherMat
);
tankStrap.scale.set(0.92, 0.60, 1.58);
tankStrap.position.set(0, -0.318, -0.22);
tankGroup.add(tankStrap);

// Tapa de combustible clásica tipo Monza en cromo pulido (desplazada a la derecha como en las clásicas británicas)
const monzaBase = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.014, 24), chromeBrightMat);
monzaBase.position.set(0.068, -0.182, -0.25);
monzaBase.rotation.z = -0.22;
monzaBase.rotation.x = 0.12;
tankGroup.add(monzaBase);

const monzaLatch = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.082), chromeBrightMat);
monzaLatch.position.set(0.068, -0.172, -0.25);
monzaLatch.rotation.z = -0.22;
monzaLatch.rotation.x = 0.12;
tankGroup.add(monzaLatch);

// Aletas de refrigeración del motor bicilíndrico y curvas de escape cromadas asomando bajo el tanque
for (let f = 0; f < 5; f++) {
  const finPlate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.006, 0.18), brushedAluminumMat);
  finPlate.position.set(0, -0.46 - f * 0.018, -0.34);
  tankGroup.add(finPlate);
}

[-1, 1].forEach(s => {
  const headerCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(s * 0.11, -0.48, -0.40),
    new THREE.Vector3(s * 0.18, -0.54, -0.52),
    new THREE.Vector3(s * 0.16, -0.66, -0.32)
  );
  const headerPipe = new THREE.Mesh(new THREE.TubeGeometry(headerCurve, 14, 0.022, 12, false), chromeBrightMat);
  tankGroup.add(headerPipe);
});

cockpitGroup.add(tankGroup);

// E. Manillar Ancho Scrambler con Barra Transversal, Pad Bordado, Cubrepuños y Espejos Redondos
const steeringAssembly = new THREE.Group();
steeringAssembly.position.set(0, -0.115, -0.45);

// Tubo central del manillar ancho
const centerBar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 16), matteBlackMat);
centerBar.rotation.z = Math.PI / 2;
steeringAssembly.add(centerBar);

// Soportes verticales y Barra Transversal de Refuerzo (Scrambler Crossbar)
[-0.13, 0.13].forEach(bx => {
  const clampStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.055, 10), brushedAluminumMat);
  clampStrut.position.set(bx, 0.028, 0);
  steeringAssembly.add(clampStrut);
});

const crossBarTube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.30, 12), matteBlackMat);
crossBarTube.rotation.z = Math.PI / 2;
crossBarTube.position.set(0, 0.052, 0);
steeringAssembly.add(crossBarTube);

// Protector acolchado cilíndrico en la barra transversal con bordado clásico "SCRAMBLER // 650 TWIN"
const crossBarPadMat = new THREE.MeshStandardMaterial({
  map: createCrossbarPadTexture(),
  normalMap: terrainMaps.norm,
  normalScale: new THREE.Vector2(0.28, 0.28),
  roughness: 0.65,
  metalness: 0.06
});
const crossBarPad = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.21, 20), crossBarPadMat);
crossBarPad.rotation.z = Math.PI / 2;
crossBarPad.rotation.x = -0.35;
crossBarPad.position.set(0, 0.052, 0);
steeringAssembly.add(crossBarPad);

// Costuras / anillos del protector acolchado
[-0.085, 0.085].forEach(px => {
  const padRing = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.008, 16), matteBlackMat);
  padRing.rotation.z = Math.PI / 2;
  padRing.position.set(px, 0.052, 0);
  steeringAssembly.add(padRing);
});

const mirrorReflTex = createMirrorReflectionTexture();
const mirrorGlassMat = new THREE.MeshStandardMaterial({
  map: mirrorReflTex,
  metalness: 0.85,
  roughness: 0.04,
  envMapIntensity: 2.2
});

function createHandlebarSide(isLeft) {
  const s = isLeft ? -1 : 1;
  const sideGroup = new THREE.Group();
  sideGroup.position.set(s * 0.15, 0.015, 0);
  // Manillar Scrambler más ancho y erguido
  sideGroup.rotation.y = s * -0.11;
  sideGroup.rotation.z = s * 0.04;

  // Tubo lateral del manillar
  const barTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.28, 16), matteBlackMat);
  barTube.rotation.z = Math.PI / 2;
  barTube.position.x = s * 0.14;
  sideGroup.add(barTube);

  // Piña de conmutadores clásica en aluminio y negro con botones retro
  const podGroup = new THREE.Group();
  podGroup.position.set(s * 0.075, 0.002, 0.004);
  const podMain = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.048, 16), darkTitaniumMat);
  podMain.rotation.z = Math.PI / 2;
  podGroup.add(podMain);

  const redSw = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.012, 0.016),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.35 })
  );
  redSw.position.set(0, 0.027, 0.006);
  podGroup.add(redSw);

  const metalToggle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.014, 10), chromeBrightMat);
  metalToggle.rotation.x = Math.PI / 2;
  metalToggle.position.set(s * 0.008, -0.006, 0.028);
  podGroup.add(metalToggle);

  sideGroup.add(podGroup);

  // Bomba de Freno / Embrague y Cable Mallado
  const masterCyl = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.030, 0.034), matteBlackMat);
  masterCyl.position.set(s * 0.11, 0.010, -0.022);
  sideGroup.add(masterCyl);

  const hoseCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(s * 0.10, 0.005, -0.035),
    new THREE.Vector3(s * 0.03, -0.04, -0.055),
    new THREE.Vector3(s * 0.00, -0.14, -0.02)
  );
  const hoseGeo = new THREE.TubeGeometry(hoseCurve, 12, 0.0045, 8, false);
  const hoseMesh = new THREE.Mesh(hoseGeo, matteBlackMat);
  sideGroup.add(hoseMesh);

  // Puño abombado tipo barril (Barrel Grip clásico con textura)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.020, 0.135, 20), rubberPadMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.x = s * 0.19;
  sideGroup.add(grip);

  // Cubrepuños Scrambler (Handguard con alma de aluminio y deflector negro)
  const handguardShield = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.058, 0.012), matteBlackMat);
  handguardShield.position.set(s * 0.19, 0.004, -0.068);
  handguardShield.rotation.y = s * 0.18;
  sideGroup.add(handguardShield);

  const handguardBar = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.012, 0.016), brushedAluminumMat);
  handguardBar.position.set(s * 0.19, 0.004, -0.072);
  handguardBar.rotation.y = s * 0.18;
  sideGroup.add(handguardBar);

  // Contrapeso cromado en el extremo del manillar
  const barEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.018, 0.024, 16), chromeBrightMat);
  barEnd.rotation.z = Math.PI / 2;
  barEnd.position.x = s * 0.268;
  sideGroup.add(barEnd);

  // Maneta articulada en aluminio cepillado
  const leverPivot = new THREE.Group();
  leverPivot.position.set(s * 0.11, 0.0, -0.028);
  const leverBlade = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.009, 0.014), brushedAluminumMat);
  leverBlade.position.set(s * 0.070, 0, -0.020);
  leverBlade.rotation.y = s * 0.18;
  leverPivot.add(leverBlade);

  const leverBall = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 10), chromeBrightMat);
  leverBall.position.set(s * 0.142, 0, -0.033);
  leverPivot.add(leverBall);
  sideGroup.add(leverPivot);

  // Espejo Retrovisor REDONDO Clásico (Estilo Triumph Scrambler 400 X / Bear 650)
  const stemCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(s * 0.105, 0.02, -0.015),
    new THREE.Vector3(s * 0.145, 0.11, -0.020),
    new THREE.Vector3(s * 0.205, 0.165, -0.025)
  );
  const mirrorStem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 12, 0.0055, 10, false), chromeBrightMat);
  sideGroup.add(mirrorStem);

  const mirrorHead = new THREE.Group();
  mirrorHead.position.set(s * 0.215, 0.172, -0.025);
  mirrorHead.rotation.y = s * -0.22;

  // Carcasa redonda trasera en negro satinado + aro cromado
  const roundCase = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.016, 32), matteBlackMat);
  roundCase.rotation.x = Math.PI / 2;
  mirrorHead.add(roundCase);

  const roundRim = new THREE.Mesh(new THREE.TorusGeometry(0.057, 0.004, 12, 32), chromeBrightMat);
  roundRim.position.z = 0.007;
  mirrorHead.add(roundRim);

  // Cristal circular con reflejo vial
  const roundGlass = new THREE.Mesh(new THREE.CircleGeometry(0.055, 32), mirrorGlassMat);
  roundGlass.position.z = 0.009;
  mirrorHead.add(roundGlass);

  sideGroup.add(mirrorHead);

  // Mano del Piloto con Guante Clásico Scrambler de Cuero Marrón Cognac
  const handGroup = new THREE.Group();
  handGroup.position.set(s * 0.19, 0.006, 0.01);

  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.044, 18, 14), vintageLeatherMat);
  palm.scale.set(1.15, 0.62, 1.08);
  handGroup.add(palm);

  // Costuras acolchadas sobre los nudillos del guante clásico
  const knucklePad = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), vintageLeatherMat);
  knucklePad.scale.set(1.12, 0.40, 0.55);
  knucklePad.position.set(0, 0.020, -0.010);
  handGroup.add(knucklePad);

  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0072, 0.056, 10), vintageLeatherMat);
    const onLever = f < 2;
    finger.position.set((f - 1.5) * 0.018, onLever ? 0.004 : -0.004, onLever ? -0.044 : -0.036);
    finger.rotation.x = onLever ? Math.PI / 2.2 : Math.PI / 2.6;
    handGroup.add(finger);
  }

  // Manga de campera encerada oscura extendida hacia los hombros del piloto sentado más atrás
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0x1c211e, roughness: 0.78, metalness: 0.08 });
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.062, 0.48, 16), jacketMat);
  sleeve.position.set(s * 0.04, -0.10, 0.23);
  sleeve.rotation.x = Math.PI / 2.45;
  sleeve.rotation.z = s * -0.12;
  handGroup.add(sleeve);

  sideGroup.add(handGroup);

  return { sideGroup, leverPivot, handGroup };
}

const leftSideBar = createHandlebarSide(true);
const rightSideBar = createHandlebarSide(false);
steeringAssembly.add(leftSideBar.sideGroup);
steeringAssembly.add(rightSideBar.sideGroup);

// Depósito cilíndrico de líquido de freno en el manillar derecho
const fluidCup = new THREE.Mesh(
  new THREE.CylinderGeometry(0.016, 0.016, 0.030, 16),
  new THREE.MeshPhysicalMaterial({ color: 0xd97706, transparent: true, opacity: 0.85, roughness: 0.1, clearcoat: 1.0 })
);
fluidCup.position.set(0.24, 0.058, -0.020);
steeringAssembly.add(fluidCup);

const fluidCap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 16), brushedAluminumMat);
fluidCap.position.set(0.24, 0.075, -0.020);
steeringAssembly.add(fluidCap);

cockpitGroup.add(steeringAssembly);

// Haz de luz volumétrico sutil del faro redondo proyectado hacia la ruta
const beamConeGeo = new THREE.ConeGeometry(2.6, 16.0, 24, 1, true);
beamConeGeo.rotateX(Math.PI / 2);
const beamConeMat = new THREE.MeshBasicMaterial({
  color: 0xfffbeb,
  transparent: true,
  opacity: 0.055,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
const headlightBeamCone = new THREE.Mesh(beamConeGeo, beamConeMat);
headlightBeamCone.position.set(0, -0.45, -8.8);
cockpitGroup.add(headlightBeamCone);

// Activar auto-sombreado en toda la cabina (el manillar y las manos proyectan sombra real sobre el tanque)
cockpitGroup.traverse((child) => {
  if (child.isMesh && child !== dashScreen && child !== gaugeGlass && child !== headlightBeamCone) {
    child.castShadow = true;
    child.receiveShadow = true;
  }
});

camera.add(cockpitGroup);
scene.add(camera);

// ============================================================================
// 10. CONTROLES Y TECLADO
// ============================================================================
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
    headlightBeamCone.visible = simState.headlights;
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
    simState.clutchPull = 1.0;
    window.soundEngine.playGearShift();
    simState.rpm = Math.max(simState.idleRpm, simState.rpm * 0.72);
  }
}

function shiftDown() {
  if (!simState.active || simState.paused) return;
  if (simState.gear > 0) {
    simState.gear--;
    simState.clutchPull = 1.0;
    window.soundEngine.playGearShift();
    if (simState.gear > 0) {
      simState.rpm = Math.min(simState.maxRpm, simState.rpm * 1.32);
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

// ============================================================================
// 11. BUCLE PRINCIPAL DE SIMULACIÓN FÍSICA Y RENDERIZADO
// ============================================================================
let lastTime = performance.now();

function gameLoop(now) {
  const dt = Math.min(0.08, (now - lastTime) / 1000);
  lastTime = now;

  skyUniforms.uTime.value = now * 0.001;

  if (simState.active && !simState.paused) {
    updateHandlingPhysics(dt);
  }

  updateWorldMeshes();
  updateTFT();
  renderer.render(scene, camera);

  if (simState.active) {
    requestAnimationFrame(gameLoop);
  }
}

function updateHandlingPhysics(dt) {
  if (!simState.bikeInitialized) {
    const initOri = getRoadOrientation(simState.playerDistance);
    simState.bikeX = initOri.x + initOri.rightX * simState.laneOffset;
    simState.bikeZ = initOri.z + initOri.rightZ * simState.laneOffset;
    simState.bikeYaw = initOri.yaw;
    simState.prevGroundY = initOri.y + 0.04;
    simState.bikeInitialized = true;
  }

  const currentGear = simState.gear;
  const maxGearSpeed = simState.gearLimits[currentGear];
  const minGearSpeed = simState.gearMinSpeed[currentGear];

  // Clasificación física de la superficie actual (Asfalto vs. Banquina de Ripio vs. Tierra/Montaña)
  const absLat = Math.abs(simState.laneOffset);
  const halfRoad = ROAD_WIDTH / 2;
  const isAsphalt = absLat <= halfRoad;
  const isShoulder = absLat > halfRoad && absLat <= halfRoad + 2.4;
  const isDirt = absLat > halfRoad + 2.4;
  const isOffRoad = !isAsphalt;

  simState.surfaceType = isAsphalt ? 'asphalt' : (isShoulder ? 'shoulder' : 'dirt');
  const surfaceGrip = isAsphalt ? 1.0 : (isShoulder ? 0.68 : 0.54);

  // Resistencia a la rodadura del suelo y efecto real de la gravedad en subidas/bajadas
  const rollingDrag = isAsphalt ? 0.0 : (isShoulder ? 5.5 + simState.speed * 0.05 : 12.5 + simState.speed * 0.14);
  const slopeGravityForce = Math.sin(simState.groundPitch) * 38.0; // Positivo al subir (frena), negativo al bajar (impulsa)

  // 1. Acelerador, Tracción en Asfalto vs. Patinamiento en Tierra y Curva de Potencia
  if (keys.throttle) {
    if (currentGear === 0) {
      simState.rpm = Math.min(simState.maxRpm, simState.rpm + 7000 * dt);
      simState.rearWheelSpin = THREE.MathUtils.lerp(simState.rearWheelSpin, 0, 8 * dt);
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, 0, 0.1);
    } else {
      const inPowerBand = (simState.rpm >= 4000 && simState.rpm <= 8200);
      const accelBoost = inPowerBand ? 1.38 : 0.85;

      // En tierra y marchas bajas, abrir el gas a fondo genera patinamiento de la rueda trasera con tacos
      const spinTarget = (isOffRoad && currentGear <= 3) ? (0.35 * (4 - currentGear) * (1.1 - surfaceGrip)) : 0;
      simState.rearWheelSpin = THREE.MathUtils.lerp(simState.rearWheelSpin, spinTarget, 6.0 * dt);

      const tractionEff = isAsphalt ? 1.0 : (isShoulder ? 0.84 : 0.72);

      if (simState.speed < minGearSpeed - 15) {
        simState.speed = Math.max(0, simState.speed + (7.5 * tractionEff - slopeGravityForce * 0.5) * dt);
      } else {
        const topRatio = Math.max(0, 1 - (simState.speed / maxGearSpeed));
        const netAccel = (34 * accelBoost * topRatio * tractionEff) - rollingDrag - slopeGravityForce;
        simState.speed = Math.max(0, Math.min(simState.maxSpeed, simState.speed + netAccel * dt));
      }

      const gearRatio = simState.speed / maxGearSpeed;
      const spinRpmBoost = simState.rearWheelSpin * 1650;
      simState.rpm = Math.min(
        simState.maxRpm,
        simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm)) + spinRpmBoost
      );
      simState.fuelLiters = Math.max(0, simState.fuelLiters - (0.007 + (simState.rpm / simState.maxRpm) * 0.02) * dt);

      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, isAsphalt ? 0.026 : 0.034, 0.08);
    }
  } else {
    simState.rearWheelSpin = THREE.MathUtils.lerp(simState.rearWheelSpin, 0, 8 * dt);
    if (currentGear === 0) {
      simState.rpm = Math.max(simState.idleRpm, simState.rpm - 4500 * dt);
      simState.speed = Math.max(0, simState.speed - (9 + rollingDrag + slopeGravityForce) * dt);
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, 0, 0.1);
    } else {
      const engineBraking = 10 + (currentGear === 1 ? 16 : 8) + rollingDrag + slopeGravityForce;
      simState.speed = Math.max(0, simState.speed - engineBraking * dt);
      const gearRatio = simState.speed / maxGearSpeed;
      simState.rpm = Math.max(simState.idleRpm, simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm)));
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, -0.010, 0.08);
    }
  }

  // 2. Freno Diferenciado en Asfalto (Mordida Firme) vs. Tierra/Ripio (Menor Agarre y Bloqueo en Grava)
  if (keys.brake) {
    const brakeDecel = isAsphalt ? 60.0 : (isShoulder ? 41.0 : 32.0);
    simState.speed = Math.max(0, simState.speed - brakeDecel * dt);
    simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, isAsphalt ? -0.056 : -0.042, 0.16);
    simState.brakePull = THREE.MathUtils.lerp(simState.brakePull, 1.0, 0.25);

    const lockThreshold = isAsphalt ? 65 : 28;
    if (simState.speed > lockThreshold && Math.random() < (isAsphalt ? 0.05 : 0.12)) {
      window.soundEngine.playTireScreech();
    }
  } else {
    simState.brakePull = THREE.MathUtils.lerp(simState.brakePull, 0.0, 0.2);
  }

  simState.clutchPull = THREE.MathUtils.lerp(simState.clutchPull, 0.0, 0.15);

  leftSideBar.leverPivot.rotation.y = -simState.clutchPull * 0.25;
  rightSideBar.leverPivot.rotation.y = simState.brakePull * 0.25;

  // 3. Dirección y Cinemática Pura de Moto (Trazada Firme, Sin Derrapes Artificiales)
  let steer = 0;
  if (keys.steerLeft) steer -= 1;
  if (keys.steerRight) steer += 1;

  const speedMps = simState.speed / 3.6;
  simState.steeringInput = THREE.MathUtils.lerp(simState.steeringInput, steer, 9.0 * dt);

  // Estando detenida (0 km/h), la moto no se inclina ni rota sobre su eje
  const rollingFactor = smoothstep(0.3, 4.0, simState.speed);
  const leanSpeedScale = smoothstep(3.0, 32.0, simState.speed);

  // Ángulo de inclinación realista según velocidad y superficie
  const surfaceMaxLean = isAsphalt ? 0.50 : 0.36;
  const targetLean = simState.steeringInput * surfaceMaxLean * leanSpeedScale * rollingFactor;

  const gyroStability = 1.0 / (1.0 + (simState.speed / 120) * 0.45);
  const prevLean = simState.leanAngle;
  const leanResponse = (steer !== 0 ? 5.8 : 5.0) * gyroStability;
  simState.leanAngle = THREE.MathUtils.lerp(simState.leanAngle, targetLean, (simState.speed < 1.0 ? 8.0 : leanResponse) * dt);
  simState.leanRate = (simState.leanAngle - prevLean) / Math.max(0.001, dt);

  // Modulador de frenada/aceleración suave
  const brakeSteerFactor = keys.brake ? 1.08 : (keys.throttle ? 0.94 : 1.0);

  // A) Giro cinemático a baja velocidad por geometría de dirección (manillar)
  // R_min = 5.2m. Desaparece a 0 km/h porque multiplica por speedMps
  const minTurnRadius = 5.2;
  const lowSpeedBlend = Math.max(0.0, 1.0 - simState.speed / 38.0);
  const kinematicBarYawRate = simState.steeringInput * (speedMps / minTurnRadius) * lowSpeedBlend;

  // B) Giro en velocidad por inclinación física centrípeta: omega = (g * tan(lean)) / v
  // Trazada firme sobre rieles, exactamente alineada con la rueda
  const effVelForLean = Math.max(5.5, speedMps * 0.90);
  const dynamicLeanYawRate = ((10.2 * Math.tan(simState.leanAngle)) / effVelForLean) * rollingFactor * (isAsphalt ? 1.0 : 0.82);

  const totalYawRate = (kinematicBarYawRate + dynamicLeanYawRate) * brakeSteerFactor;

  // En Three.js: +Yaw izquierda (steer < 0), -Yaw derecha (steer > 0)
  simState.bikeYaw -= totalYawRate * dt;

  // Vector frontal exacto de avance de las ruedas
  const fwdX = -Math.sin(simState.bikeYaw);
  const fwdZ = -Math.cos(simState.bikeYaw);

  // Avance 100% acoplado al neumático (la moto rueda hacia donde apuntan las ruedas, sin derrapes laterales)
  simState.velX = fwdX * speedMps;
  simState.velZ = fwdZ * speedMps;

  simState.bikeX += simState.velX * dt;
  simState.bikeZ += simState.velZ * dt;

  // Calcular estación de ruta más cercana, desplazamiento lateral libre y altura exacta del suelo bajo las ruedas
  const centerInfo = getClosestRoadInfo(simState.bikeX, simState.bikeZ);
  const roadOri = centerInfo.roadOri;
  simState.playerDistance = centerInfo.roadDist;
  simState.laneOffset = centerInfo.lateral;

  // Limitar únicamente a los bordes extremos de la malla de terreno de 320m para no caer al vacío
  if (Math.abs(simState.laneOffset) > 145) {
    const clampedLat = Math.sign(simState.laneOffset) * 145;
    simState.bikeX = roadOri.x + roadOri.rightX * clampedLat;
    simState.bikeZ = roadOri.z + roadOri.rightZ * clampedLat;
    simState.laneOffset = clampedLat;
  }

  simState.onRumble = (Math.abs(simState.laneOffset) > 4.3);

  // Pendiente real 3D calculada entre la rueda trasera y la rueda delantera en cualquier ángulo de giro (0° a 360°)
  const fInfo = getClosestRoadInfo(simState.bikeX + fwdX * 0.75, simState.bikeZ + fwdZ * 0.75);
  const rInfo = getClosestRoadInfo(simState.bikeX - fwdX * 0.75, simState.bikeZ - fwdZ * 0.75);
  const groundPitch = THREE.MathUtils.clamp(Math.atan2(fInfo.groundY - rInfo.groundY, 1.50), -0.45, 0.45);
  simState.groundPitch = groundPitch;

  // Mirada natural del piloto anticipando la trazada cuando la moto está en movimiento
  const targetLook = -simState.leanAngle * 0.22 - simState.steeringInput * 0.05 * rollingFactor;
  simState.headLookApex = THREE.MathUtils.lerp(simState.headLookApex, targetLook, 5.5 * dt);

  // Trabajo dinámico de la suspensión: firme en asfalto, absorbente sobre piedras y ondulaciones en tierra
  const groundVertVel = (centerInfo.groundY - simState.prevGroundY) / Math.max(0.001, dt);
  simState.prevGroundY = centerInfo.groundY;
  const offRoadBump = isOffRoad
    ? (Math.sin(simState.bikeX * 2.1 + simState.bikeZ * 1.9) * (isDirt ? 0.038 : 0.022) * Math.min(1, simState.speed / 28))
    : 0;
  const targetSusp = THREE.MathUtils.clamp(
    -groundVertVel * 0.005 + simState.pitchSuspension * 0.65 + offRoadBump,
    -0.09,
    0.07
  );
  simState.suspensionOffset = THREE.MathUtils.lerp(simState.suspensionOffset, targetSusp, 11.0 * dt);

  const speedWindBuffet = Math.pow(Math.max(0, simState.speed - 110) / 85, 2) * 0.006;
  const surfaceVibration = isAsphalt
    ? (simState.onRumble ? 0.014 : 0)
    : ((isDirt ? 0.026 : 0.018) * Math.min(1.0, simState.speed / 25));
  const vib = (simState.rpm / simState.maxRpm) * 0.0035 + surfaceVibration + speedWindBuffet;

  // Altura realista de los ojos sobre el suelo (1.34m sentado en la Scrambler)
  const riderEyeHeight = 1.34;

  camera.position.x = simState.bikeX + (Math.random() - 0.5) * vib;
  camera.position.y = centerInfo.groundY + riderEyeHeight + simState.suspensionOffset + (Math.random() - 0.5) * vib;
  camera.position.z = simState.bikeZ;

  // Orden Euler 'YXZ' para giro 360° limpio sin deformación de horizonte
  camera.rotation.order = 'YXZ';
  camera.rotation.y = simState.bikeYaw;
  camera.rotation.x = groundPitch - 0.042 + simState.pitchSuspension;
  camera.rotation.z = -simState.leanAngle * 0.40 + (isOffRoad ? 0 : roadOri.roll * Math.cos(simState.bikeYaw - roadOri.yaw));

  camera.fov = 63 + (simState.speed / simState.maxSpeed) * 11;
  camera.updateProjectionMatrix();

  // El chasis de la moto se inclina bajo el piloto y el manillar muestra giro directo a baja velocidad y contramanillar en velocidad
  cockpitGroup.rotation.z = -simState.leanAngle * 0.22;
  cockpitGroup.position.y = -0.22 + simState.pitchSuspension * 0.35 + offRoadBump * 0.35;
  const barVisualAngle = simState.speed < 28
    ? (-simState.steeringInput * 0.22 * (1.0 - simState.speed / 36))
    : (-simState.leanRate * 0.048 - simState.steeringInput * 0.038);
  steeringAssembly.rotation.y = THREE.MathUtils.lerp(steeringAssembly.rotation.y, barVisualAngle, 12.0 * dt);
  frontWheelSpinGroup.rotation.x -= (speedMps * 3.2 + simState.rearWheelSpin * 12.0) * dt;
  mirrorReflTex.offset.x = (simState.bikeYaw * 0.25) + simState.leanAngle * 0.15;

  // Actualizar la luz solar y su frustum de sombras para que siga al jugador
  sunLight.position.set(
    camera.position.x + sunDirection.x * 110,
    camera.position.y + sunDirection.y * 110,
    camera.position.z + sunDirection.z * 110
  );
  sunLight.target.position.set(camera.position.x + fwdX * 20, camera.position.y, camera.position.z + fwdZ * 20);
  sunLight.target.updateMatrixWorld();

  // Faro delantero apunta en la dirección 360° real de la moto
  motoHeadlight.position.copy(camera.position);
  motoHeadlight.target.position.set(
    camera.position.x + fwdX * 42,
    camera.position.y - 0.55,
    camera.position.z + fwdZ * 42
  );
  motoHeadlight.target.updateMatrixWorld();

  // Cúpula celeste, cordillera 360°, destello solar, lago animado y partículas de polvo
  skyDome.position.copy(camera.position);
  mountainRangeMesh.position.set(camera.position.x, -45, camera.position.z);
  sunGlareSprite.position.set(
    camera.position.x + sunDirection.x * 1750,
    camera.position.y + sunDirection.y * 1750,
    camera.position.z + sunDirection.z * 1750
  );
  waterMesh.position.x = camera.position.x - 180;
  waterMesh.position.z = camera.position.z - 200;
  waterNormTex.offset.x += 0.022 * dt;
  waterNormTex.offset.y += 0.014 * dt;

  dustParticles.position.set(camera.position.x, centerInfo.groundY, camera.position.z);
  dustParticles.rotation.y = simState.bikeYaw;
  const dArr = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_COUNT; i++) {
    dArr[i * 3 + 2] += (speedMps * 0.85 + 2.5) * dt;
    if (dArr[i * 3 + 2] > 2.0) {
      dArr[i * 3 + 2] = -72.0;
      dArr[i * 3] = (Math.random() - 0.5) * 26;
      dArr[i * 3 + 1] = Math.random() * 4.2;
    }
  }
  dustGeo.attributes.position.needsUpdate = true;

  // Actualizar Árboles 3D y Rocas anclados en el mundo en un radio simétrico alrededor del jugador
  const natureSpan = natureObjects.length * 6.0;
  const halfNatureSpan = natureSpan * 0.5;
  natureObjects.forEach(p => {
    const rel = (((p.distAhead - simState.playerDistance) % natureSpan) + natureSpan + halfNatureSpan) % natureSpan - halfNatureSpan;
    const pDist = simState.playerDistance + rel;
    const pt = getRoadPoint(pDist);
    const ori = getRoadOrientation(pDist);

    const px = ori.rightX * p.offsetLateral;
    const pz = ori.rightZ * p.offsetLateral;
    const wx = pt.x + px;
    const wz = pt.z + pz;

    const slopeY = getTerrainElevationOffset(p.offsetLateral, wx, wz);
    p.mesh.position.set(wx, pt.y + slopeY - 0.25, wz);
  });

  // Actualizar Tachas, Postes y Carteles de Curva anclados en el mundo (en ambos sentidos de la ruta)
  const detailSpan = roadDetails.length * 9.0;
  const halfDetailSpan = detailSpan * 0.5;
  roadDetails.forEach(item => {
    const rel = (((item.distOffset - simState.playerDistance) % detailSpan) + detailSpan + halfDetailSpan) % detailSpan - halfDetailSpan;
    const cDist = simState.playerDistance + rel;
    const pt = getRoadPoint(cDist);
    const ori = getRoadOrientation(cDist);

    item.group.position.set(pt.x, pt.y, pt.z);
    item.group.rotation.set(0, ori.yaw, 0);
  });

  // Actualizar Tráfico 3D desplazándose en coordenadas mundiales en ambos carriles
  vehicles.forEach(v => {
    const dirSign = v.laneOffset < 0 ? -1 : 1;
    v.distAhead += dirSign * (v.speed / 3.6) * dt;

    if (v.wheels) {
      v.wheels.forEach(w => {
        w.rotation.x -= (v.speed / 3.6) * 2.5 * dt;
      });
    }

    const vSpan = 560;
    const halfVSpan = vSpan * 0.5;
    const relV = (((v.distAhead - simState.playerDistance) % vSpan) + vSpan + halfVSpan) % vSpan - halfVSpan;
    const vDist = simState.playerDistance + relV;

    const vp = getRoadPoint(vDist);
    const vOri = getRoadOrientation(vDist);

    const vx = vOri.rightX * v.laneOffset;
    const vz = vOri.rightZ * v.laneOffset;

    v.mesh.position.set(vp.x + vx, vp.y, vp.z + vz);
    v.mesh.rotation.set(0, 0, 0);
    v.mesh.rotation.y = vOri.yaw + (v.laneOffset < 0 ? Math.PI : 0);

    const distToPlayer = Math.hypot(simState.bikeX - v.mesh.position.x, simState.bikeZ - v.mesh.position.z);
    if (distToPlayer < 8 && !v.passed) {
      window.soundEngine.playPassWhoosh();
      v.passed = true;
    } else if (distToPlayer > 25) {
      v.passed = false;
    }

    if (distToPlayer < 2.6 && simState.active) {
      simState.speed = Math.max(0, simState.speed - 55);
      simState.bikeHealth = Math.max(0, simState.bikeHealth - 35);
      window.soundEngine.playTireScreech();
      if (simState.bikeHealth <= 0) {
        triggerBreakdown("Colisión Vial", "Choque severo contra un vehículo en la ruta.");
      }
    }
  });

  // Temperatura y Audio
  if (simState.rpm > simState.redlineRpm) {
    simState.engineTemp = Math.min(130, simState.engineTemp + 4.5 * dt);
  } else {
    const cooling = (simState.speed / 100) * 1.6;
    simState.engineTemp = Math.max(78, simState.engineTemp + (0.45 - cooling) * dt);
  }

  if (simState.active && !simState.paused) {
    window.soundEngine.update(simState.rpm, simState.maxRpm, simState.speed, simState.maxSpeed, simState.onRumble);
  }

  // Distancia a destino y Odómetro (teniendo en cuenta si avanzamos hacia el destino o dimos la vuelta)
  if (simState.speed > 0) {
    const kmCovered = (simState.speed / 3600) * dt * 18;
    const alignmentWithRoute = Math.cos(simState.bikeYaw - roadOri.yaw);
    simState.targetDistanceKm = Math.max(0, simState.targetDistanceKm - kmCovered * alignmentWithRoute);
    simState.odometer += kmCovered;

    if (simState.targetDistanceKm <= 0) arriveAtWaypoint();
  }

  if (simState.fuelLiters <= 0) triggerBreakdown("Sin Combustible", "El motor se detuvo por falta de nafta.");
  if (simState.engineTemp >= 125) triggerBreakdown("Motor Sobrecalentado", "Temperatura crítica en el bloque motor.");

  updateGps();
}

// ============================================================================
// 12. ACTUALIZACIÓN GEOMÉTRICA DE LA RUTA Y EL VALLE / ACANTILADO 3D
// ============================================================================
function updateWorldMeshes() {
  const rPos = roadPosAttr.array;
  const rUv = roadUvAttr.array;
  const gPos = guardrailPosAttr.array;
  const tPos = terrainPosAttr.array;
  const tCol = terrainColAttr.array;

  const halfRoad = ROAD_WIDTH / 2;
  const halfRibbon = Math.floor(RIBBON_POINTS / 2);

  for (let i = 0; i < RIBBON_POINTS; i++) {
    // Centramos los 700 metros de ruta y terreno simétricamente (-350m a +350m) alrededor de la moto
    // para que puedas girar 360° y manejar en cualquier sentido
    const sampleDist = Math.floor(simState.playerDistance / POINT_STEP) * POINT_STEP + ((i - halfRibbon) * POINT_STEP);
    const p = getRoadPoint(sampleDist);
    const ori = getRoadOrientation(sampleDist);

    const nx = ori.rightX;
    const nz = ori.rightZ;

    // 1. Vértices del Asfalto y Coordenadas UV continuas en espacio mundial
    const idxL = i * 2 * 3;
    const idxR = (i * 2 + 1) * 3;

    rPos[idxL]     = p.x - (nx * halfRoad);
    rPos[idxL + 1] = p.y + 0.04;
    rPos[idxL + 2] = p.z - (nz * halfRoad);

    rPos[idxR]     = p.x + (nx * halfRoad);
    rPos[idxR + 1] = p.y + 0.04;
    rPos[idxR + 2] = p.z + (nz * halfRoad);

    const uvY = sampleDist * 0.08;
    const uvIdxL = i * 2 * 2;
    const uvIdxR = (i * 2 + 1) * 2;
    rUv[uvIdxL] = 0; rUv[uvIdxL + 1] = uvY;
    rUv[uvIdxR] = 1; rUv[uvIdxR + 1] = uvY;

    // 2. Vértices del Guardarraíl Metálico Izquierdo (W-Beam)
    const railX = p.x - nx * (halfRoad + 0.14);
    const railZ = p.z - nz * (halfRoad + 0.14);
    gPos[idxL]     = railX;
    gPos[idxL + 1] = p.y + 0.35;
    gPos[idxL + 2] = railZ;

    gPos[idxR]     = railX;
    gPos[idxR + 1] = p.y + 0.72;
    gPos[idxR + 2] = railZ;

    // 3. Vértices del Terreno 3D con Transición Suave en las Banquinas
    for (let c = 0; c < TERRAIN_COLS; c++) {
      const colRatio = (c / (TERRAIN_COLS - 1)) * 2 - 1; // -1 a +1
      const lateral = Math.sign(colRatio) * Math.pow(Math.abs(colRatio), 1.4) * 165;

      const wx = p.x + nx * lateral;
      const wz = p.z + nz * lateral;
      const elevOffset = getTerrainElevationOffset(lateral, wx, wz);
      const wy = p.y + elevOffset;

      let cr = 0.25, cg = 0.38, cb = 0.19; // Pasto cordillerano

      if (Math.abs(lateral) <= halfRoad + 2.2) {
        // Banquina de tierra y ripio junto al asfalto
        cr = 0.34; cg = 0.30; cb = 0.25;
      } else if (elevOffset > 30) {
        // Nieve en las altas cumbres
        cr = 0.86; cg = 0.89; cb = 0.94;
      } else if (elevOffset > 11) {
        // Roca granítica de montaña
        cr = 0.42; cg = 0.45; cb = 0.49;
      } else if (elevOffset < -6) {
        // Orilla rocosa del lago glaciar
        cr = 0.32; cg = 0.36; cb = 0.34;
      }

      const vIdx = (i * TERRAIN_COLS + c) * 3;
      tPos[vIdx]     = wx;
      tPos[vIdx + 1] = wy;
      tPos[vIdx + 2] = wz;

      tCol[vIdx]     = cr;
      tCol[vIdx + 1] = cg;
      tCol[vIdx + 2] = cb;
    }
  }

  roadPosAttr.needsUpdate = true;
  roadUvAttr.needsUpdate = true;
  guardrailPosAttr.needsUpdate = true;
  terrainPosAttr.needsUpdate = true;
  terrainColAttr.needsUpdate = true;
  terrainGeo.computeVertexNormals();
}

// ============================================================================
// 13. RELOJ CIRCULAR SCRAMBLER CLÁSICO-MODERNO (ESTILO TRIUMPH 400 X / BEAR 650)
// ============================================================================
function updateTFT() {
  const c = dashCtx;
  const cx = 256;
  const cy = 256;

  c.clearRect(0, 0, 512, 512);

  // Fondo circular negro satinado con halo cálido vintage
  const bg = c.createRadialGradient(cx, cy, 20, cx, cy, 250);
  bg.addColorStop(0, '#141820');
  bg.addColorStop(0.78, '#0c0f14');
  bg.addColorStop(1, '#05070a');
  c.fillStyle = bg;
  c.beginPath();
  c.arc(cx, cy, 250, 0, Math.PI * 2);
  c.fill();

  // Anillo exterior dorado/crema estilo reloj británico clásico
  c.strokeStyle = '#d4af37';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(cx, cy, 236, 0, Math.PI * 2);
  c.stroke();

  // Escala radial de velocímetro analógico (0 a 200 km/h)
  const startAng = Math.PI * 0.75; // 135°
  const endAng = Math.PI * 2.25;   // 405°
  const totalSweep = endAng - startAng;

  for (let s = 0; s <= 200; s += 5) {
    const ratio = s / 200;
    const ang = startAng + ratio * totalSweep;
    const isMajor = (s % 20 === 0);
    const isMid = (s % 10 === 0);

    const rOuter = 228;
    const rInner = isMajor ? 202 : (isMid ? 212 : 218);

    c.strokeStyle = isMajor ? '#f5f0e1' : '#94a3b8';
    c.lineWidth = isMajor ? 4 : 2;
    c.beginPath();
    c.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
    c.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
    c.stroke();

    if (isMajor) {
      const rText = 174;
      c.fillStyle = '#f5f0e1';
      c.font = '700 22px "Chakra Petch", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(s.toString(), cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
    }
  }

  // Arco de RPM digital interior (Tripper / Scrambler LCD)
  const rpmRatio = Math.min(1, simState.rpm / simState.maxRpm);
  c.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  c.lineWidth = 12;
  c.beginPath();
  c.arc(cx, cy, 134, startAng, endAng);
  c.stroke();

  const rpmColor = simState.rpm >= 8200 ? '#ef4444' : (simState.rpm >= 6500 ? '#f59e0b' : '#eab308');
  c.strokeStyle = rpmColor;
  c.lineWidth = 12;
  c.beginPath();
  c.arc(cx, cy, 134, startAng, startAng + totalSweep * rpmRatio);
  c.stroke();

  // Pantalla circular LCD central
  c.fillStyle = '#090d14';
  c.beginPath();
  c.arc(cx, cy, 120, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(212, 175, 55, 0.35)';
  c.lineWidth = 2;
  c.stroke();

  // Logo superior clásico en el reloj
  c.fillStyle = '#d4af37';
  c.font = '700 15px "Chakra Petch", sans-serif';
  c.textAlign = 'center';
  c.fillText('SCRAMBLER 650', cx, cy - 78);

  // Testigos luminosos clásicos (Guiños y Neutral)
  if (keys.steerLeft && performance.now() % 480 < 240) {
    c.fillStyle = '#22c55e';
    c.font = '700 26px sans-serif';
    c.fillText('◀', cx - 72, cy - 42);
  }
  if (keys.steerRight && performance.now() % 480 < 240) {
    c.fillStyle = '#22c55e';
    c.font = '700 26px sans-serif';
    c.fillText('▶', cx + 72, cy - 42);
  }

  // Indicador de Marcha (Gear) grande en el centro superior del LCD
  const gText = simState.gear === 0 ? 'N' : simState.gear.toString();
  c.fillStyle = simState.gear === 0 ? '#22c55e' : '#f59e0b';
  c.font = '700 64px "Chakra Petch", monospace';
  c.fillText(gText, cx, cy - 22);

  // Velocidad digital de respaldo + KM/H
  c.fillStyle = '#f5f0e1';
  c.font = '700 34px "Share Tech Mono", monospace';
  c.fillText(`${Math.round(simState.speed)} KM/H`, cx, cy + 36);

  // Datos de Fuel, Temp y Odómetro en la base del LCD
  c.fillStyle = simState.fuelLiters < 4 ? '#ef4444' : '#cbd5e1';
  c.font = '700 18px "Share Tech Mono", monospace';
  c.fillText(`FUEL ${simState.fuelLiters.toFixed(1)}L  |  ${Math.round(simState.engineTemp)}°C`, cx, cy + 68);

  c.fillStyle = '#94a3b8';
  c.font = '700 16px "Share Tech Mono", monospace';
  c.fillText(`ODO ${simState.odometer.toFixed(1)} KM`, cx, cy + 94);

  // Aguja analógica iluminada en rojo/naranja con contrapeso y centro de aluminio cepillado
  const speedClamped = Math.min(200, Math.max(0, simState.speed));
  const needleAng = startAng + (speedClamped / 200) * totalSweep;

  c.save();
  c.translate(cx, cy);
  c.rotate(needleAng);

  // Sombra de la aguja
  c.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(-32, 4);
  c.lineTo(212, 4);
  c.stroke();

  // Cuerpo de la aguja
  c.strokeStyle = '#ef4444';
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-34, 0);
  c.lineTo(214, 0);
  c.stroke();

  // Centro de aluminio del eje de la aguja
  c.fillStyle = '#cbd5e1';
  c.beginPath();
  c.arc(0, 0, 18, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1e293b';
  c.beginPath();
  c.arc(0, 0, 8, 0, Math.PI * 2);
  c.fill();

  c.restore();

  dashTexture.needsUpdate = true;
}

function updateGps() {
  const current = window.WaypointSystem.getCurrent();
  if (current) {
    gpsTarget.textContent = current.name.split('-')[0];
    const surfLabel = simState.surfaceType === 'asphalt'
      ? current.roadCondition.toUpperCase()
      : (simState.surfaceType === 'shoulder' ? 'BANQUINA DE RIPIO (GRIP 68%)' : 'TIERRA / OFF-ROAD (GRIP 54%)');
    gpsRoute.textContent = `${current.biome.toUpperCase()} // ${surfLabel}`;
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

// Inicializar posición de cámara, luces y mallas desde el cuadro 0 (incluso antes de arrancar)
updateHandlingPhysics(0.016);
updateWorldMeshes();
updateTFT();
renderer.render(scene, camera);
