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

  // Dinámica de Conducción Realista
  playerDistance: 0,
  laneOffset: 2.2,     // Carril derecho por defecto (-4.5 a +4.5)
  steeringInput: 0,    // -1 (izq) a +1 (der)
  leanAngle: 0,        // Radianes de inclinación
  pitchSuspension: 0,  // Hundimiento de horquilla
  headLookApex: 0,     // Giro de cabeza al ápice
  clutchPull: 0,       // Animación maneta embrague
  brakePull: 0,        // Animación maneta freno

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

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = -(p1.z - p0.z);

  const yaw = -Math.atan2(dx, dz);
  const pitch = -Math.atan2(dy, dz);
  const roll = (dx / dz) * 0.32;

  return { x: p0.x, y: p0.y, z: p0.z, yaw, pitch, roll, curveRate: dx / dz };
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

  // Base de asfalto oscuro con granulado mineral
  ctx.fillStyle = '#1c1f26';
  ctx.fillRect(0, 0, 1024, 1024);

  const img = ctx.getImageData(0, 0, 1024, 1024);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const grain = (Math.random() - 0.5) * 30;
    const pebble = Math.random() < 0.09 ? 20 : 0;
    d[i]     = Math.min(255, Math.max(0, 28 + grain + pebble));
    d[i + 1] = Math.min(255, Math.max(0, 31 + grain + pebble));
    d[i + 2] = Math.min(255, Math.max(0, 37 + grain + pebble));
  }
  ctx.putImageData(img, 0, 0);

  // Huellas de neumáticos pulidas por el tránsito
  const trackGrad = ctx.createLinearGradient(0, 0, 1024, 0);
  trackGrad.addColorStop(0.0, 'rgba(46, 42, 36, 0.55)');
  trackGrad.addColorStop(0.11, 'rgba(18, 20, 25, 0.2)');
  trackGrad.addColorStop(0.28, 'rgba(10, 12, 16, 0.62)');
  trackGrad.addColorStop(0.50, 'rgba(22, 25, 31, 0.15)');
  trackGrad.addColorStop(0.72, 'rgba(10, 12, 16, 0.62)');
  trackGrad.addColorStop(0.89, 'rgba(18, 20, 25, 0.2)');
  trackGrad.addColorStop(1.0, 'rgba(46, 42, 36, 0.55)');
  ctx.fillStyle = trackGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Grietas longitudinales selladas con brea (Tar snakes)
  ctx.strokeStyle = 'rgba(9, 10, 14, 0.72)';
  ctx.lineWidth = 3;
  for (let c = 0; c < 6; c++) {
    ctx.beginPath();
    let cx = 140 + Math.random() * 740;
    ctx.moveTo(cx, 0);
    for (let y = 0; y <= 1024; y += 64) {
      cx += (Math.random() - 0.5) * 24;
      ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }

  // Banquinas de ripio compactado en los bordes
  const leftShoulder = ctx.createLinearGradient(0, 0, 72, 0);
  leftShoulder.addColorStop(0, '#42392f');
  leftShoulder.addColorStop(0.6, '#2d2925');
  leftShoulder.addColorStop(1, 'rgba(28,31,38,0)');
  ctx.fillStyle = leftShoulder;
  ctx.fillRect(0, 0, 72, 1024);

  const rightShoulder = ctx.createLinearGradient(952, 0, 1024, 0);
  rightShoulder.addColorStop(0, 'rgba(28,31,38,0)');
  rightShoulder.addColorStop(0.4, '#2d2925');
  rightShoulder.addColorStop(1, '#42392f');
  ctx.fillStyle = rightShoulder;
  ctx.fillRect(952, 0, 72, 1024);

  // Bandas sonoras (Rumble strips) labradas en la banquina
  ctx.fillStyle = 'rgba(15, 17, 22, 0.45)';
  for (let y = 0; y < 1024; y += 32) {
    ctx.fillRect(42, y, 22, 14);
    ctx.fillRect(960, y, 22, 14);
  }

  // Doble línea amarilla central reflectante
  ctx.fillStyle = '#eab308';
  ctx.fillRect(496, 0, 10, 1024);
  ctx.fillRect(518, 0, 10, 1024);

  // Líneas blancas continuas de borde de calzada
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(68, 0, 14, 1024);
  ctx.fillRect(942, 0, 14, 1024);

  // Roughness Map
  rCtx.fillStyle = '#b8b8b8';
  rCtx.fillRect(0, 0, 512, 512);
  const rGrad = rCtx.createLinearGradient(0, 0, 512, 0);
  rGrad.addColorStop(0, '#e2e2e2');
  rGrad.addColorStop(0.28, '#505050');
  rGrad.addColorStop(0.5, '#a2a2a2');
  rGrad.addColorStop(0.72, '#505050');
  rGrad.addColorStop(1, '#e2e2e2');
  rCtx.fillStyle = rGrad;
  rCtx.fillRect(0, 0, 512, 512);

  // Normal Map
  const nImg = nCtx.createImageData(512, 512);
  const nd = nImg.data;
  for (let i = 0; i < nd.length; i += 4) {
    nd[i]     = 128 + (Math.random() - 0.5) * 48;
    nd[i + 1] = 128 + (Math.random() - 0.5) * 48;
    nd[i + 2] = 245;
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
// 5. ILUMINACIÓN Y SOMBRAS DINÁMICAS QUE SIGUEN AL JUGADOR
// ============================================================================
const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x2d3a28, 0.75);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 5;
sunLight.shadow.camera.far = 260;
const shadowCamSize = 65;
sunLight.shadow.camera.left = -shadowCamSize;
sunLight.shadow.camera.right = shadowCamSize;
sunLight.shadow.camera.top = shadowCamSize;
sunLight.shadow.camera.bottom = -shadowCamSize;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);
scene.add(sunLight.target);

