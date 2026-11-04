// Motor Principal del Juego: Moto, Carretera, Física y Bucle de Render
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos de la interfaz (DOM)
const hudDest = document.getElementById('hud-destination');
const hudDist = document.getElementById('hud-distance');
const hudFuel = document.getElementById('hud-fuel');
const hudHealth = document.getElementById('hud-health');
const hudMoney = document.getElementById('hud-money');
const hudSpeed = document.getElementById('hud-speed');
const fuelBar = document.getElementById('fuel-bar');
const healthBar = document.getElementById('health-bar');

const startScreen = document.getElementById('start-screen');
const adventureModal = document.getElementById('adventure-modal');
const gameoverModal = document.getElementById('gameover-modal');
const btnStart = document.getElementById('btn-start');
const btnRestart = document.getElementById('btn-restart');

// Estado global de la partida
const gameState = {
  active: false,
  paused: false,
  fuel: 100,
  health: 100,
  money: 120,
  speed: 0,
  maxSpeed: 140,
  accel: 0.6,
  decel: 0.35,
  targetDistanceKm: 10.0,
  currentBiome: 'desierto',
  isVictory: false
};

// Moto del jugador
const player = {
  x: canvas.width / 2,
  y: canvas.height - 110,
  width: 32,
  height: 64,
  leanAngle: 0, // Inclinación al doblar
  steerSpeed: 4.8
};

// Teclado
const keys = {
  left: false,
  right: false,
  up: false,
  down: false
};

// Objetos en la carretera (baches, piedras, bidones de combustible)
let roadObjects = [];
let particles = [];
let roadOffset = 0;

// Paletas de color por bioma
const biomes = {
  desierto: { ground: '#c29a67', grass: '#b08752', road: '#3b3d42', sky: '#f9d29d' },
  montaña:  { ground: '#5b6b63', grass: '#48564f', road: '#2b2d30', sky: '#87a8b8' },
  bosque:   { ground: '#2d4a22', grass: '#233d1a', road: '#323438', sky: '#d18b62' },
  costa:    { ground: '#eedca5', grass: '#22577a', road: '#2f3136', sky: '#57cc99' }
};

// Iniciar eventos de teclado
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = true;
  if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = true;
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = true;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = true;
  if (['Space', 'KeyH'].includes(e.code)) {
    if (gameState.active && !gameState.paused) window.soundEngine.playHorn();
  }
});

window.addEventListener('keyup', (e) => {
  if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = false;
  if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = false;
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
});

// Botones de inicio y reinicio
btnStart.addEventListener('click', () => {
  startScreen.classList.remove('active');
  window.soundEngine.startEngine();
  startJourney();
});

btnRestart.addEventListener('click', () => {
  location.reload();
});

function startJourney() {
  gameState.active = true;
  gameState.paused = false;
  const target = window.AdventureSystem.getCurrentTarget();
  gameState.targetDistanceKm = target.distance;
  gameState.currentBiome = target.biome;
  updateHUD();
  requestAnimationFrame(gameLoop);
}

// Bucle principal
let lastTime = performance.now();

function gameLoop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (gameState.active && !gameState.paused) {
    update(dt);
  }

  render();

  if (gameState.active) {
    requestAnimationFrame(gameLoop);
  }
}

