// Motor de Simulación en Primera Persona: Ambiente Hiperrealista, Tráfico 3D y Física de Ruta
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

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

// Estado físico y mecánico de la motocicleta
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
  
  // Dinámica de conducción
  leanAngle: 0,
  roadPosition: 0.15, // -1 a +1 (0.15 = carril derecho normal)
  roadCurve: 0,
  targetDistanceKm: 15.0,
  odometer: 0,
  onRumble: false,
  
  // Ratios de marchas
  gearLimits: [0, 48, 80, 115, 145, 175, 205],
  gearMinSpeed: [0, 0, 20, 40, 65, 88, 110],

  // Ciclo ambiental
  timeOfDay: 0.35, // 0 = Amanecer, 0.4 = Mediodía, 0.7 = Atardecer, 0.9 = Noche
  sunX: 680,
  clouds: [
    { x: 100, y: 50, scale: 1.2, speed: 0.2 },
    { x: 450, y: 70, scale: 0.9, speed: 0.15 },
    { x: 750, y: 35, scale: 1.4, speed: 0.25 }
  ]
};

// Sistema de Tráfico en 3D
let trafficVehicles = [
  { z: 600, lane: -0.4, speed: 70, type: 'truck', color: '#c53030', passed: false },
  { z: 1200, lane: -0.4, speed: 85, type: 'car', color: '#2b6cb0', passed: false },
  { z: 900, lane: 0.25, speed: 65, type: 'pickup', color: '#d69e2e', passed: false }
];

// Postes de tendido eléctrico y mojones reflectivos
let roadProps = [];
for (let z = 100; z < 1800; z += 120) {
  roadProps.push({ z: z, type: 'pole' });
  roadProps.push({ z: z + 60, type: 'marker' });
}

// Teclado
const keys = {
  throttle: false,
  brake: false,
  steerLeft: false,
  steerRight: false
};

window.addEventListener('keydown', (e) => {
  if (['KeyW', 'ArrowUp'].includes(e.code)) keys.throttle = true;
  if (['KeyS', 'ArrowDown'].includes(e.code)) keys.brake = true;
  if (['KeyA', 'ArrowLeft'].includes(e.code)) keys.steerLeft = true;
  if (['KeyD', 'ArrowRight'].includes(e.code)) keys.steerRight = true;

  if (e.code === 'KeyE') shiftUp();
  if (e.code === 'KeyQ') shiftDown();
  if (e.code === 'KeyL') simState.headlights = !simState.headlights;
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
  requestAnimationFrame(simLoop);
});

btnRespawn.addEventListener('click', () => {
  location.reload();
});

// Bucle principal
let lastTimestamp = performance.now();

function simLoop(now) {
  const dt = Math.min(0.08, (now - lastTimestamp) / 1000);
  lastTimestamp = now;

  if (simState.active && !simState.paused) {
    updatePhysics(dt);
    updateEnvironmentAndTraffic(dt);
  }

  renderRealisticWorld();

  if (simState.active) {
    requestAnimationFrame(simLoop);
  }
}