const motoHeadlight = new THREE.SpotLight(0xfffae0, 2.8, 120, Math.PI / 5, 0.45, 1.2);
scene.add(motoHeadlight);
scene.add(motoHeadlight.target);

// ============================================================================
// 6. TERRENO 3D CONTINUO (BANQUINAS SUAVES, ACANTILADOS, VALLE Y LAGO)
// ============================================================================
const RIBBON_POINTS = 120;
const POINT_STEP = 3.5;
const ROAD_WIDTH = 11.4;

// A. Carretera PBR con Normal Map y Roughness Map
const asphaltMaps = createPBRAsphaltMaps();
const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, (RIBBON_POINTS - 1) * POINT_STEP, 1, RIBBON_POINTS - 1);
const roadMat = new THREE.MeshStandardMaterial({
  map: asphaltMaps.diffTex,
  roughnessMap: asphaltMaps.roughTex,
  normalMap: asphaltMaps.normTex,
  normalScale: new THREE.Vector2(0.45, 0.45),
  roughness: 0.75,
  metalness: 0.15,
  envMapIntensity: 1.3,
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
  normalScale: new THREE.Vector2(0.65, 0.65),
  vertexColors: true,
  roughness: 0.88,
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

// C. Lago Glaciar en el fondo del valle izquierdo
const waterGeo = new THREE.PlaneGeometry(3600, 3600);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x0e5a6f,
  roughness: 0.06,
  metalness: 0.92,
  envMapIntensity: 1.9
});
const waterMesh = new THREE.Mesh(waterGeo, waterMat);
waterMesh.rotation.x = -Math.PI / 2;
waterMesh.position.y = -6.5;
scene.add(waterMesh);

// D. Guardarraíl Metálico 3D Continuo (Borde del valle izquierdo)
const guardrailGeo = new THREE.PlaneGeometry(0.42, (RIBBON_POINTS - 1) * POINT_STEP, 1, RIBBON_POINTS - 1);
const guardrailMat = new THREE.MeshStandardMaterial({
  color: 0xcbd5e1,
  metalness: 0.88,
  roughness: 0.26,
  side: THREE.DoubleSide
});
const guardrailMesh = new THREE.Mesh(guardrailGeo, guardrailMat);
guardrailMesh.castShadow = true;
guardrailMesh.receiveShadow = true;
scene.add(guardrailMesh);
const guardrailPosAttr = guardrailGeo.attributes.position;
guardrailPosAttr.setUsage(THREE.DynamicDrawUsage);

// E. Tachas Reflectantes, Postes de Guardarraíl y Carteles Viales de Curva
const catEyesGroup = new THREE.Group();
const catEyeGeo = new THREE.BoxGeometry(0.16, 0.035, 0.22);
const catEyeMat = new THREE.MeshStandardMaterial({
  color: 0xfbbf24,
  emissive: 0xf59e0b,
  emissiveIntensity: 0.6,
  roughness: 0.2
});
const postGeo = new THREE.BoxGeometry(0.12, 0.76, 0.12);
const reflGeo = new THREE.BoxGeometry(0.04, 0.16, 0.08);
const reflRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
const reflWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const chevronMat = new THREE.MeshStandardMaterial({
  map: createChevronSignTexture(),
  roughness: 0.3,
  metalness: 0.2
});

const roadDetails = [];
for (let i = 0; i < 45; i++) {
  const g = new THREE.Group();

  // Tacha central amarilla
  const ce = new THREE.Mesh(catEyeGeo, catEyeMat);
  ce.position.set(0, 0.025, 0);
  g.add(ce);

  // Poste izquierdo de guardarraíl + reflector rojo
  const postL = new THREE.Mesh(postGeo, guardrailMat);
  postL.position.set(-ROAD_WIDTH / 2 - 0.18, 0.35, 0);
  postL.castShadow = true;
  g.add(postL);

  const refL = new THREE.Mesh(reflGeo, reflRedMat);
  refL.position.set(-ROAD_WIDTH / 2 - 0.10, 0.58, 0);
  g.add(refL);

  // Mojón delineador derecho con reflector blanco
  const postR = new THREE.Mesh(postGeo, guardrailMat);
  postR.position.set(ROAD_WIDTH / 2 + 0.45, 0.35, 0);
  postR.castShadow = true;
  g.add(postR);

  const refR = new THREE.Mesh(reflGeo, reflWhiteMat);
  refR.position.set(ROAD_WIDTH / 2 + 0.38, 0.58, 0);
  g.add(refR);

  // Cada 5 postes añadimos un cartel vial de curva (Chevron amarillo/negro)
  if (i % 5 === 0) {
    const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8), guardrailMat);
    signPole.position.set(ROAD_WIDTH / 2 + 1.35, 0.9, 0);
    signPole.castShadow = true;
    g.add(signPole);

    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.04), chevronMat);
    signBoard.position.set(ROAD_WIDTH / 2 + 1.35, 1.65, 0);
    signBoard.castShadow = true;
    g.add(signBoard);
  }

  catEyesGroup.add(g);
  roadDetails.push({ group: g, distOffset: i * 9 });
}
scene.add(catEyesGroup);

// ============================================================================
// 7. BOSQUE ALPINO 3D TEXTURIZADO Y AFLORAMIENTOS ROCOSOS
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