// Actualización de física y lógica
function update(dt) {
  // Aceleración y frenado
  if (keys.up) {
    gameState.speed = Math.min(gameState.maxSpeed, gameState.speed + gameState.accel);
  } else if (keys.down) {
    gameState.speed = Math.max(0, gameState.speed - gameState.decel * 2.5);
  } else {
    gameState.speed = Math.max(0, gameState.speed - gameState.decel);
  }

  // Giro e inclinación
  if (keys.left) {
    player.x -= player.steerSpeed * (gameState.speed > 20 ? 1 : 0.6);
    player.leanAngle = Math.max(-0.35, player.leanAngle - 0.05);
  } else if (keys.right) {
    player.x += player.steerSpeed * (gameState.speed > 20 ? 1 : 0.6);
    player.leanAngle = Math.min(0.35, player.leanAngle + 0.05);
  } else {
    player.leanAngle *= 0.8; // Retorno suave al centro
  }

  // Límites de la calzada
  const roadLeft = 250;
  const roadRight = 650;
  if (player.x < roadLeft) {
    player.x = roadLeft;
    gameState.speed = Math.max(20, gameState.speed - 1); // Frena al tocar banquina
  }
  if (player.x > roadRight) {
    player.x = roadRight;
    gameState.speed = Math.max(20, gameState.speed - 1);
  }

  // Consumo de combustible proporcional a velocidad
  if (gameState.speed > 0) {
    gameState.fuel -= (0.012 + (gameState.speed / gameState.maxSpeed) * 0.02) * dt * 25;
    if (gameState.fuel <= 0) {
      gameState.fuel = 0;
      gameOver("Sin combustible", "Tu moto tosió un par de veces y se detuvo en el silencio de la carretera.");
      return;
    }
  }

  // Audio motor
  window.soundEngine.updateEngine(gameState.speed, gameState.maxSpeed);

  // Progreso del viaje hacia la parada
  if (gameState.speed > 0) {
    const kmCovered = (gameState.speed / 3600) * dt * 20; // Escala acelerada para jugabilidad
    gameState.targetDistanceKm = Math.max(0, gameState.targetDistanceKm - kmCovered);

    // Movimiento del asfalto
    roadOffset = (roadOffset + gameState.speed * 0.25) % 80;

    // Partículas de humo del escape
    if (Math.random() < 0.4) {
      particles.push({
        x: player.x,
        y: player.y + 35,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2 + Math.random() * 2,
        size: 3 + Math.random() * 4,
        alpha: 0.6
      });
    }

    // Llegada a destino
    if (gameState.targetDistanceKm <= 0) {
      reachWaypoint();
      return;
    }
  }

  // Actualizar partículas
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.025;
    p.size += 0.2;
    if (p.alpha <= 0) particles.splice(i, 1);
  }

  // Generar obstáculos o bidones
  if (Math.random() < 0.025 && roadObjects.length < 5 && gameState.speed > 30) {
    const types = ['pothole', 'rock', 'fuel'];
    const type = types[Math.floor(Math.random() * types.length)];
    roadObjects.push({
      x: roadLeft + 30 + Math.random() * (roadRight - roadLeft - 60),
      y: -40,
      type: type,
      size: type === 'pothole' ? 34 : 26
    });
  }

  // Mover y colisionar objetos
  for (let i = roadObjects.length - 1; i >= 0; i--) {
    const obj = roadObjects[i];
    obj.y += (gameState.speed * 0.22) + 2;

    // Colisión con la moto
    const dist = Math.hypot(player.x - obj.x, player.y - obj.y);
    if (dist < (player.width / 2 + obj.size / 2)) {
      if (obj.type === 'fuel') {
        gameState.fuel = Math.min(100, gameState.fuel + 20);
        window.soundEngine.playPickup();
      } else {
        // Choque con bache o piedra
        gameState.health = Math.max(0, gameState.health - 15);
        gameState.speed = Math.max(15, gameState.speed - 35);
        window.soundEngine.playHit();

        if (gameState.health <= 0) {
          gameOver("Moto averiada", "El impacto con un obstáculo destrozó la suspensión delantera.");
          return;
        }
      }
      roadObjects.splice(i, 1);
      continue;
    }

    if (obj.y > canvas.height + 50) {
      roadObjects.splice(i, 1);
    }
  }

  updateHUD();
}

