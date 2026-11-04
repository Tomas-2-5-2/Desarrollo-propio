// Sintetizador de Audio de Alta Fidelidad para Moto (Web Audio API)
class MotoSimulatorAudio {
  constructor() {
    this.ctx = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.filter = null;
    this.windNoise = null;
    this.windGain = null;
    this.rumbleOsc = null;
    this.rumbleGain = null;
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
      // 1. Oscilador de combustión principal (pulso de motor bicilíndrico 650cc)
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.setValueAtTime(30, this.ctx.currentTime);

      // 2. Oscilador armónico (resonancia del escape de acero inoxidable)
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.setValueAtTime(60, this.ctx.currentTime);

      // Filtro dinámico de escape
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(280, this.ctx.currentTime);
      this.filter.Q.setValueAtTime(2.2, this.ctx.currentTime);

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.075, this.ctx.currentTime);

      this.engineOsc1.connect(this.filter);
      this.engineOsc2.connect(this.filter);
      this.filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc1.start();
      this.engineOsc2.start();

      // 3. Silbido aerodinámico del viento en el casco
      this.setupWindAudio();

      // 4. Vibración de banquina rugosa
      this.setupRumbleAudio();

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
        data[i] = Math.random() * 2 - 1;
      }

      this.windNoise = this.ctx.createBufferSource();
      this.windNoise.buffer = buffer;
      this.windNoise.loop = true;

      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(550, this.ctx.currentTime);
      windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

      this.windNoise.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);

      this.windNoise.start();
    } catch (e) {}
  }

  setupRumbleAudio() {
    try {
      this.rumbleOsc = this.ctx.createOscillator();
      this.rumbleOsc.type = 'square';
      this.rumbleOsc.frequency.setValueAtTime(40, this.ctx.currentTime);

      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(140, this.ctx.currentTime);

      this.rumbleGain = this.ctx.createGain();
      this.rumbleGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.rumbleOsc.connect(f);
      f.connect(this.rumbleGain);
      this.rumbleGain.connect(this.ctx.destination);

      this.rumbleOsc.start();
    } catch (e) {}
  }

  update(rpm, maxRpm, speed, maxSpeed, onRumble) {
    if (!this.isPlaying || !this.ctx) return;

    // Frecuencia modulada por RPM exactas
    const rpmRatio = Math.max(0, Math.min(1, rpm / maxRpm));
    const baseFreq = 26 + (rpmRatio * 185);

    this.engineOsc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.035);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.035);

    // Apertura del escape con la aceleración
    this.filter.frequency.setTargetAtTime(260 + (rpmRatio * 1100), this.ctx.currentTime, 0.035);

    // Viento por velocidad
    if (this.windGain) {
      const speedRatio = Math.min(1, speed / maxSpeed);
      this.windGain.gain.setTargetAtTime(speedRatio * 0.12, this.ctx.currentTime, 0.08);
    }

    // Banquina rugosa
    if (this.rumbleGain) {
      const targetGain = (onRumble && speed > 15) ? 0.09 : 0.0;
      this.rumbleGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
      if (onRumble) {
        this.rumbleOsc.frequency.setTargetAtTime(32 + speed * 0.6, this.ctx.currentTime, 0.04);
      }
    }
  }

  playGearShift() {
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(25, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.24, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {}
  }

  playTireScreech() {
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1700, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(800, this.ctx.currentTime + 0.22);

      gain.gain.setValueAtTime(0.065, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.22);
    } catch (e) {}
  }

  playPassWhoosh() {
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(75, this.ctx.currentTime + 0.38);

      gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.14, this.ctx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.38);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.38);
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
      osc1.frequency.setValueAtTime(420, this.ctx.currentTime);
      osc2.frequency.setValueAtTime(490, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.14, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(this.ctx.currentTime + 0.35);
      osc2.stop(this.ctx.currentTime + 0.35);
    } catch (e) {}
  }

  stop() {
    if (!this.isPlaying) return;
    try {
      if (this.engineOsc1) this.engineOsc1.stop();
      if (this.engineOsc2) this.engineOsc2.stop();
      if (this.windNoise) this.windNoise.stop();
      if (this.rumbleOsc) this.rumbleOsc.stop();
      this.isPlaying = false;
    } catch (e) {}
  }
}

window.soundEngine = new MotoSimulatorAudio();
