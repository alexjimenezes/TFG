// Registering the necessary plugins for Chart.js
Chart.register(
    Chart.BoxPlotController,
    Chart.BoxPlot,
    Chart.LinearScale,
    Chart.PointElement,
    Chart.LineElement,
    Chart.BarElement,
    Chart.BoxAndWhiskers,
    Chart.Legend,
    Chart.Title,
    Chart.Tooltip,
    Chart.Filler,
    Chart.zoom
);

// Function to plot beats and taps using Chart.js
function plotBeatsAndTaps(beats, taps) {
    const ctx = document.getElementById('beat-tap-chart').getContext('2d');
    new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Beats',
                    data: beats.map(time => ({ x: time, y: 0 })),
                    backgroundColor: 'rgba(86,194,62,0.2)',
                    borderColor: 'rgb(86,194,62)',
                    pointRadius: 4,
                },
                {
                    label: 'Taps',
                    data: taps.map(time => ({ x: time, y: 1 })),
                    borderColor: 'rgb(208,52,52)',
                    backgroundColor: 'rgb(208,52,52,0.2)',
                    pointRadius: 4,
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Time (ms)'
                    }
                },
                y: {
                    display: false
                }
            }
        }
    });
}

// Function to calculate mean and standard deviation
function calculateMeanAndStd(dataArray) {
    const filteredArray = dataArray.filter(a => a > -Infinity);
    const mean = filteredArray.reduce((a, b) => a + b, 0) / filteredArray.length;
    const std = Math.sqrt(filteredArray.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / filteredArray.length);
    return { mean, std };
}

// Function to plot frequency data using box plots and enable zooming
function plotFrequencyData(canvasId, beatsDataArray, tapsDataArray, sampleRate, stdMultiplier) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const labels = Array.from({ length: beatsDataArray.length }, (_, i) => (i * sampleRate) / (2 * beatsDataArray.length));

    const beatStats = calculateMeanAndStd(beatsDataArray);
    const tapStats = calculateMeanAndStd(tapsDataArray);;
    const beatsLine = beatStats.mean + stdMultiplier * beatStats.std;
    const tapsLine = tapStats.mean + stdMultiplier * tapStats.std;

    const minY = Math.min(beatStats.mean, tapStats.mean);
    const maxY = Math.max(...beatsDataArray, ...tapsDataArray);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Beats',
                data: beatsDataArray,
                borderColor: 'rgb(86,194,62)',
                backgroundColor: 'rgba(86,194,62,0.2)',
                borderWidth: 1
            }, {
                label: 'Taps',
                data: tapsDataArray,
                borderColor: 'rgb(208,52,52)',
                backgroundColor: 'rgb(208,52,52,0.2)',
                borderWidth: 1
            }
            ,
            {
                label: 'Beats Filter',
                data: Array(beatsDataArray.length).fill(beatsLine),
                type: 'line',
                borderColor: 'rgb(86,194,62)',
                borderWidth: 2,
                fill: false,
                pointRadius: 0
            },
            {
                label: 'Taps Filter',
                data: Array(tapsDataArray.length).fill(tapsLine),
                type: 'line',
                borderColor: 'rgb(208,52,52)',
                borderWidth: 2,
                fill: false,
                pointRadius: 0
            }]
        },
        options: {
            scales: {
                x: {
                    type: 'logarithmic',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Frequency (Hz)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Amplitude (dB)'
                    },
                    beginAtZero: false,
                    min: minY,
                    max: maxY
                }
            },
            plugins: {
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true,
                        },
                        drag: {
                            enabled: true,
                        },
                        mode: 'x',
                    },
                    pan: {
                        enabled: true,
                        mode: 'x'
                    }
                }
            }
        }
    });
}
