function createNoiseBuffer(context, seconds = 2) {
  const sampleRate = context.sampleRate;
  const length = sampleRate * seconds;
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

function makeOsc(context, type, freq, gainValue) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = freq;

  const gain = context.createGain();
  gain.gain.value = gainValue;

  oscillator.connect(gain);
  return { oscillator, gain };
}

export function createAmbientEngine() {
  let context = null;
  let master = null;
  let droneBus = null;
  let windBus = null;
  let metalBus = null;
  let started = false;
  let activeNoise = null;

  function ensureContext() {
    if (context) return context;
    context = new (window.AudioContext || window.webkitAudioContext)();

    master = context.createGain();
    master.gain.value = 0.0;
    master.connect(context.destination);

    droneBus = context.createGain();
    windBus = context.createGain();
    metalBus = context.createGain();

    droneBus.connect(master);
    windBus.connect(master);
    metalBus.connect(master);

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 120;
    lowpass.Q.value = 0.7;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 1200;

    const bandpass = context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 420;
    bandpass.Q.value = 6.0;

    droneBus.connect(lowpass);
    windBus.connect(highpass);
    metalBus.connect(bandpass);

    lowpass.connect(master);
    highpass.connect(master);
    bandpass.connect(master);

    const droneA = makeOsc(context, 'sine', 36, 0.18);
    const droneB = makeOsc(context, 'triangle', 49, 0.12);
    const droneC = makeOsc(context, 'sine', 73, 0.05);
    droneA.oscillator.connect(droneBus);
    droneB.oscillator.connect(droneBus);
    droneC.oscillator.connect(droneBus);

    const pulse = makeOsc(context, 'sine', 0.18, 0.0);
    pulse.oscillator.connect(context.createGain());

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(context, 3);
    noiseSource.loop = true;

    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 2800;
    windFilter.Q.value = 0.75;

    const windGain = context.createGain();
    windGain.gain.value = 0.18;
    noiseSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(windBus);
    noiseSource.start();
    activeNoise = { noiseSource, windFilter, windGain };

    const pulseOsc = context.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = 0.21;
    const pulseGain = context.createGain();
    pulseGain.gain.value = 0.0;
    pulseOsc.connect(pulseGain);
    pulseGain.connect(master);
    pulseOsc.start();

    droneA.oscillator.start();
    droneB.oscillator.start();
    droneC.oscillator.start();

    return context;
  }

  async function start() {
    const ctx = ensureContext();
    if (ctx.state !== 'running') {
      await ctx.resume();
    }
    if (!started) {
      started = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.65, ctx.currentTime, 0.8);
    }
  }

  function setIntensity(level, turbulence) {
    if (!context || !master) return;
    const now = context.currentTime;
    master.gain.setTargetAtTime(0.35 + level * 0.35, now, 0.2);

    if (activeNoise) {
      activeNoise.windGain.gain.setTargetAtTime(0.09 + turbulence * 0.18, now, 0.15);
      activeNoise.windFilter.frequency.setTargetAtTime(1800 + level * 1400, now, 0.12);
    }
  }

  function triggerWord(semantic) {
    if (!context) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    osc.type = semantic.category === 'resonance' ? 'triangle' : 'sine';
    osc.frequency.value = 150 + semantic.energy * 260 + Math.random() * 80;

    const gain = context.createGain();
    gain.gain.value = 0.0;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 380 + semantic.energy * 480;
    filter.Q.value = 4.5 + semantic.energy * 5;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(metalBus || master);

    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.18 + semantic.energy * 0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2 + semantic.energy * 0.8);

    osc.start(now);
    osc.stop(now + 1.8 + semantic.energy);
  }

  function stop() {
    if (!context) return;
    if (activeNoise) {
      activeNoise.noiseSource.stop();
    }
  }

  return {
    start,
    setIntensity,
    triggerWord,
    stop,
    get context() {
      return context;
    }
  };
}