const natureObjects = [];
for (let i = 0; i < 70; i++) {
  const wrapper = new THREE.Group();
  const tree = createHighDetailPineTree();
  const sc = 0.85 + (i % 5) * 0.22;
  tree.scale.set(sc, sc * (0.95 + (i % 3) * 0.12), sc);
  wrapper.add(tree);

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
// 8. TRÁFICO 3D MULTI-PIEZA (AUTOS DEPORTIVOS, SUVs Y CAMIONES)
// ============================================================================
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
    roughness: 0.18,
    envMapIntensity: 1.6
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.95, roughness: 0.05, envMapIntensity: 2.0 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.1 });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });

  if (type === 'truck') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.9, 2.6), paintMat);
    cab.position.set(0, 1.85, -3.2);
    cab.castShadow = true;
    group.add(cab);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.95, 0.1), glassMat);
    windshield.position.set(0, 2.45, -4.51);
    group.add(windshield);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.1), chromeMat);
    grille.position.set(0, 1.25, -4.51);
    group.add(grille);

    const trailerMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.3 });
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.3, 7.2), trailerMat);
    trailer.position.set(0, 2.25, 1.9);
    trailer.castShadow = true;
    group.add(trailer);

    const fl1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), headlightMat); fl1.position.set(-0.95, 0.9, -4.52); group.add(fl1);
    const fl2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), headlightMat); fl2.position.set(0.95, 0.9, -4.52); group.add(fl2);
    const rl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.1), taillightMat); rl.position.set(0, 0.85, 5.51); group.add(rl);
  } else {
    const isSuv = type === 'suv';
    const w = 1.95;
    const hBody = isSuv ? 0.82 : 0.65;
    const l = isSuv ? 4.6 : 4.4;

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(w, hBody, l), paintMat);
    lowerBody.position.set(0, 0.4 + hBody / 2, 0);
    lowerBody.castShadow = true;
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

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.28, l * 1.02), darkTrimMat);
    bumper.position.set(0, 0.42, 0);
    group.add(bumper);

    const fl1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), headlightMat); fl1.position.set(-w * 0.35, 0.72, -l / 2 - 0.02); group.add(fl1);
    const fl2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), headlightMat); fl2.position.set(w * 0.35, 0.72, -l / 2 - 0.02); group.add(fl2);
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.14, 0.08), taillightMat); tailBar.position.set(0, 0.78, l / 2 + 0.02); group.add(tailBar);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.40, 0.40, 0.32, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 12);
  rimGeo.rotateZ(Math.PI / 2);

  const zOff = type === 'truck' ? 3.2 : 1.45;
  const xOff = type === 'truck' ? 1.25 : 0.96;
  [[-xOff, 0.40, -zOff], [xOff, 0.40, -zOff], [-xOff, 0.40, zOff], [xOff, 0.40, zOff]].forEach(pos => {
    const tire = new THREE.Mesh(wheelGeo, darkTrimMat);
    tire.position.set(...pos);
    group.add(tire);
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    rim.position.set(...pos);
    group.add(rim);
  });

  return {
    mesh: group,
    type: type,
    speed: type === 'truck' ? 68 : 84,
    laneOffset: laneOffset,
    distAhead: initialRelDist,
    passed: false
  };
}

// ============================================================================
// 9. CABINA EN PRIMERA PERSONA DE ALTA PRECISIÓN (ESTILO RIDE 4 / DUCATI V4)
// ============================================================================
const cockpitGroup = new THREE.Group();

const carbonWeaveTex = createCarbonWeaveTexture();
const carbonFiberMat = new THREE.MeshStandardMaterial({
  map: carbonWeaveTex,
  roughness: 0.26,
  metalness: 0.45,
  envMapIntensity: 1.6
});
const candyRedPaintMat = new THREE.MeshPhysicalMaterial({
  color: 0xc8102e,
  metalness: 0.78,
  roughness: 0.12,
  clearcoat: 1.0,
  clearcoatRoughness: 0.06,
  envMapIntensity: 2.2
});
const goldAnodizedMat = new THREE.MeshStandardMaterial({
  color: 0xd4af37,
  metalness: 0.92,
  roughness: 0.18,
  envMapIntensity: 1.8
});
const billetAluminumMat = new THREE.MeshStandardMaterial({
  color: 0x94a3b8,
  metalness: 0.90,
  roughness: 0.24,
  envMapIntensity: 1.6
});
const darkTitaniumMat = new THREE.MeshStandardMaterial({
  color: 0x334155,
  metalness: 0.85,
  roughness: 0.28,
  envMapIntensity: 1.5
});
const matteBlackMat = new THREE.MeshStandardMaterial({
  color: 0x11141a,
  roughness: 0.82,
  metalness: 0.18
});

// A. Carenado Delantero Simétrico y Cúpula Aerodinámica (Bajo la línea de visión)
const fairingGroup = new THREE.Group();
fairingGroup.position.set(0, -0.08, -0.68);

// Aletas laterales aerodinámicas del carenado frontal (Rojo Ducati + Carbono)
[-1, 1].forEach(s => {
  const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.28), candyRedPaintMat);
  cheek.position.set(s * 0.19, -0.06, 0.04);
  cheek.rotation.y = s * -0.32;
  cheek.rotation.z = s * 0.25;
  fairingGroup.add(cheek);

  const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.14), carbonFiberMat);
  winglet.position.set(s * 0.27, -0.04, 0.02);
  winglet.rotation.z = s * -0.15;
  fairingGroup.add(winglet);
});

