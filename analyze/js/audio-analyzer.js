class AudioProcessor {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.fftWindowSize = parseInt(document.getElementById('fft-window-size').value);
        this.hopSize = this.fftWindowSize / 2; // 50% overlap
        this.frequencyDbPieces = [];
        this.frequencyPiecesCount = 0;
        this.frequencyPiecesMaxCount = 1;
        this.frequencyDb = new Float32Array(this.fftWindowSize / 2);
        this.frequencies = new Float32Array(this.fftWindowSize / 2);
        this.stdMultiplier = parseFloat(document.getElementById('std-multiplier').value);
        this.binMatchPercentTolerance = 100 - parseFloat(document.getElementById('matching-bins').value);
        this.binMatchDBTolerance = parseFloat(document.getElementById('db-tolerance').value);
    }

    // Apply Hamming window function to reduce spectral leakage
    applyWindowFunction(buffer) {
        const length = buffer.length;
        for (let i = 0; i < length; i++) {
            buffer[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (length - 1));
        }
        return buffer;
    }

    calculateMeanAndStd(dataArray) {
        const filteredArray = dataArray.filter(a => a > -Infinity);
        const mean = filteredArray.reduce((a, b) => a + b, 0) / filteredArray.length;
        const std = Math.sqrt(filteredArray.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / filteredArray.length);
        return { mean, std };
    }

    getFrequenciesAboveThreshold() {
        const { mean, std} =  this.calculateMeanAndStd(this.frequencyDb);
        const threshold = mean + this.stdMultiplier * std;
        this.referenceFreqIdx = this.frequencyDb.map((e,i) => e >= threshold ? i : undefined).filter(x => x)
        this.referenceFreqDb = this.referenceFreqIdx.map(i => this.frequencyDb[i]);
        /*for (let i = 0; i < frequencyBinsIdx.length; i++) {
            console.log(this.frequencies[frequencyBinsIdx[i]]);
        }*/
    }

    // Analyze the frequency content of an audio buffer
    async analyzeFrequency(audioBuffer, divide=true) {
        // Initialize frequencies array
        for (let i = 0; i < this.frequencies.length; i++) {
            this.frequencies[i] = i * audioBuffer.sampleRate / this.fftWindowSize;
        }

        let audioBufferPieceArray = divide ? this.divideAudioBuffer(audioBuffer) : [audioBuffer];
        this.frequencyDbPieces = [];
        this.frequencyPiecesCount = 0;
        this.frequencyPiecesMaxCount = audioBufferPieceArray.length;
        this.frequencyDb = new Float32Array(this.fftWindowSize / 2);

        for (let i = 0; i < this.frequencyPiecesMaxCount; i++) {
            await this.fft(audioBufferPieceArray[i]);
        }

        // Compute average dB values
        for (let i = 0; i < this.frequencyDb.length; i++) {
            let sum = 0;
            for (let j = 0; j < this.frequencyDbPieces.length; j++) {
                this.frequencyDbPieces[j][i] = this.frequencyDbPieces[j][i] + 14.5;
                if (this.frequencyDbPieces[j][i] === -Infinity) console.log("infinity");
                if (this.frequencyDbPieces[j][i] > 0) {
                    this.frequencyDbPieces[j][i] = 0;
                }
                sum += Math.pow(10, this.frequencyDbPieces[j][i] / 10);
            }
            sum = sum / this.frequencyDbPieces.length;
            this.frequencyDb[i] = 10 * Math.log10(sum);
        }
        // Apply A-Weighting to the frequency data
        // After testing, applying the A-weighting curve lowers the detection accuracy
        // because the low frequencies get below the threshold of analysis. Consider experimenting with it.
        // this.applyAWeighting(audioBuffer.sampleRate);
        return this.frequencyDb;
    }

    // Apply A-Weighting to the frequency data
    applyAWeighting(sampleRate) {
        const aWeightingCurve = this.calculateAWeightingCurve(sampleRate, this.frequencyDb.length);

        for (let i = 0; i < this.frequencyDb.length; i++) {
            this.frequencyDb[i] += aWeightingCurve[i];
        }
    }

    // Calculate the A-Weighting curve
    calculateAWeightingCurve(sampleRate, bufferLength) {
        const aWeightingCurve = new Float32Array(bufferLength);
        const f = new Float32Array(bufferLength);
        const nyquist = sampleRate / 2;

        for (let i = 0; i < bufferLength; i++) {
            f[i] = (i / bufferLength) * nyquist;
            const freqSquared = f[i] * f[i];
            const freqQuadrupled = freqSquared * freqSquared;

            // A-weighting filter formula in dB
            aWeightingCurve[i] = 20 * Math.log10(
                (12194 ** 2 * freqSquared ** 2) /
                ((freqSquared + 20.6 ** 2) *
                    Math.sqrt((freqSquared + 107.7 ** 2) * (freqSquared + 737.9 ** 2)) *
                    (freqSquared + 12194 ** 2))
            );
        }

        return aWeightingCurve;
    }

    // Divide the audio buffer into overlapping pieces for FFT processing
    divideAudioBuffer(audioBuffer) {
        let audioBufferPieceArray = [];
        let audioBufferPieceLength = this.fftWindowSize;
        let hopSize = this.hopSize;
        let audioBufferPieceCount = Math.ceil((audioBuffer.length - audioBufferPieceLength) / hopSize);

        for (let i = 0; i < audioBufferPieceCount; i++) {
            let audioBufferPiece = this.audioContext.createBuffer(
                audioBuffer.numberOfChannels,
                audioBufferPieceLength,
                audioBuffer.sampleRate
            );
            for (let j = 0; j < audioBuffer.numberOfChannels; j++) {
                let channelData = audioBufferPiece.getChannelData(j);
                for (let k = 0; k < audioBufferPieceLength; k++) {
                    let sampleIndex = i * hopSize + k;
                    if (sampleIndex < audioBuffer.length) {
                        channelData[k] = audioBuffer.getChannelData(j)[sampleIndex];
                    } else {
                        channelData[k] = 0; // Zero padding for the last segment
                    }
                }
            }
            if (!this.isSilent(audioBufferPiece)) {
                audioBufferPieceArray.push(audioBufferPiece);
            }
        }
        return audioBufferPieceArray;
    }

    // Check if the buffer is silent
    isSilent(audioBuffer) {
        for (let j = 0; j < audioBuffer.numberOfChannels; j++) {
            let channelData = audioBuffer.getChannelData(j);
            for (let k = 0; k < audioBuffer.length; k++) {
                if (channelData[k] !== 0) {
                    return false;
                }
            }
        }
        return true;
    }

    // Perform FFT on the audio buffer piece
    async fft(audioBuffer) {
        // Apply window function to reduce spectral leakage
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            this.applyWindowFunction(audioBuffer.getChannelData(channel));
        }

        const offlineCtx = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );

        const sourceNode = offlineCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;

        const analyserNode = offlineCtx.createAnalyser();
        analyserNode.fftSize = this.fftWindowSize;
        analyserNode.smoothingTimeConstant = 0;
        analyserNode.channelCount = audioBuffer.numberOfChannels;

        sourceNode.connect(analyserNode);
        analyserNode.connect(offlineCtx.destination);

        sourceNode.start(0);
        await offlineCtx.startRendering();

        const freqData = new Float32Array(analyserNode.frequencyBinCount);
        analyserNode.getFloatFrequencyData(freqData);
        this.pushFrequencyDbValues(freqData);
    }

    // Push frequency data to frequencyDbPieces
    pushFrequencyDbValues(freqData) {
        this.frequencyDbPieces.push(freqData);
        this.frequencyPiecesCount++;
    }

    // Detect peak times in the audio buffer using the calibrated frequencies
    async detectPeakTimes(audioBuffer) {
        let peakTimes = [];
        let peakPowers = [];
        console.log("audioBuffer length:" + audioBuffer.length)
        console.log("audioBuffer time:" + audioBuffer.length / audioBuffer.sampleRate)
        console.log("fft window size time:" + this.fftWindowSize /audioBuffer.sampleRate * 1000)

        // Step 1: Analyze the frequency content of the audio buffer in overlapping segments
        let audioBufferPieceArray = this.divideAudioBuffer(audioBuffer);
        console.log("audioBufferPieceArray.length:" + audioBufferPieceArray.length);
        console.log(audioBufferPieceArray[0]);
        for (let i = 0; i < audioBufferPieceArray.length; i++) {
            const tmpProcessor = new AudioProcessor(this.audioContext);
            await tmpProcessor.analyzeFrequency(audioBufferPieceArray[i], false);
            // Extract only values for reference frequencies
            const inputFreqDb = this.referenceFreqIdx.map(i => tmpProcessor.frequencyDb[i]);

            if (this.isPeak(inputFreqDb)) {
                const segmentStartTime = i * this.hopSize / audioBuffer.sampleRate;
                const avgPower = inputFreqDb.reduce((partialSum, a) => partialSum + a, 0)
                peakTimes.push(segmentStartTime);
                peakPowers.push(avgPower);
            }
        }
        console.log(peakPowers);
        // return peakTimes;
        return this.selectPeaks(peakTimes, peakPowers, audioBuffer.sampleRate);
    }

    // Check if a specific frequency bin is a peak compared to reference frequencies
    isPeak(inputFreqDb) {
        let diff = 0;
        // Note down the number of frequencies that don't comply with the reference.
        for (let i = 0; i < this.referenceFreqIdx.length; i++) {
            const binDiff = this.referenceFreqDb[i] - inputFreqDb[i];
            if (binDiff > this.binMatchDBTolerance) {
                diff ++;
            }
        }
        // If there is more than a 20% of freq bins that surpass the tolerance peak, don't consider it a peak.
        return Math.ceil(diff / this.referenceFreqIdx.length * 100) < this.binMatchPercentTolerance;

    }

    // If there is a series of peaks together, they are assumed to be from the same beat / tap.
    // Therefore, from each group we only keep the peak with the highest dBs across the reference frequencies.
    selectPeaks(peakTimes, peakPowers, sampleRate) {
        const filteredPeaks = [];
        const peakDuration = this.fftWindowSize / sampleRate;
        for (let i = 0; i < peakTimes.length; i++) {
            let maxPower = peakPowers[i];
            let peakTime = peakTimes[i];
            let j;
            for (j = 1; j < 10; j++) {
                if (peakTimes[i+j] - peakTimes[i] > peakDuration * 10) {
                    break;
                }
                if (peakPowers[i+j] > maxPower) {
                    maxPower = peakPowers[i+j];
                    peakTime = peakTimes[i+j];
                }
            }
            i += j - 1;
            filteredPeaks.push(peakTime);
        }
        return filteredPeaks;
    }
}

