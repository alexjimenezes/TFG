let currentPianoPlayer = null;

async function playMelody() {
    const note = document.getElementById('note').value;
    const repetitions = parseInt(document.getElementById('repetitions').value, 10);
    const duration = parseInt(document.getElementById('duration').value, 10);
    const silenceDuration = parseInt(document.getElementById('silenceDuration').value, 10);
    const accents = document.getElementById('accents').value.split(',').map(Number);

    console.log("Playing melody with note:", note, "repetitions:", repetitions, "duration:", duration, "silenceDuration:", silenceDuration, "accents:", accents);

    currentPianoPlayer = new PianoPlayer(note, repetitions, duration, silenceDuration, accents);
    await currentPianoPlayer.playNote();
}

function stopMelody() {
    if (currentPianoPlayer && currentPianoPlayer.audioContext) {
        currentPianoPlayer.audioContext.close();
        currentPianoPlayer = null;
        console.log("Melody stopped");
    }
}

function calculateTotalDuration() {
    const repetitions = parseInt(document.getElementById('repetitions').value, 10);
    const duration = parseInt(document.getElementById('duration').value, 10);
    const silenceDuration = parseInt(document.getElementById('silenceDuration').value, 10);
    return repetitions * (duration + silenceDuration);
}


class PianoPlayer {
    constructor(note, repetitions, duration, silenceDuration, accents) {
        // Initialize the AudioContext and class properties
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.note = note;
        this.repetitions = repetitions;
        this.duration = duration;
        this.silenceDuration = silenceDuration;
        this.accents = accents;
        this.notesMap = {
            'C': 261.63,
            'D': 293.66,
            'E': 329.63,
            'F': 349.23,
            'G': 392.00,
            'A': 440.00,
            'B': 493.88
        };
        // Adjusted envelope parameters for a more realistic sound
        this.attack = 0.05;
        this.decay = 0.2;
        this.release = 0.2;
        this.buffer = null;
        console.log("PianoPlayer initialized with note:", note);
    }

    generatePianoTone() {
        // Generate a piano-like waveform using additive synthesis
        const fundamental = this.notesMap[this.note];
        const sampleRate = this.audioContext.sampleRate;
        const bufferLength = Math.ceil(sampleRate * this.duration / 1000);
        const buffer = new Float32Array(bufferLength);
        const harmonics = 5; // Number of harmonics to simulate

        for (let t = 0; t < bufferLength; t++) {
            let amplitude = 0;

            // Sum up sinusoidal waveforms of harmonic frequencies
            for (let i = 1; i <= harmonics; i++) {
                const harmonicFreq = fundamental * i;
                amplitude += (1 / i) * Math.sin(2 * Math.PI * harmonicFreq * t / sampleRate);
            }

            buffer[t] = amplitude / harmonics; // Normalize the amplitude
        }

        console.log("Piano tone generated");
        return buffer;
    }

    async playNote() {
        // Ensure the piano tone buffer is generated before playback
        if (!this.buffer) {
            this.buffer = this.generatePianoTone();
        }

        let accentIndex = 0;

        for (let i = 0; i < this.repetitions; i++) {
            if (!this.audioContext) break; // Check if the audio context has been closed
            const source = this.audioContext.createBufferSource();
            const buffer = this.audioContext.createBuffer(1, this.buffer.length, this.audioContext.sampleRate);
            buffer.copyToChannel(this.buffer, 0);
            const gainNode = this.audioContext.createGain();
            source.buffer = buffer;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            const startTime = this.audioContext.currentTime + i * (this.duration + this.silenceDuration) / 1000;

            // Apply accentuation if specified
            const isAccented = this.accents && this.accents[accentIndex] === 1;
            const accentMultiplier = isAccented ? 1.8 : 1;

            // Set up gain envelope for the note
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(1 * accentMultiplier, startTime + this.attack);
            gainNode.gain.linearRampToValueAtTime(0.5 * accentMultiplier, startTime + this.attack + this.decay);
            const sustainTime = startTime + this.duration / 1000 - this.release;
            gainNode.gain.setValueAtTime(0.5 * accentMultiplier, sustainTime);
            gainNode.gain.linearRampToValueAtTime(0, sustainTime + this.release);
            source.start(startTime);
            source.stop(startTime + this.duration / 1000 + this.release); // Adjusted stop time

            // Move to the next accent index, wrapping around if necessary
            accentIndex = (accentIndex + 1) % this.accents.length;
        }

        console.log("Note played");
    }
}