// Parabrisas / Cúpula Acrílica Curvada Simétrica (Sin obstruir el tablero ni la ruta)
const windGeo = new THREE.PlaneGeometry(0.38, 0.17, 24, 8);
const wPos = windGeo.attributes.position;
for (let i = 0; i < wPos.count; i++) {
  const wx = wPos.getX(i);
  const wy = wPos.getY(i);
  // Curvatura parabólica suave en X y barrido aerodinámico en Y
  wPos.setZ(i, -wx * wx * 1.4 + wy * 0.35);
  wPos.setY(i, wy - wx * wx * 0.35);
}
windGeo.computeVertexNormals();

const windscreenMat = new THREE.MeshPhysicalMaterial({
  color: 0x0f172a,
  transparent: true,
  opacity: 0.32,
  roughness: 0.04,
  metalness: 0.1,
  clearcoat: 1.0,
  envMapIntensity: 2.4,
  side: THREE.DoubleSide
});
const windscreen = new THREE.Mesh(windGeo, windscreenMat);
windscreen.position.set(0, 0.08, -0.02);
windscreen.rotation.x = -0.52;
fairingGroup.add(windscreen);

cockpitGroup.add(fairingGroup);

// B. Pantalla Digital TFT Full-Color con Visera Antirreflejo (100% despejada y centrada)
const dashCanvas = document.createElement('canvas');
dashCanvas.width = 1024;
dashCanvas.height = 512;
const dashCtx = dashCanvas.getContext('2d');
const dashTexture = new THREE.CanvasTexture(dashCanvas);
dashTexture.anisotropy = 4;

const dashGroup = new THREE.Group();
dashGroup.position.set(0, -0.032, -0.56);
dashGroup.rotation.x = -0.24;

// Carcasa trasera en aluminio negro anodizado
const dashHousing = new THREE.Mesh(new THREE.BoxGeometry(0.268, 0.142, 0.022), matteBlackMat);
dashGroup.add(dashHousing);

// Visera parasol superior sobre la pantalla TFT
const dashHood = new THREE.Mesh(new THREE.BoxGeometry(0.274, 0.012, 0.042), carbonFiberMat);
dashHood.position.set(0, 0.072, 0.008);
dashGroup.add(dashHood);

// Pantalla OLED (hija directa de dashGroup a z = +0.0125 para que jamás se recorte)
const dashScreen = new THREE.Mesh(
  new THREE.PlaneGeometry(0.252, 0.128),
  new THREE.MeshBasicMaterial({ map: dashTexture })
);
dashScreen.position.set(0, 0, 0.0125);
dashGroup.add(dashScreen);

cockpitGroup.add(dashGroup);

// C. Horquilla Invertida Öhlins Anodizada en Oro, Tija CNC y Amortiguador de Dirección
const forkGeo = new THREE.CylinderGeometry(0.031, 0.029, 0.45, 20);
const preloadMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.18 });
const reboundRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.85, roughness: 0.2 });

[-1, 1].forEach(s => {
  const fork = new THREE.Mesh(forkGeo, goldAnodizedMat);
  fork.position.set(s * 0.145, -0.27, -0.54);
  fork.rotation.x = Math.PI / 7.5;
  cockpitGroup.add(fork);

  // Tapa azul anodizada de precarga + regulador rojo de rebote
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 16), preloadMat);
  cap.position.set(s * 0.145, -0.072, -0.452);
  cap.rotation.x = Math.PI / 7.5;
  cockpitGroup.add(cap);

  const clicker = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 6), reboundRedMat);
  clicker.position.set(s * 0.145, -0.068, -0.450);
  clicker.rotation.x = Math.PI / 7.5;
  cockpitGroup.add(clicker);
});

// Tija Superior Mecanizada CNC (Triple Clamp)
const tripleClampGroup = new THREE.Group();
tripleClampGroup.position.set(0, -0.105, -0.475);
tripleClampGroup.rotation.x = Math.PI / 7.5;

const clampMain = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.022, 0.085), darkTitaniumMat);
tripleClampGroup.add(clampMain);

// Torretas del manillar (Risers) y Tuerca Central
[-0.075, 0.075].forEach(rx => {
  const riser = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.038, 0.042), billetAluminumMat);
  riser.position.set(rx, 0.022, 0.01);
  tripleClampGroup.add(riser);
});

const stemNut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.016, 6), goldAnodizedMat);
stemNut.position.set(0, 0.014, -0.005);
tripleClampGroup.add(stemNut);

// Tambor de contacto con llave
const ignitionBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 16), matteBlackMat);
ignitionBarrel.position.set(0, 0.015, -0.055);
tripleClampGroup.add(ignitionBarrel);

// Amortiguador de Dirección Transversal Öhlins
const damperBody = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 16), goldAnodizedMat);
damperBody.rotation.z = Math.PI / 2;
damperBody.position.set(0.02, 0.026, -0.032);
tripleClampGroup.add(damperBody);

const damperRod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 12), billetAluminumMat);
damperRod.rotation.z = Math.PI / 2;
damperRod.position.set(-0.02, 0.026, -0.032);
tripleClampGroup.add(damperRod);

cockpitGroup.add(tripleClampGroup);

// D. Tanque de Combustible Esculpido con Almohadillas de Tracción y Tapa CNC
const tankGroup = new THREE.Group();
const tankMain = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 24), candyRedPaintMat);
tankMain.scale.set(0.90, 0.62, 1.55);
tankMain.position.set(0, -0.34, -0.24);
tankGroup.add(tankMain);

// Franja central en fibra de carbono
const tankPad = new THREE.Mesh(new THREE.SphereGeometry(0.242, 24, 16, -0.25, 0.5, 0.35, 0.85), carbonFiberMat);
tankPad.scale.set(0.90, 0.62, 1.55);
tankPad.position.set(0, -0.338, -0.24);
tankGroup.add(tankPad);