// The BeatDetector and TapDetector classes remain the same
class BeatDetector {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.beatFrequencies = [];
    }

    // Calibrate beat frequencies using the provided beat audio buffer
    async calibrate(beatAudioBuffer) {
        this.processor = new AudioProcessor(this.audioContext);
        await this.processor.analyzeFrequency(beatAudioBuffer);
        this.processor.getFrequenciesAboveThreshold();
        console.log(this.processor.referenceFreqIdx);
    }

    // Detect beats in the audio buffer using calibrated beat frequencies
    async detectBeats(audioBuffer) {
        const beatTimes = await this.processor.detectPeakTimes(audioBuffer);
        return beatTimes;
    }
}

// The TapDetector class remains the same
class TapDetector {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.tapFrequencies = [];
    }

    // Calibrate tap frequencies using the provided tap audio buffer
    async calibrate(tapAudioBuffer) {
        this.processor = new AudioProcessor(this.audioContext);
        await this.processor.analyzeFrequency(tapAudioBuffer);
        this.processor.getFrequenciesAboveThreshold();
        console.log(this.processor.referenceFreqIdx);
    }

    // Detect taps in the audio buffer using calibrated tap frequencies
    async detectTaps(audioBuffer) {
        const tapTimes = await this.processor.detectPeakTimes(audioBuffer);
        return tapTimes;
    }
}