// Renderizado gráfico
function render() {
  const currentColors = biomes[gameState.currentBiome] || biomes.desierto;

  // Fondo / Paisaje
  ctx.fillStyle = currentColors.sky;
  ctx.fillRect(0, 0, canvas.width, 180);

  // Siluetas de fondo (montañas o colinas)
  drawHorizon(currentColors);

  // Terreno a los lados de la calzada
  ctx.fillStyle = currentColors.ground;
  ctx.fillRect(0, 180, canvas.width, canvas.height - 180);

  // Carretera (Perspectiva)
  ctx.beginPath();
  ctx.moveTo(350, 180);
  ctx.lineTo(550, 180);
  ctx.lineTo(720, canvas.height);
  ctx.lineTo(180, canvas.height);
  ctx.closePath();
  ctx.fillStyle = currentColors.road;
  ctx.fill();

  // Líneas de banquina laterales
  ctx.strokeStyle = '#f6ad55';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(350, 180); ctx.lineTo(180, canvas.height);
  ctx.moveTo(550, 180); ctx.lineTo(720, canvas.height);
  ctx.stroke();

  // Línea discontinua central con scroll
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.setLineDash([30, 30]);
  ctx.lineDashOffset = -roadOffset;
  ctx.beginPath();
  ctx.moveTo(450, 180);
  ctx.lineTo(450, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]); // Reset

  // Dibujar obstáculos y bidones
  roadObjects.forEach(obj => {
    if (obj.type === 'fuel') {
      ctx.fillStyle = '#e53e3e';
      ctx.fillRect(obj.x - 10, obj.y - 12, 20, 24);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Chakra Petch';
      ctx.fillText('⛽', obj.x - 7, obj.y + 4);
    } else if (obj.type === 'pothole') {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(obj.x, obj.y, 18, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#718096';
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Partículas de humo
  particles.forEach(p => {
    ctx.fillStyle = `rgba(180, 180, 190, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // Dibujar moto del jugador
  drawMotorcycle(player.x, player.y, player.leanAngle);
}

// Dibujo estilizado de la moto vista trasera/cenital
function drawMotorcycle(x, y, lean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);

  // Sombra
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 20, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neumático trasero
  ctx.fillStyle = '#111';
  ctx.fillRect(-6, 8, 12, 22);

  // Chasis y guardabarros
  ctx.fillStyle = '#e28743';
  ctx.beginPath();
  ctx.roundRect(-10, -18, 20, 32, 6);
  ctx.fill();

  // Asiento
  ctx.fillStyle = '#222';
  ctx.fillRect(-7, -8, 14, 18);

  // Piloto (espalda y casco)
  ctx.fillStyle = '#2b6cb0'; // Chaqueta azul
  ctx.beginPath();
  ctx.roundRect(-12, -26, 24, 20, 5);
  ctx.fill();

  // Casco
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -32, 11, 0, Math.PI * 2);
  ctx.fill();
  // Visor negro
  ctx.fillStyle = '#111';
  ctx.fillRect(-7, -37, 14, 5);

  // Manillar / Espejos
  ctx.strokeStyle = '#cbd5e0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-22, -26);
  ctx.lineTo(22, -26);
  ctx.stroke();

  // Luz trasera roja
  ctx.fillStyle = '#ff2222';
  ctx.shadowColor = '#ff2222';
  ctx.shadowBlur = 8;
  ctx.fillRect(-5, 12, 10, 4);

  ctx.restore();
}

function drawHorizon(colors) {
  ctx.fillStyle = colors.grass;
  ctx.beginPath();
  ctx.moveTo(0, 180);
  ctx.lineTo(150, 120);
  ctx.lineTo(320, 180);
  ctx.lineTo(500, 130);
  ctx.lineTo(700, 180);
  ctx.lineTo(900, 140);
  ctx.lineTo(900, 180);
  ctx.closePath();
  ctx.fill();
}

function updateHUD() {
  const target = window.AdventureSystem.getCurrentTarget();
  if (target) {
    hudDest.textContent = target.name;
  }
  hudDist.textContent = gameState.targetDistanceKm.toFixed(1) + " km";
  hudSpeed.textContent = Math.round(gameState.speed) + " km/h";
  hudFuel.textContent = Math.round(gameState.fuel) + "%";
  hudHealth.textContent = Math.round(gameState.health) + "%";
  hudMoney.textContent = "$" + gameState.money;

  fuelBar.style.width = gameState.fuel + "%";
  healthBar.style.width = gameState.health + "%";
}

// Parada de aventura / Diálogo
function reachWaypoint() {
  gameState.paused = true;
  gameState.speed = 0;
  window.soundEngine.stopEngine();

  const current = window.AdventureSystem.getCurrentTarget();
  const modalTitle = document.getElementById('event-title');
  const modalIcon = document.getElementById('event-icon');
  const modalDesc = document.getElementById('event-description');
  const choicesContainer = document.getElementById('event-choices');

  modalTitle.textContent = current.title;
  modalIcon.textContent = current.icon;
  modalDesc.textContent = current.description;
  choicesContainer.innerHTML = '';

  current.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = choice.text;
    btn.appendChild(textSpan);

    if (choice.cost > 0) {
      const costSpan = document.createElement('span');
      costSpan.className = 'choice-cost';
      costSpan.textContent = `-$${choice.cost}`;
      btn.appendChild(costSpan);
      if (gameState.money < choice.cost) {
        btn.disabled = true;
      }
    }

    btn.addEventListener('click', () => {
      if (choice.cost > 0) gameState.money -= choice.cost;
      if (choice.effect) {
        const resultMsg = choice.effect(gameState);
        modalDesc.textContent = resultMsg;
      }

      if (choice.isNext) {
        const nextTarget = window.AdventureSystem.advanceLocation();
        if (nextTarget) {
          adventureModal.classList.remove('active');
          gameState.paused = false;
          gameState.targetDistanceKm = nextTarget.distance;
          gameState.currentBiome = nextTarget.biome;
          roadObjects = [];
          window.soundEngine.startEngine();
        } else {
          // Victoria final
          gameOver("¡Travesía Completada!", "Has recorrido todo el mapa y llegado a tu destino soñado.");
        }
      }
      updateHUD();
    });

    choicesContainer.appendChild(btn);
  });

  adventureModal.classList.add('active');
}

function gameOver(title, reason) {
  gameState.active = false;
  window.soundEngine.stopEngine();
  document.getElementById('gameover-title').textContent = title;
  document.getElementById('gameover-desc').textContent = reason;
  gameoverModal.classList.add('active');
}
