// Motor de Simulación en Primera Persona: Física de Marchas, RPM, Tablero e Inclinación
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
  rpm: 1200, // RPM ralentí
  idleRpm: 1200,
  maxRpm: 10000,
  redlineRpm: 8500,
  speed: 0, // km/h
  maxSpeed: 195,
  
  // Mecánica
  fuelLiters: 18.0,
  maxFuelLiters: 18.0,
  engineTemp: 82.0, // °C
  tirePressure: 32.0, // PSI
  bikeHealth: 100,
  money: 180,
  headlights: true,
  
  // Dinámica de conducción
  leanAngle: 0, // Inclinación en curvas
  roadPosition: 0, // -1 (banquina izq) a +1 (banquina der)
  roadCurve: 0,
  targetDistanceKm: 12.0,
  odometer: 0, // km totales
  
  // Ratios de marchas (velocidad máxima recomendada por marcha)
  gearLimits: [0, 48, 80, 115, 145, 175, 205],
  gearMinSpeed: [0, 0, 20, 40, 65, 88, 110]
};

// Tráfico en la ruta (camiones y autos de frente o en el mismo sentido)
let traffic = [];
let roadsideMarkers = [];

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

  // Cambio de marcha
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
    // Caída momentánea de RPM por salto de marcha más larga
    simState.rpm = Math.max(simState.idleRpm, simState.rpm * 0.72);
  }
}

function shiftDown() {
  if (!simState.active || simState.paused) return;
  if (simState.gear > 0) {
    simState.gear--;
    window.soundEngine.playGearShift();
    // Subida de RPM por freno motor al reducir
    if (simState.gear > 0) {
      simState.rpm = Math.min(simState.maxRpm, simState.rpm * 1.35);
    }
  }
}

// Iniciar el simulador
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

// Bucle principal de simulación
let lastTimestamp = performance.now();

function simLoop(now) {
  const dt = Math.min(0.1, (now - lastTimestamp) / 1000);
  lastTimestamp = now;

  if (simState.active && !simState.paused) {
    updatePhysics(dt);
  }

  renderCockpit();

  if (simState.active) {
    requestAnimationFrame(simLoop);
  }
}