// Tapa de combustible rápida CNC con 6 tornillos perimetrales
const fuelCapRing = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.008, 24), billetAluminumMat);
fuelCapRing.position.set(0, -0.192, -0.26);
fuelCapRing.rotation.x = 0.12;
tankGroup.add(fuelCapRing);

const fuelCapInner = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.011, 20), carbonFiberMat);
fuelCapInner.position.set(0, -0.190, -0.26);
fuelCapInner.rotation.x = 0.12;
tankGroup.add(fuelCapInner);

cockpitGroup.add(tankGroup);

// E. Conjunto de Dirección (Manillar Cónico, Piñas Multi-Botón, Bombas Brembo, Mangueras, Espejos y Guantes)
const steeringAssembly = new THREE.Group();
steeringAssembly.position.set(0, -0.135, -0.49);

const centerBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.30, 16), billetAluminumMat);
centerBar.rotation.z = Math.PI / 2;
steeringAssembly.add(centerBar);

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
  sideGroup.position.set(s * 0.14, 0, 0);
  sideGroup.rotation.y = s * -0.16;
  sideGroup.rotation.z = s * -0.06;

  // Tubo lateral del manillar
  const barTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.26, 16), darkTitaniumMat);
  barTube.rotation.z = Math.PI / 2;
  barTube.position.x = s * 0.13;
  sideGroup.add(barTube);

  // Piña de conmutadores redondeada con botones detallados
  const podGroup = new THREE.Group();
  podGroup.position.set(s * 0.072, 0.004, 0.004);
  const podMain = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.052, 16), matteBlackMat);
  podMain.rotation.z = Math.PI / 2;
  podGroup.add(podMain);

  // Interruptor rojo (Kill Switch / Arranque)
  const redSw = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.012, 0.016),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 })
  );
  redSw.position.set(0, 0.028, 0.008);
  podGroup.add(redSw);

  // Botón azul (Luces / Modo) y amarillo (Guiños)
  const blueBtn = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.010, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 })
  );
  blueBtn.position.set(s * -0.012, 0.012, 0.026);
  podGroup.add(blueBtn);

  const yellowBtn = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.009, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 })
  );
  yellowBtn.position.set(s * 0.010, -0.008, 0.028);
  podGroup.add(yellowBtn);

  sideGroup.add(podGroup);

  // Bomba Radial de Freno / Embrague y Cable Mallado Hidráulico
  const masterCyl = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.032, 0.035), darkTitaniumMat);
  masterCyl.position.set(s * 0.11, 0.012, -0.022);
  sideGroup.add(masterCyl);

  // Manguera hidráulica mallada que baja hacia la horquilla
  const hoseCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(s * 0.10, 0.005, -0.035),
    new THREE.Vector3(s * 0.04, -0.03, -0.055),
    new THREE.Vector3(s * 0.01, -0.12, -0.02)
  );
  const hoseGeo = new THREE.TubeGeometry(hoseCurve, 12, 0.0045, 8, false);
  const hoseMesh = new THREE.Mesh(hoseGeo, matteBlackMat);
  sideGroup.add(hoseMesh);

  // Puño de goma con relieve y anillo de aluminio
  const gripRing = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.012, 16), goldAnodizedMat);
  gripRing.rotation.z = Math.PI / 2;
  gripRing.position.x = s * 0.115;
  sideGroup.add(gripRing);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.13, 20), matteBlackMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.x = s * 0.182;
  sideGroup.add(grip);

  // Contrapeso CNC en el extremo del manillar
  const barEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.028, 16), goldAnodizedMat);
  barEnd.rotation.z = Math.PI / 2;
  barEnd.position.x = s * 0.258;
  sideGroup.add(barEnd);

  // Maneta articulada Brembo con puntera perforada
  const leverPivot = new THREE.Group();
  leverPivot.position.set(s * 0.11, 0.0, -0.028);
  const leverBlade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.009, 0.014), billetAluminumMat);
  leverBlade.position.set(s * 0.072, 0, -0.022);
  leverBlade.rotation.y = s * 0.20;
  leverPivot.add(leverBlade);

  const leverTip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 10), goldAnodizedMat);
  leverTip.position.set(s * 0.145, 0, -0.036);
  leverPivot.add(leverTip);
  sideGroup.add(leverPivot);

  // Espejo Retrovisor Aerodinámico con Reflejo de Ruta Realista
  const mirrorArm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.16, 10), matteBlackMat);
  mirrorArm.position.set(s * 0.115, 0.078, -0.018);
  mirrorArm.rotation.z = s * -0.42;
  sideGroup.add(mirrorArm);

  const mirrorHead = new THREE.Group();
  mirrorHead.position.set(s * 0.185, 0.145, -0.028);
  mirrorHead.rotation.y = s * -0.26;

  const mirrorCase = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.068, 0.024), carbonFiberMat);
  mirrorHead.add(mirrorCase);

  const mirrorRim = new THREE.Mesh(new THREE.BoxGeometry(0.140, 0.072, 0.018), matteBlackMat);
  mirrorRim.position.z = 0.002;
  mirrorHead.add(mirrorRim);

  const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.124, 0.058), mirrorGlassMat);
  mirrorGlass.position.z = 0.013;
  mirrorHead.add(mirrorGlass);
  sideGroup.add(mirrorHead);

  // Mano del Piloto con Guante Deportivo de Cuero, Nudillos de Carbono y Dedos sobre la Maneta
  const handGroup = new THREE.Group();
  handGroup.position.set(s * 0.18, 0.006, 0.01);

  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x161922,
    normalMap: terrainMaps.norm,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.52,
    metalness: 0.15
  });

  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.044, 18, 14), leatherMat);
  palm.scale.set(1.15, 0.62, 1.08);
  handGroup.add(palm);

  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), carbonFiberMat);
  knuckle.scale.set(1.12, 0.42, 0.58);
  knuckle.position.set(0, 0.021, -0.012);
  handGroup.add(knuckle);

  // Dedos índice y medio apoyados sobre la maneta + anular y meñique en el puño
  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0072, 0.056, 10), leatherMat);
    const onLever = f < 2;
    finger.position.set((f - 1.5) * 0.018, onLever ? 0.004 : -0.004, onLever ? -0.044 : -0.036);
    finger.rotation.x = onLever ? Math.PI / 2.2 : Math.PI / 2.6;
    handGroup.add(finger);
  }

  // Manga de campera de cuero con cierre metálico
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.058, 0.38, 16), leatherMat);
  sleeve.position.set(s * 0.02, -0.11, 0.17);
  sleeve.rotation.x = Math.PI / 2.9;
  sleeve.rotation.z = s * -0.12;
  handGroup.add(sleeve);

  sideGroup.add(handGroup);

  return { sideGroup, leverPivot, handGroup };
}

