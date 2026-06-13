// Web Audio API Retro Synth Sound Effects Generator
// Ensures zero dependencies and dynamic synth-based gaming audio.

class RetroAudio {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Web Audio API not supported:", e);
        }
    }

    resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    playClick() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    playSlash() {
        if (this.muted || !this.ctx) return;
        this.resume();

        // White noise slash sound
        const bufferSize = this.ctx.sampleRate * 0.15; // 0.15 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.15);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
        noise.stop(this.ctx.currentTime + 0.15);
    }

    playHit() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playCrit() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const now = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);

        osc2.type = 'square';
        osc2.frequency.setValueAtTime(783.99, now); // G5
        osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.15);

        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(now + 0.2);
        osc2.stop(now + 0.2);
    }

    playLevelUp() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6
        const noteDuration = 0.08;

        notes.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0, now + index * noteDuration);
            gain.gain.linearRampToValueAtTime(0.06, now + index * noteDuration + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + index * noteDuration + 0.15);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + index * noteDuration);
            osc.stop(now + index * noteDuration + 0.2);
        });
    }

    playLootDrop(rarity) {
        if (this.muted || !this.ctx) return;
        this.resume();

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';

        let duration = 0.2;
        let volume = 0.05;

        switch (rarity) {
            case 'legendary':
                // Celestial bright chime
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(659.25, now); // E5
                osc.frequency.setValueAtTime(987.77, now + 0.08); // B5
                osc.frequency.setValueAtTime(1318.51, now + 0.16); // E6
                duration = 0.4;
                volume = 0.08;
                break;
            case 'ethereal':
                // Futuristic sweeping sound
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(2000, now + 0.3);
                duration = 0.35;
                volume = 0.08;
                break;
            case 'epic':
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(783.99, now + 0.1); // G5
                duration = 0.3;
                volume = 0.06;
                break;
            case 'rare':
                osc.frequency.setValueAtTime(392.00, now); // G4
                osc.frequency.setValueAtTime(587.33, now + 0.08); // D5
                duration = 0.25;
                volume = 0.05;
                break;
            case 'uncommon':
                osc.frequency.setValueAtTime(329.63, now); // E4
                osc.frequency.setValueAtTime(440.00, now + 0.08); // A4
                duration = 0.2;
                volume = 0.04;
                break;
            default: // common
                osc.frequency.setValueAtTime(261.63, now); // C4
                osc.frequency.exponentialRampToValueAtTime(196, now + 0.12);
                duration = 0.15;
                volume = 0.03;
                break;
        }

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.start();
        osc.stop(now + duration);
    }

    playTranscend() {
        if (this.muted || !this.ctx) return;
        this.resume();

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 1.2);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, now);
        filter.frequency.exponentialRampToValueAtTime(4000, now + 1.2);
        filter.Q.value = 8;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(now + 1.5);
    }
}

window.gameAudio = new RetroAudio();
