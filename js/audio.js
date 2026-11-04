// Sintetizador de Audio Avanzado para Moto (Web Audio API)
class MotoSimulatorAudio {
  constructor() {
    this.ctx = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windNoise = null;
    this.windGain = null;
    this.isPlaying = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  start() {
    this.init();
    if (this.isPlaying) return;

    try {
      // 1. Oscilador primario (cilindro / pistón)
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.setValueAtTime(35, this.ctx.currentTime);

      // 2. Oscilador armónico (escape resonante)
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.setValueAtTime(70, this.ctx.currentTime);

      // Filtro paso bajo para timbre metálico de escape
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(320, this.ctx.currentTime);

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.06, this.ctx.currentTime);

      this.engineOsc1.connect(this.filter);
      this.engineOsc2.connect(this.filter);
      this.filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc1.start();
      this.engineOsc2.start();

      // 3. Ruido de viento aerodinámico a velocidad
      this.setupWindAudio();

      this.isPlaying = true;
    } catch (e) {
      console.warn("Audio no iniciado:", e);
    }
  }

  setupWindAudio() {
    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1; // Ruido blanco
      }

      this.windNoise = this.ctx.createBufferSource();
      this.windNoise.buffer = buffer;
      this.windNoise.loop = true;

      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(450, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

      this.windNoise.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);

      this.windNoise.start();
    } catch (e) {}
  }

  update(rpm, maxRpm, speed, maxSpeed) {
    if (!this.isPlaying || !this.ctx) return;

    // Frecuencia basada en RPM reales (de 1.100 a 10.000 RPM)
    const rpmRatio = Math.max(0, Math.min(1, rpm / maxRpm));
    const baseFreq = 30 + (rpmRatio * 180);

    this.engineOsc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.05);

    // Ajustar apertura de filtro de escape con aceleración
    this.filter.frequency.setTargetAtTime(250 + (rpmRatio * 900), this.ctx.currentTime, 0.05);

    // Viento por velocidad
    if (this.windGain) {
      const speedRatio = Math.min(1, speed / maxSpeed);
      this.windGain.gain.setTargetAtTime(speedRatio * 0.08, this.ctx.currentTime, 0.1);
    }
  }

  // Sonido de cambio de marcha (clunk mecánico de transmisión)
  playGearShift() {
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {}
  }

  // Chirrido de frenada fuerte
  playTireScreech() {
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1800, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1200, this.ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch (e) {}
  }

  playHorn() {
    this.init();
    try {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(410, this.ctx.currentTime);
      osc2.frequency.setValueAtTime(480, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(this.ctx.currentTime + 0.3);
      osc2.stop(this.ctx.currentTime + 0.3);
    } catch (e) {}
  }

  stop() {
    if (!this.isPlaying) return;
    try {
      if (this.engineOsc1) this.engineOsc1.stop();
      if (this.engineOsc2) this.engineOsc2.stop();
      if (this.windNoise) this.windNoise.stop();
      this.isPlaying = false;
    } catch (e) {}
  }
}

window.soundEngine = new MotoSimulatorAudio();