const leftSideBar = createHandlebarSide(true);
const rightSideBar = createHandlebarSide(false);
steeringAssembly.add(leftSideBar.sideGroup);
steeringAssembly.add(rightSideBar.sideGroup);

// Depósito de líquido de freno Brembo traslúcido con soporte metálico
const fluidCup = new THREE.Mesh(
  new THREE.CylinderGeometry(0.017, 0.017, 0.034, 16),
  new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85, roughness: 0.1, clearcoat: 1.0 })
);
fluidCup.position.set(0.23, 0.054, -0.022);
steeringAssembly.add(fluidCup);

const fluidCap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.008, 16), matteBlackMat);
fluidCap.position.set(0.23, 0.073, -0.022);
steeringAssembly.add(fluidCap);

cockpitGroup.add(steeringAssembly);

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
  const currentGear = simState.gear;
  const maxGearSpeed = simState.gearLimits[currentGear];
  const minGearSpeed = simState.gearMinSpeed[currentGear];

  // 1. Acelerador y Curva de Potencia
  if (keys.throttle) {
    if (currentGear === 0) {
      simState.rpm = Math.min(simState.maxRpm, simState.rpm + 7000 * dt);
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, 0, 0.1);
    } else {
      const inPowerBand = (simState.rpm >= 4000 && simState.rpm <= 8200);
      const accelBoost = inPowerBand ? 1.38 : 0.82;

      if (simState.speed < minGearSpeed - 15) {
        simState.speed = Math.max(0, simState.speed + 6.5 * dt);
      } else {
        const topRatio = Math.max(0, 1 - (simState.speed / maxGearSpeed));
        simState.speed = Math.min(simState.maxSpeed, simState.speed + (34 * accelBoost * topRatio) * dt);
      }

      const gearRatio = simState.speed / maxGearSpeed;
      simState.rpm = simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm));
      simState.fuelLiters = Math.max(0, simState.fuelLiters - (0.007 + (simState.rpm / simState.maxRpm) * 0.02) * dt);

      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, 0.026, 0.08);
    }
  } else {
    if (currentGear === 0) {
      simState.rpm = Math.max(simState.idleRpm, simState.rpm - 4500 * dt);
      simState.speed = Math.max(0, simState.speed - 9 * dt);
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, 0, 0.1);
    } else {
      const engineBraking = 10 + (currentGear === 1 ? 16 : 8);
      simState.speed = Math.max(0, simState.speed - engineBraking * dt);
      const gearRatio = simState.speed / maxGearSpeed;
      simState.rpm = Math.max(simState.idleRpm, simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm)));
      simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, -0.010, 0.08);
    }
  }

  // 2. Freno y Hundimiento de Horquilla (Fork Dive)
  if (keys.brake) {
    simState.speed = Math.max(0, simState.speed - 58 * dt);
    simState.pitchSuspension = THREE.MathUtils.lerp(simState.pitchSuspension, -0.055, 0.16);
    simState.brakePull = THREE.MathUtils.lerp(simState.brakePull, 1.0, 0.25);
    if (simState.speed > 55 && Math.random() < 0.06) {
      window.soundEngine.playTireScreech();
    }
  } else {
    simState.brakePull = THREE.MathUtils.lerp(simState.brakePull, 0.0, 0.2);
  }

  simState.clutchPull = THREE.MathUtils.lerp(simState.clutchPull, 0.0, 0.15);

  leftSideBar.leverPivot.rotation.y = -simState.clutchPull * 0.25;
  rightSideBar.leverPivot.rotation.y = simState.brakePull * 0.25;

  // 3. Dirección Natural (A = Izquierda, D = Derecha)
  let steer = 0;
  if (keys.steerLeft) steer -= 1;
  if (keys.steerRight) steer += 1;

  const steerSpeed = (simState.speed > 120 ? 5.2 : (simState.speed > 50 ? 6.8 : 8.2));
  simState.steeringInput = THREE.MathUtils.lerp(simState.steeringInput, steer, steerSpeed * dt);

  const maxLean = 0.46; // ~26° de inclinación
  simState.leanAngle = THREE.MathUtils.lerp(simState.leanAngle, simState.steeringInput * maxLean, 6.8 * dt);

  const turnRate = 5.8 * Math.min(1.4, (simState.speed + 15) / 75);
  simState.laneOffset += simState.steeringInput * turnRate * dt;
  simState.laneOffset = Math.max(-4.9, Math.min(4.9, simState.laneOffset));

  // Avance a lo largo de la ruta
  const speedMps = simState.speed / 3.6;
  simState.playerDistance += speedMps * dt;

  const roadOri = getRoadOrientation(simState.playerDistance);

  // Inercia centrífuga en curva
  simState.laneOffset += roadOri.curveRate * (simState.speed / 100) * 1.5 * dt;
  simState.onRumble = (Math.abs(simState.laneOffset) > 4.3);

  // Mirada hacia el ápice de la curva
  const targetLook = -simState.steeringInput * 0.085;
  simState.headLookApex = THREE.MathUtils.lerp(simState.headLookApex, targetLook, 5.5 * dt);

  // Posición de la cámara sobre la moto
  const perpX = Math.cos(roadOri.yaw);
  const perpZ = Math.sin(roadOri.yaw);

  const speedWindBuffet = Math.pow(Math.max(0, simState.speed - 110) / 85, 2) * 0.007;
  const vib = (simState.rpm / simState.maxRpm) * 0.004 + (simState.onRumble ? 0.022 : 0) + speedWindBuffet;

  camera.position.x = roadOri.x + (perpX * simState.laneOffset) + (Math.random() - 0.5) * vib;
  camera.position.y = roadOri.y + 1.38 + (Math.random() - 0.5) * vib;
  camera.position.z = roadOri.z + (perpZ * simState.laneOffset);

  camera.rotation.set(0, 0, 0);
  camera.rotation.y = roadOri.yaw + simState.headLookApex;
  camera.rotation.x = roadOri.pitch + simState.pitchSuspension;
  camera.rotation.z = -simState.leanAngle * 0.74 + roadOri.roll;

  camera.fov = 64 + (simState.speed / simState.maxSpeed) * 11;
  camera.updateProjectionMatrix();

  // Contramanillar sutil en el conjunto de dirección y desplazamiento de reflejo en espejos
  steeringAssembly.rotation.y = -simState.steeringInput * 0.065;
  mirrorReflTex.offset.x = simState.leanAngle * 0.15;

  // Actualizar la luz solar y su frustum de sombras para que siga al jugador
  sunLight.position.set(
    camera.position.x + sunDirection.x * 110,
    camera.position.y + sunDirection.y * 110,
    camera.position.z + sunDirection.z * 110
  );
  sunLight.target.position.set(camera.position.x, camera.position.y, camera.position.z - 25);
  sunLight.target.updateMatrixWorld();

  // Faro delantero sigue la moto
  motoHeadlight.position.copy(camera.position);
  motoHeadlight.target.position.set(
    camera.position.x - Math.sin(roadOri.yaw) * 40,
    camera.position.y - 0.5,
    camera.position.z - Math.cos(roadOri.yaw) * 40
  );
  motoHeadlight.target.updateMatrixWorld();

  // Cúpula celeste y lago centrados respecto al avance
  skyDome.position.copy(camera.position);
  waterMesh.position.x = camera.position.x - 180;
  waterMesh.position.z = camera.position.z - 200;

  // Actualizar Árboles 3D y Rocas usando la función exacta de elevación del terreno
  natureObjects.forEach(p => {
    let pDist = simState.playerDistance + p.distAhead;
    const pt = getRoadPoint(pDist);
    const ori = getRoadOrientation(pDist);

    const px = Math.cos(ori.yaw) * p.offsetLateral;
    const pz = Math.sin(ori.yaw) * p.offsetLateral;
    const wx = pt.x + px;
    const wz = pt.z + pz;

    const slopeY = getTerrainElevationOffset(p.offsetLateral, wx, wz);
    p.mesh.position.set(wx, pt.y + slopeY - 0.25, wz);

    p.distAhead -= speedMps * dt;
    if (p.distAhead < -18) {
      p.distAhead += natureObjects.length * 6.0;
    }
  });

  // Actualizar Tachas, Postes y Carteles de Curva
  roadDetails.forEach(item => {
    let cDist = simState.playerDistance + item.distOffset;
    const pt = getRoadPoint(cDist);
    const ori = getRoadOrientation(cDist);

    item.group.position.set(pt.x, pt.y, pt.z);
    item.group.rotation.set(0, ori.yaw, 0);

    item.distOffset -= speedMps * dt;
    if (item.distOffset < -12) {
      item.distOffset += roadDetails.length * 9;
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

    if (v.distAhead < 7 && v.distAhead > -7 && !v.passed && v.laneOffset < 0) {
      window.soundEngine.playPassWhoosh();
      v.passed = true;
    }

    const distToPlayer = Math.hypot(camera.position.x - v.mesh.position.x, camera.position.z - v.mesh.position.z);
    if (distToPlayer < 2.7 && simState.active) {
      simState.speed = Math.max(0, simState.speed - 55);
      simState.bikeHealth = Math.max(0, simState.bikeHealth - 35);
      window.soundEngine.playTireScreech();
      if (simState.bikeHealth <= 0) {
        triggerBreakdown("Colisión Vial", "Choque severo contra un vehículo en la ruta.");
      }
    }

    if (v.distAhead < -28 || v.distAhead > 500) {
      v.distAhead = 320 + Math.random() * 200;
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

  if (simState.active && !simState.paused) {
    window.soundEngine.update(simState.rpm, simState.maxRpm, simState.speed, simState.maxSpeed, simState.onRumble);
  }

  // Distancia a destino
  if (simState.speed > 0) {
    const kmCovered = (simState.speed / 3600) * dt * 18;
    simState.targetDistanceKm = Math.max(0, simState.targetDistanceKm - kmCovered);
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

  for (let i = 0; i < RIBBON_POINTS; i++) {
    const sampleDist = Math.floor(simState.playerDistance / POINT_STEP) * POINT_STEP + (i * POINT_STEP) - 10.5;
    const p = getRoadPoint(sampleDist);
    const ori = getRoadOrientation(sampleDist);

    const nx = Math.cos(ori.yaw);
    const nz = Math.sin(ori.yaw);

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
// 13. PANTALLA DIGITAL TFT SUPERBIKE (CON TELEMETRÍA E INDICADOR DE INCLINACIÓN)
// ============================================================================
function updateTFT() {
  const c = dashCtx;
  const bg = c.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#040814');
  bg.addColorStop(1, '#091124');
  c.fillStyle = bg;
  c.fillRect(0, 0, 1024, 512);

  // Bisel interior luminoso
  c.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  c.lineWidth = 6;
  c.strokeRect(12, 12, 1000, 488);

  // Barra superior de Shift Lights (LEDs de corte de RPM)
  const isShiftWarning = simState.rpm >= 8200;
  for (let i = 0; i < 9; i++) {
    const lx = 210 + (i * 68);
    let ledColor = '#1e293b';
    if (simState.rpm > 5500 && i < 3) ledColor = '#22c55e';
    if (simState.rpm > 6800 && i >= 3 && i < 6) ledColor = '#f59e0b';
    if (simState.rpm > 7800 && i >= 6) ledColor = '#ef4444';
    if (isShiftWarning) {
      ledColor = (performance.now() % 140 < 70) ? '#38bdf8' : '#ef4444';
    }
    c.fillStyle = ledColor;
    c.beginPath();
    c.roundRect(lx, 26, 52, 18, 5);
    c.fill();
  }

  // Testigos de giro
  if (keys.steerLeft && performance.now() % 480 < 240) {
    c.fillStyle = '#22c55e';
    c.font = '700 46px sans-serif';
    c.fillText('◀', 90, 58);
  }
  if (keys.steerRight && performance.now() % 480 < 240) {
    c.fillStyle = '#22c55e';
    c.font = '700 46px sans-serif';
    c.fillText('▶', 930, 58);
  }

  // Indicador de Marcha Enorme (Izquierda)
  c.fillStyle = '#0f172a';
  c.beginPath();
  c.roundRect(50, 95, 210, 245, 16);
  c.fill();
  c.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  c.lineWidth = 3;
  c.stroke();

  c.fillStyle = simState.gear === 0 ? '#22c55e' : '#38bdf8';
  c.font = '700 165px "Chakra Petch", monospace';
  c.textAlign = 'center';
  const gText = simState.gear === 0 ? 'N' : simState.gear;
  c.fillText(gText, 155, 265);
  c.font = '700 26px "Chakra Petch"';
  c.fillStyle = '#94a3b8';
  c.fillText('GEAR', 155, 318);

  // Velocímetro Digital Central
  c.fillStyle = '#ffffff';
  c.font = '700 205px "Share Tech Mono", monospace';
  c.fillText(Math.round(simState.speed).toString().padStart(3, ' '), 515, 265);
  c.font = '700 34px "Chakra Petch"';
  c.fillStyle = '#38bdf8';
  c.fillText('KM / H', 515, 322);

  // Telemetría Derecha: Combustible, Temperatura y Ángulo de Inclinación
  c.textAlign = 'right';
  c.font = '700 32px "Share Tech Mono"';
  c.fillStyle = simState.fuelLiters < 4 ? '#ef4444' : '#e2e8f0';
  c.fillText(`FUEL ${simState.fuelLiters.toFixed(1)}L`, 965, 135);

  c.fillStyle = simState.engineTemp > 105 ? '#ef4444' : '#e2e8f0';
  c.fillText(`TEMP ${Math.round(simState.engineTemp)}°C`, 965, 195);

  const leanDeg = Math.round(Math.abs(simState.leanAngle) * (180 / Math.PI));
  c.fillStyle = '#f59e0b';
  c.fillText(`LEAN  ${leanDeg}°`, 965, 255);

  c.fillStyle = '#94a3b8';
  c.font = '700 26px "Share Tech Mono"';
  c.fillText(`ODO ${simState.odometer.toFixed(1)}km`, 965, 315);

  // Barra de Tacómetro RPM inferior con escala numérica
  const rpmRatio = Math.min(1, simState.rpm / simState.maxRpm);
  c.fillStyle = '#1e293b';
  c.beginPath();
  c.roundRect(55, 385, 914, 48, 8);
  c.fill();

  const barGrad = c.createLinearGradient(55, 0, 969, 0);
  barGrad.addColorStop(0, '#0284c7');
  barGrad.addColorStop(0.75, '#38bdf8');
  barGrad.addColorStop(0.85, '#f59e0b');
  barGrad.addColorStop(1.0, '#ef4444');
  c.fillStyle = barGrad;
  c.beginPath();
  c.roundRect(55, 385, Math.max(12, 914 * rpmRatio), 48, 8);
  c.fill();

  // Escala 1 a 10 (x1000 RPM)
  c.fillStyle = '#94a3b8';
  c.font = '700 22px "Chakra Petch"';
  c.textAlign = 'center';
  for (let r = 1; r <= 10; r++) {
    c.fillText(r.toString(), 55 + (r * 91.4) - 10, 468);
  }

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

// Inicializar posición de cámara, luces y mallas desde el cuadro 0 (incluso antes de arrancar)
updateHandlingPhysics(0.016);
updateWorldMeshes();
updateTFT();
renderer.render(scene, camera);