// Física avanzada del motor y la moto
function updatePhysics(dt) {
  const currentGear = simState.gear;
  const maxGearSpeed = simState.gearLimits[currentGear];
  const minGearSpeed = simState.gearMinSpeed[currentGear];

  // 1. Acelerador y Potencia
  if (keys.throttle) {
    if (currentGear === 0) {
      // Neutro: El motor se revoluciona en vacío
      simState.rpm = Math.min(simState.maxRpm, simState.rpm + 6000 * dt);
    } else {
      // Marcha engranada
      const idealRpm = (simState.rpm >= 3500 && simState.rpm <= 7500);
      const accelFactor = idealRpm ? 1.2 : 0.75;
      
      // Si la velocidad es demasiado baja para la marcha alta (el motor se ahoga)
      if (simState.speed < minGearSpeed - 15) {
        simState.speed = Math.max(0, simState.speed + 4 * dt);
      } else {
        const topRatio = Math.max(0, 1 - (simState.speed / maxGearSpeed));
        simState.speed = Math.min(simState.maxSpeed, simState.speed + (24 * accelFactor * topRatio) * dt);
      }

      // Calcular RPM según velocidad en la marcha actual
      const gearRatio = simState.speed / maxGearSpeed;
      simState.rpm = simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm));

      // Consumo de nafta por aceleración
      simState.fuelLiters = Math.max(0, simState.fuelLiters - (0.008 + (simState.rpm / simState.maxRpm) * 0.02) * dt);
    }
  } else {
    // Desaceleración / Freno motor
    if (currentGear === 0) {
      simState.rpm = Math.max(simState.idleRpm, simState.rpm - 4000 * dt);
      simState.speed = Math.max(0, simState.speed - 8 * dt);
    } else {
      // El freno motor retiene la moto
      const engineBraking = 10 + (currentGear === 1 ? 16 : 8);
      simState.speed = Math.max(0, simState.speed - engineBraking * dt);
      
      const gearRatio = simState.speed / maxGearSpeed;
      simState.rpm = Math.max(simState.idleRpm, simState.idleRpm + (gearRatio * (simState.redlineRpm - simState.idleRpm)));
    }
  }

  // 2. Freno combinado (delantero y trasero)
  if (keys.brake) {
    simState.speed = Math.max(0, simState.speed - 48 * dt);
    if (simState.speed > 50 && Math.random() < 0.05) {
      window.soundEngine.playTireScreech();
    }
  }

  // 3. Dirección e inclinación del manillar (Counter-steering)
  if (keys.steerLeft) {
    simState.roadPosition = Math.max(-0.85, simState.roadPosition - (1.1 * dt));
    simState.leanAngle = Math.max(-0.28, simState.leanAngle - 0.9 * dt);
  } else if (keys.steerRight) {
    simState.roadPosition = Math.min(0.85, simState.roadPosition + (1.1 * dt));
    simState.leanAngle = Math.min(0.28, simState.leanAngle + 0.9 * dt);
  } else {
    // Retorno centrífugo natural
    simState.leanAngle *= 0.88;
  }

  // 4. Curvas dinámicas de la carretera
  simState.roadCurve = Math.sin(performance.now() * 0.0006) * 0.7;
  // Fuerza centrífuga que empuja al piloto hacia afuera en curvas
  simState.roadPosition += (simState.roadCurve * (simState.speed / simState.maxSpeed) * 0.35) * dt;

  // 5. Temperatura de motor
  if (simState.rpm > simState.redlineRpm) {
    simState.engineTemp = Math.min(130, simState.engineTemp + 4 * dt);
  } else {
    // El viento refrigera el radiador
    const cooling = (simState.speed / 100) * 1.5;
    simState.engineTemp = Math.max(78, simState.engineTemp + (0.5 - cooling) * dt);
  }

  // 6. Audio
  window.soundEngine.update(simState.rpm, simState.maxRpm, simState.speed, simState.maxSpeed);

  // 7. Quedarse sin combustible o fundir motor
  if (simState.fuelLiters <= 0) {
    simState.fuelLiters = 0;
    triggerBreakdown("Tanque Vacío", "Te quedaste sin combustible en medio de la nada.");
    return;
  }
  if (simState.engineTemp >= 125) {
    triggerBreakdown("Motor Sobrecalentado", "Las altas RPM sin refrigeración fundieron la junta de culata.");
    return;
  }

  // 8. Distancia recorrida y progreso al Waypoint
  if (simState.speed > 0) {
    const kmCovered = (simState.speed / 3600) * dt * 18; // Escala ágil
    simState.targetDistanceKm = Math.max(0, simState.targetDistanceKm - kmCovered);
    simState.odometer += kmCovered;

    if (simState.targetDistanceKm <= 0) {
      arriveAtWaypoint();
    }
  }

  updateGps();
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

// RENDERIZADO EN PRIMERA PERSONA (VISTA DEL PILOTO)
function renderCockpit() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Afectar la vista con la inclinación del piloto
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-simState.leanAngle * 0.45); // El horizonte se inclina suavemente
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  // 1. Cielo y Montañas de fondo (Parallax)
  drawEnvironment();

  // 2. Carretera en perspectiva 3D
  drawRoad3D();

  ctx.restore();

  // 3. Foco de luz delantera (de noche)
  if (simState.headlights) {
    drawHeadlightBeam();
  }

  // 4. Manillar, Espejos y Tablero Digital (Cockpit Fijo del Piloto)
  drawMotorcycleCockpit();
}