class Analyzer {
    constructor(audioContext) {
        this.audioContext = audioContext;
    }

    // Load audio from a file
    async loadAudio(file) {
        const arrayBuffer = await file.arrayBuffer();
        return this.audioContext.decodeAudioData(arrayBuffer);
    }

    // Load audio from a URL
    async loadAudioFromURL(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return this.audioContext.decodeAudioData(arrayBuffer);
    }

    // Calculate precision of taps relative to beats
    calculatePrecision(beats, taps) {
        return taps.map(tap => {
            const closestBeat = beats.reduce((prev, curr) => Math.abs(curr - tap) < Math.abs(prev - tap) ? curr : prev);
            return Math.abs(closestBeat - tap);
        });
    }

    // Analyze the provided beat, tap, and combined audio files
    async analyze(beatBuffer, tapBuffer, combinedBuffer) {
        const beatDetector = new BeatDetector(this.audioContext);
        const tapDetector = new TapDetector(this.audioContext);

        await beatDetector.calibrate(beatBuffer);
        await tapDetector.calibrate(tapBuffer);


        const beats = await beatDetector.detectBeats(combinedBuffer);

        const taps = await tapDetector.detectTaps(combinedBuffer);

        const precision = this.calculatePrecision(beats, taps);


        return { beats, taps, precision };
    }
}