// Física del motor y la carretera
function updatePhysics(dt) {
  const currentGear = simState.gear;
  const maxGearSpeed = simState.gearLimits[currentGear];
  const minGearSpeed = simState.gearMinSpeed[currentGear];

  // Acelerador
  if (keys.throttle) {
    if (currentGear === 0) {
      simState.rpm = Math.min(simState.maxRpm, simState.rpm + 6500 * dt);
    } else {
      const idealRpm = (simState.rpm >= 3800 && simState.rpm <= 7800);
      const accelFactor = idealRpm ? 1.25 : 0.75;
      
      if (simState.speed < minGearSpeed - 15) {
        simState.speed = Math.max(0, simState.speed + 5 * dt);
      } else {
        const topRatio = Math.max(0, 1 - (simState.speed / maxGearSpeed));
        simState.speed = Math.min(simState.maxSpeed, simState.speed + (28 * accelFactor * topRatio) * dt);
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
    simState.speed = Math.max(0, simState.speed - 52 * dt);
    if (simState.speed > 55 && Math.random() < 0.06) {
      window.soundEngine.playTireScreech();
    }
  }

  // Dirección y Contramanillar
  if (keys.steerLeft) {
    simState.roadPosition = Math.max(-0.85, simState.roadPosition - (1.15 * dt));
    simState.leanAngle = Math.max(-0.28, simState.leanAngle - 0.95 * dt);
  } else if (keys.steerRight) {
    simState.roadPosition = Math.min(0.85, simState.roadPosition + (1.15 * dt));
    simState.leanAngle = Math.min(0.28, simState.leanAngle + 0.95 * dt);
  } else {
    simState.leanAngle *= 0.88;
  }

  // Curvas orgánicas de ruta
  simState.roadCurve = Math.sin(performance.now() * 0.00055) * 0.65;
  simState.roadPosition += (simState.roadCurve * (simState.speed / simState.maxSpeed) * 0.32) * dt;

  // Detección de banquina / serrucho
  simState.onRumble = (Math.abs(simState.roadPosition) > 0.68);

  // Temperatura motor
  if (simState.rpm > simState.redlineRpm) {
    simState.engineTemp = Math.min(130, simState.engineTemp + 4.5 * dt);
  } else {
    const cooling = (simState.speed / 100) * 1.6;
    simState.engineTemp = Math.max(78, simState.engineTemp + (0.45 - cooling) * dt);
  }

  // Audio motor y banquina
  window.soundEngine.update(simState.rpm, simState.maxRpm, simState.speed, simState.maxSpeed, simState.onRumble);

  // Daño por banquina a alta velocidad
  if (simState.onRumble && simState.speed > 110) {
    simState.bikeHealth = Math.max(0, simState.bikeHealth - 3 * dt);
  }

  // Distancia
  if (simState.speed > 0) {
    const kmCovered = (simState.speed / 3600) * dt * 18;
    simState.targetDistanceKm = Math.max(0, simState.targetDistanceKm - kmCovered);
    simState.odometer += kmCovered;

    if (simState.targetDistanceKm <= 0) {
      arriveAtWaypoint();
    }
  }

  // Emergencias
  if (simState.fuelLiters <= 0) triggerBreakdown("Sin Combustible", "El motor tosió y se apagó por falta de nafta.");
  if (simState.engineTemp >= 125) triggerBreakdown("Motor Fundido", "La temperatura excesiva reventó el radiador.");

  updateGps();
}

// Tráfico y Entorno Dinámico
function updateEnvironmentAndTraffic(dt) {
  const speedScale = (simState.speed * 0.28) + 1;

  // Mover nubes
  simState.clouds.forEach(c => {
    c.x += c.speed * dt * 30;
    if (c.x > canvas.width + 150) c.x = -150;
  });

  // Mover postes de tendido y mojones
  roadProps.forEach(p => {
    p.z -= speedScale;
    if (p.z < 20) p.z += 1700;
  });

  // Mover tráfico
  trafficVehicles.forEach(v => {
    // Si viene de frente (carril izquierdo, lane negativo), se acerca rápido
    if (v.lane < 0) {
      v.z -= (speedScale + (v.speed * 0.25));
    } else {
      // Mismo sentido (adelante de ti)
      v.z -= (speedScale - (v.speed * 0.25));
    }

    // Sonido Doppler al cruzar
    if (v.z < 180 && !v.passed && v.lane < 0) {
      window.soundEngine.playPassWhoosh();
      v.passed = true;
    }

    // Colisión con vehículo
    if (v.z > 40 && v.z < 110 && Math.abs(simState.roadPosition - v.lane) < 0.22) {
      simState.speed = Math.max(0, simState.speed - 60);
      simState.bikeHealth = Math.max(0, simState.bikeHealth - 35);
      window.soundEngine.playTireScreech();
      if (simState.bikeHealth <= 0) {
        triggerBreakdown("Accidente en Ruta", "Impacto contra otro vehículo en el asfalto.");
      }
    }

    // Respawn lejos
    if (v.z < 20 || v.z > 2200) {
      v.z = 1800 + Math.random() * 500;
      v.lane = Math.random() < 0.6 ? -0.4 : 0.22;
      v.passed = false;
      v.type = Math.random() < 0.35 ? 'truck' : (Math.random() < 0.5 ? 'pickup' : 'car');
    }
  });
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

// RENDERIZADO HIPERREALISTA DEL MUNDO
function renderRealisticWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Vibración sutil de la moto (por motor + suspensión)
  const vibMagnitude = (simState.rpm / simState.maxRpm) * 1.5 + (simState.onRumble ? 4 : 0);
  const vibX = (Math.random() - 0.5) * vibMagnitude;
  const vibY = (Math.random() - 0.5) * vibMagnitude;

  ctx.save();
  ctx.translate(canvas.width / 2 + vibX, canvas.height / 2 + vibY);
  ctx.rotate(-simState.leanAngle * 0.42);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  const horizonY = 245;

  // 1. Cielo atmosférico realista con gradiente
  drawAtmosphericSky(horizonY);

  // 2. Sol brillante con resplandor
  drawSunAndFlare(horizonY);

  // 3. Nubes con volumen
  drawClouds();

  // 4. Montañas en múltiples capas de paralaje
  drawMultiLayerMountains(horizonY);

  // 5. Suelo y vegetación del paisaje
  drawTerrain(horizonY);

  // 6. Carretera en perspectiva 3D con texturas y banquina rugosa
  drawRealisticRoad(horizonY);

  // 7. Infraestructura vial: Postes de tendido eléctrico con cables colgando
  drawPowerPolesAndCables(horizonY);

  // 8. Tráfico en 3D (camiones, autos)
  drawTraffic(horizonY);

  ctx.restore();

  // 9. Haz de luz del faro
  if (simState.headlights) {
    drawHeadlightBeam();
  }

  // 10. Efecto de viento a alta velocidad en los bordes
  if (simState.speed > 100) {
    drawSpeedWindVignette();
  }

  // 11. Parabrisas transparente y Cabina (Cockpit)
  drawWindshield();
  drawMotorcycleCockpit(vibMagnitude);
}

// Cielo realista
function drawAtmosphericSky(horizonY) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, '#0c2340');    // Azul cobalto profundo arriba
  skyGrad.addColorStop(0.5, '#285885');  // Azul cielo medio
  skyGrad.addColorStop(0.85, '#87a8c8'); // Neblina atmosférica
  skyGrad.addColorStop(1, '#d8b998');    // Tono cálido en el horizonte
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-150, -100, canvas.width + 300, horizonY + 100);
}

