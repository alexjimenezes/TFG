"use strict";

class App {
    constructor () {
        this.btnRecord = document.getElementById('btn-record');
        this.btnStop = document.getElementById('btn-stop');
        this.btnPlayMelody = document.getElementById('btn-play-melody');
        this.btnStopMelody = document.getElementById('btn-stop-melody');
        this.btnPlayAndRecord = document.getElementById('btn-play-and-record');

        this.debugTxt = document.getElementById('debug-txt')

        this.recordingsCont = document.getElementById('recordings-cont')

        this.isRecording = false
        this.saveNextRecording = false

        this.debugTxt.innerHTML = "stopped"
    }

    init () {
        this._initEventListeners()
    }

    _initEventListeners () {

        this.btnPlayMelody.addEventListener('click', evt => {
            this.debugTxt.innerHTML = "playing"
            playMelody()
        })

        this.btnStopMelody.addEventListener('click', evt => {
            this.debugTxt.innerHTML = "stopped"
            stopMelody()
        })

        this.btnPlayAndRecord.addEventListener('click', evt => {

            this._stopAllRecording()
            this.saveNextRecording = true
            this._startRecording()

            this.btnRecord.disabled = true
            this.btnStop.disabled = false
            this.debugTxt.innerHTML = "recording"

            delay(200).then(playMelody);

            setTimeout(() => {
                this._stopAllRecording()

                this.btnRecord.disabled = false
                this.btnStop.disabled = true
                this.debugTxt.innerHTML = "stopped"
            }, calculateTotalDuration() + 200);
        })

        this.btnRecord.addEventListener('click', evt => {
            this._stopAllRecording()
            this.saveNextRecording = true
            this._startRecording()

            this.btnRecord.disabled = true
            this.btnStop.disabled = false
            this.debugTxt.innerHTML = "recording"
        })

        this.btnStop.addEventListener('click', evt => {
            this._stopAllRecording();

            this.btnRecord.disabled = false
            this.btnStop.disabled = true
            this.debugTxt.innerHTML = "stopped"
        })
    }

    _startRecording () {
        if (!this.recorderSrvc) {
            this.recorderSrvc = new RecorderService()
            this.recorderSrvc.em.addEventListener('recording', (evt) => this._onNewRecording(evt))
        }

        if (!this.webAudioPeakMeter) {
            this.webAudioPeakMeter = new WebAudioPeakMeter()
            this.meterEl = document.getElementById('recording-meter')
        }

        this.recorderSrvc.onGraphSetupWithInputStream = (inputStreamNode) => {
            this.meterNodeRaw = this.webAudioPeakMeter.createMeterNode(inputStreamNode, this.recorderSrvc.audioCtx)
            this.webAudioPeakMeter.createMeter(this.meterEl, this.meterNodeRaw, {})
        }

        this.recorderSrvc.startRecording()
        this.isRecording = true
        this.debugTxt.innerHTML = "recording..."
    }

    _stopAllRecording () {
        if (this.recorderSrvc && this.isRecording) {

            this.recorderSrvc.stopRecording()
            this.isRecording = false

            if (this.meterNodeRaw) {
                this.meterNodeRaw.disconnect()
                this.meterNodeRaw = null
                this.meterEl.innerHTML = ''
            }
        }
    }

    _onNewRecording (evt) {
        if (!this.saveNextRecording) {
            return
        }
        const newIdx = this.recordingsCont.childNodes.length + 1

        const newEl = document.createElement('div')
        newEl.innerHTML = '<audio id="audio-recording-' + newIdx + '" controls></audio>'
        this.recordingsCont.appendChild(newEl)

        const recordingEl = document.getElementById("audio-recording-" + newIdx);
        recordingEl.src = evt.detail.recording.blobUrl
        recordingEl.type = evt.detail.recording.mimeType
    }
}

const delay = ms => new Promise(res => setTimeout(res, ms));