function drawEnvironment() {
  const horizonY = 240;

  // Cielo
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, '#152238');
  skyGrad.addColorStop(1, '#6b7a90');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-100, -100, canvas.width + 200, horizonY + 100);

  // Montañas lejanas
  ctx.fillStyle = '#2d3748';
  ctx.beginPath();
  ctx.moveTo(-100, horizonY);
  ctx.lineTo(80, 160);
  ctx.lineTo(240, horizonY);
  ctx.lineTo(420, 140);
  ctx.lineTo(600, horizonY);
  ctx.lineTo(800, 150);
  ctx.lineTo(canvas.width + 100, horizonY);
  ctx.closePath();
  ctx.fill();

  // Terreno a los lados de la ruta
  ctx.fillStyle = '#3c352a';
  ctx.fillRect(-100, horizonY, canvas.width + 200, canvas.height);
}

function drawRoad3D() {
  const horizonY = 240;
  const centerX = (canvas.width / 2) - (simState.roadPosition * 300) + (simState.roadCurve * 120);

  // Asfalto
  ctx.fillStyle = '#222428';
  ctx.beginPath();
  ctx.moveTo(centerX - 30, horizonY);
  ctx.lineTo(centerX + 30, horizonY);
  ctx.lineTo((canvas.width / 2) + 520, canvas.height);
  ctx.lineTo((canvas.width / 2) - 520, canvas.height);
  ctx.closePath();
  ctx.fill();

  // Líneas blancas laterales
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX - 30, horizonY);
  ctx.lineTo((canvas.width / 2) - 480, canvas.height);
  ctx.moveTo(centerX + 30, horizonY);
  ctx.lineTo((canvas.width / 2) + 480, canvas.height);
  ctx.stroke();

  // Línea amarilla divisoria central discontinua
  const dashOffset = (performance.now() * (simState.speed * 0.05)) % 60;
  ctx.strokeStyle = '#f6ad55';
  ctx.lineWidth = 5;
  ctx.setLineDash([35, 25]);
  ctx.lineDashOffset = -dashOffset;
  ctx.beginPath();
  ctx.moveTo(centerX, horizonY);
  ctx.lineTo(canvas.width / 2 - (simState.roadPosition * 120), canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHeadlightBeam() {
  const cone = ctx.createRadialGradient(canvas.width / 2, canvas.height - 80, 50, canvas.width / 2, 280, 420);
  cone.addColorStop(0, 'rgba(255, 255, 220, 0.25)');
  cone.addColorStop(1, 'rgba(255, 255, 220, 0)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 80, canvas.height - 80);
  ctx.lineTo(canvas.width / 2 - 320, 240);
  ctx.lineTo(canvas.width / 2 + 320, 240);
  ctx.lineTo(canvas.width / 2 + 80, canvas.height - 80);
  ctx.closePath();
  ctx.fill();
}

// DIBUJO DEL MANILLAR, TABLERO Y ESPEJOS
function drawMotorcycleCockpit() {
  const tilt = simState.leanAngle * 18;
  const cx = canvas.width / 2;
  const cy = canvas.height;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(simState.leanAngle * 0.3); // El manillar gira con la inclinación

  // 1. Manillar negro de aleación
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(-320, -120);
  ctx.lineTo(-120, -70);
  ctx.lineTo(120, -70);
  ctx.lineTo(320, -120);
  ctx.stroke();

  // 2. Puños de goma y manetas de freno/embrague
  ctx.fillStyle = '#111';
  ctx.fillRect(-350, -135, 75, 30); // Puño izq
  ctx.fillRect(275, -135, 75, 30);  // Puño der

  // Maneta de embrague (izq) y freno delantero (der)
  ctx.strokeStyle = '#a0aec0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-310, -115); ctx.lineTo(-240, -100);
  ctx.moveTo(310, -115);  ctx.lineTo(240, -100);
  ctx.stroke();

  // 3. Espejos retrovisores
  drawMirror(-330, -190);
  drawMirror(280, -190);

  // 4. Tablero Digital Central (Instrument Cluster)
  drawInstrumentDashboard(0, -105);

  ctx.restore();
}

function drawMirror(x, y) {
  // Soporte
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + 25, y + 60);
  ctx.lineTo(x + 25, y + 20);
  ctx.stroke();

  // Carcasa del espejo
  ctx.fillStyle = '#1a202c';
  ctx.strokeStyle = '#718096';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, 70, 45, 8);
  ctx.fill();
  ctx.stroke();

  // Reflejo de la ruta trasera en el espejo
  ctx.fillStyle = '#1a365d';
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, 62, 37, 6);
  ctx.fill();
}