// Initialize audio context within a user gesture event
let audioContext;
let analyzer;

async function detectAndPlotTimes() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyzer = new Analyzer(audioContext);
    }
    await audioContext.resume();

    let beatAudio = document.getElementById('beat-audio').files[0];
    let tapAudio = document.getElementById('tap-audio').files[0];
    let combinedAudio = document.getElementById('combined-audio').files[0];

    let beatBuffer, tapBuffer, combinedBuffer;

    // Load beat audio
    if (beatAudio) {
        beatBuffer = await analyzer.loadAudio(beatAudio);
    } else {
        beatBuffer = await analyzer.loadAudioFromURL('./audios/beats_loud.webm');
    }

    // Load tap audio
    if (tapAudio) {        tapBuffer = await analyzer.loadAudio(tapAudio);
    } else {
        tapBuffer = await analyzer.loadAudioFromURL('./audios/taps_loud.webm');
    }

    // Load combined audio
    if (combinedAudio) {
        combinedBuffer = await analyzer.loadAudio(combinedAudio);
    } else {
        combinedBuffer = await analyzer.loadAudioFromURL('./audios/combined_loud.webm');
    }

    const analysisResult = await analyzer.analyze(beatBuffer, tapBuffer, combinedBuffer);
    const { beats, taps, precision } = analysisResult;

    const beatsText = 'Beats: ' + beats.map(b => b.toFixed(2) + ' ms').join(', ');
    const tapsText = 'Taps: ' + taps.map(b => b.toFixed(2) + ' ms').join(', ');

    let precisionText = '';
    if (Array.isArray(precision)) {
        precisionText = 'Precisions: ' + precision.map(p => p.toFixed(2) + ' ms').join(', ');
    } else {
        precisionText = 'No precisions calculated.';
    }

    document.getElementById('results').innerHTML = `${beatsText}<br>${tapsText}<br>${precisionText}`;

    // Plot the beats and taps
    plotBeatsAndTaps(beats, taps);
}

async function plotSpectrum() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyzer = new Analyzer(audioContext);
    }
    await audioContext.resume();
    let beatAudio = document.getElementById('beat-audio').files[0];
    let tapAudio = document.getElementById('tap-audio').files[0];
    let beatBuffer, tapBuffer;
    // Load beat audio
    if (beatAudio) {
        beatBuffer = await analyzer.loadAudio(beatAudio);
    } else {
        beatBuffer = await analyzer.loadAudioFromURL('./audios/beats_loud.webm');
    }
    // Load tap audio
    if (tapAudio) {        tapBuffer = await analyzer.loadAudio(tapAudio);
    } else {
        tapBuffer = await analyzer.loadAudioFromURL('./audios/taps_loud.webm');
    }
    // Plot the frequency data
    const processor = new AudioProcessor(audioContext);
    const beatFrequencyData = await processor.analyzeFrequency(beatBuffer);
    const tapFrequencyData = await processor.analyzeFrequency(tapBuffer);
    const stdMultiplier = processor.stdMultiplier;
    plotFrequencyData('frequency-chart', beatFrequencyData, tapFrequencyData, audioContext.sampleRate, stdMultiplier);
}

document.getElementById('analyze-button').addEventListener('click', async () => {
    let plotSpectrumChartStatus = Chart.getChart("frequency-chart"); // <canvas> id
    if (plotSpectrumChartStatus !== undefined) {
        plotSpectrumChartStatus.destroy();
    }
    await plotSpectrum();
    let beatsAndTapsChartStatus = Chart.getChart("beat-tap-chart"); // <canvas> id
    if (beatsAndTapsChartStatus !== undefined) {
        beatsAndTapsChartStatus.destroy();
    }
    await detectAndPlotTimes();
});