// Sol y resplandor
function drawSunAndFlare(horizonY) {
  const sx = simState.sunX - (simState.roadCurve * 60);
  const sy = horizonY - 110;

  // Resplandor exterior
  const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 180);
  glow.addColorStop(0, 'rgba(255, 255, 230, 0.85)');
  glow.addColorStop(0.3, 'rgba(255, 220, 150, 0.35)');
  glow.addColorStop(1, 'rgba(255, 200, 100, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 180, sy - 180, 360, 360);

  // Núcleo del sol
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sx, sy, 18, 0, Math.PI * 2);
  ctx.fill();
}

// Nubes procedurales
function drawClouds() {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  simState.clouds.forEach(c => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(c.scale, c.scale);
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.arc(28, -6, 32, 0, Math.PI * 2);
    ctx.arc(58, -2, 24, 0, Math.PI * 2);
    ctx.arc(80, 4, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// Montañas multicapa con perspectiva aérea
function drawMultiLayerMountains(horizonY) {
  const curveShift = simState.roadCurve * 40;

  // Capa 1: Cordillera lejana (azulada y difusa)
  ctx.fillStyle = '#3a506b';
  ctx.beginPath();
  ctx.moveTo(-150, horizonY);
  ctx.lineTo(60 + curveShift * 0.3, 150);
  ctx.lineTo(220 + curveShift * 0.3, 190);
  ctx.lineTo(400 + curveShift * 0.3, 130);
  ctx.lineTo(580 + curveShift * 0.3, 185);
  ctx.lineTo(760 + curveShift * 0.3, 140);
  ctx.lineTo(950 + curveShift * 0.3, 175);
  ctx.lineTo(canvas.width + 150, horizonY);
  ctx.closePath();
  ctx.fill();

  // Capa 2: Cerros intermedios (más oscuros y con vegetación)
  ctx.fillStyle = '#2d3e35';
  ctx.beginPath();
  ctx.moveTo(-150, horizonY);
  ctx.lineTo(120 + curveShift * 0.6, 185);
  ctx.lineTo(290 + curveShift * 0.6, 215);
  ctx.lineTo(480 + curveShift * 0.6, 175);
  ctx.lineTo(680 + curveShift * 0.6, 210);
  ctx.lineTo(880 + curveShift * 0.6, 180);
  ctx.lineTo(canvas.width + 150, horizonY);
  ctx.closePath();
  ctx.fill();
}

// Terreno
function drawTerrain(horizonY) {
  // Suelo desierto/estepa con gradiente
  const landGrad = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
  landGrad.addColorStop(0, '#594d3c');
  landGrad.addColorStop(0.3, '#75654c');
  landGrad.addColorStop(1, '#3b3326');
  ctx.fillStyle = landGrad;
  ctx.fillRect(-150, horizonY, canvas.width + 300, canvas.height - horizonY + 50);

  // Matorrales y piedras en el suelo
  ctx.fillStyle = '#2e382b';
  for (let i = 0; i < 12; i++) {
    const bx = ((i * 110 + (performance.now() * 0.05 * (simState.speed + 10))) % (canvas.width + 100)) - 50;
    const by = horizonY + 20 + (i * 12);
    ctx.fillRect(bx, by, 8 + i, 4 + i * 0.5);
  }
}

// Carretera Hiperrealista en 3D
function drawRealisticRoad(horizonY) {
  const cx = (canvas.width / 2) - (simState.roadPosition * 340) + (simState.roadCurve * 150);

  // 1. Asfalto principal con gradiente
  const roadGrad = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
  roadGrad.addColorStop(0, '#1c1e22');
  roadGrad.addColorStop(1, '#2c2f36');
  ctx.fillStyle = roadGrad;

  ctx.beginPath();
  ctx.moveTo(cx - 35, horizonY);
  ctx.lineTo(cx + 35, horizonY);
  ctx.lineTo((canvas.width / 2) + 540, canvas.height);
  ctx.lineTo((canvas.width / 2) - 540, canvas.height);
  ctx.closePath();
  ctx.fill();

  // 2. Banquina / Franja Sonora Rugosa (Rumble Strips rojas y blancas)
  const rumbleOffset = (performance.now() * (simState.speed * 0.06)) % 40;
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#c53030';
  ctx.setLineDash([20, 20]);
  ctx.lineDashOffset = -rumbleOffset;

  // Banquina izquierda
  ctx.beginPath();
  ctx.moveTo(cx - 36, horizonY);
  ctx.lineTo((canvas.width / 2) - 540, canvas.height);
  ctx.stroke();

  // Banquina derecha
  ctx.beginPath();
  ctx.moveTo(cx + 36, horizonY);
  ctx.lineTo((canvas.width / 2) + 540, canvas.height);
  ctx.stroke();

  // Franja blanca alterna
  ctx.strokeStyle = '#ffffff';
  ctx.lineDashOffset = -rumbleOffset + 20;
  ctx.beginPath();
  ctx.moveTo(cx - 36, horizonY); ctx.lineTo((canvas.width / 2) - 540, canvas.height);
  ctx.moveTo(cx + 36, horizonY); ctx.lineTo((canvas.width / 2) + 540, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // 3. Líneas de carril exteriores (blancas continuas)
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 30, horizonY); ctx.lineTo((canvas.width / 2) - 460, canvas.height);
  ctx.moveTo(cx + 30, horizonY); ctx.lineTo((canvas.width / 2) + 460, canvas.height);
  ctx.stroke();

  // 4. Doble línea amarilla central reflectante
  const dashOffset = (performance.now() * (simState.speed * 0.055)) % 60;
  ctx.strokeStyle = '#ecc94b';
  ctx.lineWidth = 4;
  ctx.setLineDash([35, 25]);
  ctx.lineDashOffset = -dashOffset;

  const centerLaneBottom = (canvas.width / 2) - (simState.roadPosition * 90);
  ctx.beginPath();
  ctx.moveTo(cx - 2, horizonY);
  ctx.lineTo(centerLaneBottom - 4, canvas.height);
  ctx.moveTo(cx + 2, horizonY);
  ctx.lineTo(centerLaneBottom + 4, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Postes de Tendido Eléctrico y Mojones con Cables Colgantes
function drawPowerPolesAndCables(horizonY) {
  const cx = (canvas.width / 2) - (simState.roadPosition * 340) + (simState.roadCurve * 150);
  let prevPoleScreen = null;

  roadProps.filter(p => p.type === 'pole').sort((a, b) => b.z - a.z).forEach(pole => {
    const scale = 140 / (pole.z + 10);
    const screenX = (canvas.width / 2) + (580 * scale * 1.5) + (simState.roadCurve * 50);
    const screenY = horizonY + (360 * scale);
    const poleHeight = 220 * scale;

    if (screenY > horizonY && screenY < canvas.height + 100) {
      // Poste de madera tratada
      ctx.fillStyle = '#3c2f1f';
      ctx.fillRect(screenX - (6 * scale), screenY - poleHeight, 12 * scale, poleHeight);

      // Travesaño superior
      ctx.fillStyle = '#261e14';
      ctx.fillRect(screenX - (35 * scale), screenY - poleHeight + (10 * scale), 70 * scale, 6 * scale);

      // Aisladores cerámicos verdes
      ctx.fillStyle = '#38a169';
      ctx.fillRect(screenX - (30 * scale), screenY - poleHeight + (4 * scale), 6 * scale, 6 * scale);
      ctx.fillRect(screenX + (24 * scale), screenY - poleHeight + (4 * scale), 6 * scale, 6 * scale);

      // Cable colgando entre postes contiguos
      if (prevPoleScreen) {
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = Math.max(1, 2 * scale);
        ctx.beginPath();
        ctx.moveTo(prevPoleScreen.x, prevPoleScreen.y);
        ctx.quadraticCurveTo(
          (prevPoleScreen.x + screenX) / 2,
          ((prevPoleScreen.y + (screenY - poleHeight)) / 2) + (15 * scale),
          screenX,
          screenY - poleHeight
        );
        ctx.stroke();
      }
      prevPoleScreen = { x: screenX, y: screenY - poleHeight };
    }
  });

  // Mojones reflectantes kilométricos al borde de la calzada
  roadProps.filter(p => p.type === 'marker').forEach(m => {
    const scale = 140 / (m.z + 10);
    const screenX = cx + (38 * 8.5 * scale);
    const screenY = horizonY + (360 * scale);
    const markerH = 30 * scale;

    if (screenY > horizonY && screenY < canvas.height) {
      ctx.fillStyle = '#f7fafc';
      ctx.fillRect(screenX, screenY - markerH, 4 * scale, markerH);
      // Banda reflectante verde/naranja
      ctx.fillStyle = '#dd6b20';
      ctx.fillRect(screenX, screenY - markerH + (4 * scale), 4 * scale, 6 * scale);
    }
  });
}

// Tráfico en 3D
function drawTraffic(horizonY) {
  const cx = (canvas.width / 2) - (simState.roadPosition * 340) + (simState.roadCurve * 150);

  trafficVehicles.forEach(v => {
    if (v.z <= 30 || v.z >= 1700) return;

    const scale = 140 / v.z;
    const laneOffset = v.lane * 360 * scale * 2.2;
    const screenX = cx + laneOffset;
    const screenY = horizonY + (360 * scale);

    const w = (v.type === 'truck' ? 70 : 45) * scale;
    const h = (v.type === 'truck' ? 65 : 35) * scale;

    // Sombra del vehículo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(screenX, screenY, w * 0.7, h * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Carrocería
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.roundRect(screenX - w / 2, screenY - h, w, h, 4 * scale);
    ctx.fill();

    // Vidrios / Parabrisas
    ctx.fillStyle = '#1a365d';
    ctx.fillRect(screenX - w * 0.4, screenY - h + (6 * scale), w * 0.8, h * 0.35);

    // Luces
    if (v.lane < 0) {
      // Viene de frente: Faros delanteros amarillos/blancos encendidos
      ctx.fillStyle = '#fffae0';
      ctx.shadowColor = '#ffffaa';
      ctx.shadowBlur = 12 * scale;
      ctx.fillRect(screenX - w * 0.42, screenY - (12 * scale), 8 * scale, 6 * scale);
      ctx.fillRect(screenX + w * 0.28, screenY - (12 * scale), 8 * scale, 6 * scale);
      ctx.shadowBlur = 0;
    } else {
      // Mismo sentido: Luces traseras rojas
      ctx.fillStyle = '#e53e3e';
      ctx.shadowColor = '#ff2222';
      ctx.shadowBlur = 10 * scale;
      ctx.fillRect(screenX - w * 0.42, screenY - (10 * scale), 8 * scale, 5 * scale);
      ctx.fillRect(screenX + w * 0.28, screenY - (10 * scale), 8 * scale, 5 * scale);
      ctx.shadowBlur = 0;
    }
  });
}

function drawHeadlightBeam() {
  const cone = ctx.createRadialGradient(canvas.width / 2, canvas.height - 80, 50, canvas.width / 2, 280, 440);
  cone.addColorStop(0, 'rgba(255, 255, 220, 0.22)');
  cone.addColorStop(1, 'rgba(255, 255, 220, 0)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 90, canvas.height - 80);
  ctx.lineTo(canvas.width / 2 - 340, 240);
  ctx.lineTo(canvas.width / 2 + 340, 240);
  ctx.lineTo(canvas.width / 2 + 90, canvas.height - 80);
  ctx.closePath();
  ctx.fill();
}

function drawSpeedWindVignette() {
  const speedRatio = Math.min(1, (simState.speed - 100) / 95);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * speedRatio})`;
  ctx.lineWidth = 2;

  for (let i = 0; i < 6; i++) {
    const y = 80 + (i * 70) + (Math.sin(performance.now() * 0.02 + i) * 10);
    ctx.beginPath();
    // Líneas de viento laterales
    ctx.moveTo(0, y);
    ctx.lineTo(70 + (Math.random() * 80), y + 10);
    ctx.moveTo(canvas.width, y);
    ctx.lineTo(canvas.width - (70 + (Math.random() * 80)), y + 10);
    ctx.stroke();
  }
}

// Parabrisas aerodinámico transparente con reflejos
function drawWindshield() {
  const cx = canvas.width / 2;
  const cy = canvas.height - 130;

  // Lámina transparente curvada
  const shieldGrad = ctx.createLinearGradient(cx, cy - 140, cx, cy);
  shieldGrad.addColorStop(0, 'rgba(180, 215, 235, 0.12)');
  shieldGrad.addColorStop(1, 'rgba(20, 30, 45, 0.45)');
  ctx.fillStyle = shieldGrad;

  ctx.beginPath();
  ctx.moveTo(cx - 160, cy);
  ctx.quadraticCurveTo(cx - 140, cy - 130, cx - 70, cy - 160);
  ctx.lineTo(cx + 70, cy - 160);
  ctx.quadraticCurveTo(cx + 140, cy - 130, cx + 160, cy);
  ctx.closePath();
  ctx.fill();

  // Borde y bisel pulido del parabrisas
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Reflejo diagonal de luz solar en el vidrio
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(cx - 90, cy - 150);
  ctx.lineTo(cx - 20, cy);
  ctx.stroke();
}

// DIBUJO DEL COCKPIT (MANILLAR Y TABLERO DIGITAL)
function drawMotorcycleCockpit(vib) {
  const cx = canvas.width / 2;
  const cy = canvas.height + (vib * 0.5);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(simState.leanAngle * 0.28);

  // Manillar tubular
  ctx.strokeStyle = '#272d38';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.moveTo(-330, -118);
  ctx.lineTo(-120, -70);
  ctx.lineTo(120, -70);
  ctx.lineTo(330, -118);
  ctx.stroke();

  // Puños texturados
  ctx.fillStyle = '#0f1115';
  ctx.fillRect(-360, -132, 75, 28);
  ctx.fillRect(285, -132, 75, 28);

  // Manetas de aluminio
  ctx.strokeStyle = '#cbd5e0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-320, -114); ctx.lineTo(-240, -98);
  ctx.moveTo(320, -114);  ctx.lineTo(240, -98);
  ctx.stroke();

  // Espejos retrovisores con carretera posterior
  drawMirror(-340, -190);
  drawMirror(275, -190);

  // Tablero Digital
  drawInstrumentDashboard(0, -100);

  ctx.restore();
}

function drawMirror(x, y) {
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + 35, y + 60);
  ctx.lineTo(x + 35, y + 20);
  ctx.stroke();

  ctx.fillStyle = '#171923';
  ctx.strokeStyle = '#a0aec0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, 75, 48, 8);
  ctx.fill();
  ctx.stroke();

  // Reflejo
  ctx.fillStyle = '#1a365d';
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, 67, 40, 6);
  ctx.fill();

  // Línea de asfalto en el espejo
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(x + 4, y + 24, 67, 20);
}

function drawInstrumentDashboard(x, y) {
  // Marco del tablero
  ctx.fillStyle = '#090b10';
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(x - 170, y - 95, 340, 130, 10);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 230, 180, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 164, y - 89, 328, 118);

  // Indicador de Marcha (Gear)
  ctx.fillStyle = simState.gear === 0 ? '#38a169' : '#00e6b4';
  ctx.font = '700 38px "Chakra Petch", monospace';
  ctx.textAlign = 'center';
  const gearText = simState.gear === 0 ? 'N' : simState.gear;
  ctx.fillText(gearText, x - 110, y - 30);
  ctx.font = '10px "Chakra Petch"';
  ctx.fillStyle = '#718096';
  ctx.fillText('GEAR', x - 110, y - 10);

  // Velocímetro Central
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 50px "Share Tech Mono", monospace';
  ctx.fillText(Math.round(simState.speed).toString().padStart(3, ' '), x, y - 28);
  ctx.font = '11px "Chakra Petch"';
  ctx.fillStyle = '#00e6b4';
  ctx.fillText('KM / H', x, y - 8);

  // Barra de Tacómetro RPM
  const rpmBarWidth = 280;
  const rpmRatio = Math.min(1, simState.rpm / simState.maxRpm);
  const fillWidth = rpmBarWidth * rpmRatio;

  ctx.fillStyle = '#171923';
  ctx.fillRect(x - 140, y + 8, rpmBarWidth, 10);

  const isRedline = simState.rpm >= simState.redlineRpm;
  ctx.fillStyle = isRedline ? '#e53e3e' : '#00e6b4';
  ctx.fillRect(x - 140, y + 8, fillWidth, 10);

  ctx.fillStyle = '#a0aec0';
  ctx.font = '8px monospace';
  for (let i = 1; i <= 10; i++) {
    ctx.fillText(i.toString(), (x - 140) + (i * 28), y + 28);
  }

  // Métricas: Combustible y Temperatura
  ctx.font = '11px "Share Tech Mono"';
  ctx.textAlign = 'left';

  ctx.fillStyle = simState.fuelLiters < 4 ? '#e53e3e' : '#cbd5e0';
  ctx.fillText(`FUEL: ${simState.fuelLiters.toFixed(1)} L`, x + 55, y - 55);

  ctx.fillStyle = simState.engineTemp > 105 ? '#e53e3e' : '#cbd5e0';
  ctx.fillText(`TEMP: ${Math.round(simState.engineTemp)}°C`, x + 55, y - 38);

  ctx.fillStyle = simState.headlights ? '#3182ce' : '#4a5568';
  ctx.fillText(`LIGHT: ${simState.headlights ? 'ON' : 'OFF'}`, x + 55, y - 21);
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