function drawInstrumentDashboard(x, y) {
  // Pantalla digital de fibra de carbono
  ctx.fillStyle = '#0a0d14';
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(x - 170, y - 95, 340, 130, 10);
  ctx.fill();
  ctx.stroke();

  // Bisel decorativo
  ctx.strokeStyle = 'rgba(0, 230, 180, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 164, y - 89, 328, 118);

  // A. Indicador de Marcha Enorme (Gear Display)
  ctx.fillStyle = simState.gear === 0 ? '#38a169' : '#00e6b4';
  ctx.font = '700 38px "Chakra Petch", monospace';
  ctx.textAlign = 'center';
  const gearText = simState.gear === 0 ? 'N' : simState.gear;
  ctx.fillText(gearText, x - 110, y - 30);
  ctx.font = '10px "Chakra Petch"';
  ctx.fillStyle = '#718096';
  ctx.fillText('GEAR', x - 110, y - 10);

  // B. Velocímetro Digital Central
  ctx.fillStyle = '#f7fafc';
  ctx.font = '700 48px "Share Tech Mono", monospace';
  ctx.fillText(Math.round(simState.speed).toString().padStart(3, ' '), x, y - 30);
  ctx.font = '11px "Chakra Petch"';
  ctx.fillStyle = '#00e6b4';
  ctx.fillText('KM / H', x, y - 10);

  // C. Barra de Tacómetro / Cuentarrevoluciones (RPM)
  const rpmBarWidth = 280;
  const rpmRatio = Math.min(1, simState.rpm / simState.maxRpm);
  const fillWidth = rpmBarWidth * rpmRatio;

  // Fondo barra
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(x - 140, y + 6, rpmBarWidth, 10);

  // Relleno RPM (Gradiente verde a rojo en zona crítica)
  const isRedline = simState.rpm >= simState.redlineRpm;
  ctx.fillStyle = isRedline ? '#e53e3e' : '#00e6b4';
  ctx.fillRect(x - 140, y + 6, fillWidth, 10);

  // Marcas de escala de RPM (1 a 10)
  ctx.fillStyle = '#a0aec0';
  ctx.font = '8px monospace';
  for (let i = 1; i <= 10; i++) {
    ctx.fillText(i.toString(), (x - 140) + (i * 28), y + 26);
  }

  // D. Métricas secundarias: Temperatura, Nafta y Odómetro
  ctx.font = '11px "Share Tech Mono"';
  ctx.textAlign = 'left';

  // Nafta
  ctx.fillStyle = simState.fuelLiters < 4 ? '#e53e3e' : '#cbd5e0';
  ctx.fillText(`FUEL: ${simState.fuelLiters.toFixed(1)} L`, x + 55, y - 55);

  // Temperatura
  ctx.fillStyle = simState.engineTemp > 105 ? '#e53e3e' : '#cbd5e0';
  ctx.fillText(`TEMP: ${Math.round(simState.engineTemp)}°C`, x + 55, y - 38);

  // Luces
  ctx.fillStyle = simState.headlights ? '#3182ce' : '#4a5568';
  ctx.fillText(`LIGHT: ${simState.headlights ? 'ON' : 'OFF'}`, x + 55, y - 21);
}

// Parada en punto de servicio / Taller
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
        // Refrescar números
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
