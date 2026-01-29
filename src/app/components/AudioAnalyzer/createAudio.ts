const DISPLAY_BINS = 32;

export interface AudioSource {
  context: AudioContext;
  source: AudioBufferSourceNode;
  gain: GainNode;
  raw: Uint8Array;
  /** Mapped to 32 display columns, values 0–255 */
  data: Float32Array & { avg: number };
  update: () => number;
}

/**
 * Map 1024 FFT bins onto 32 display columns using a square-root curve.
 * Gives more weight to low/mid frequencies where musical content lives,
 * without the extreme compression of a full logarithmic scale.
 * Only uses the lower half of bins (~0–12kHz) since upper bins are mostly empty.
 */
function buildBinRanges(rawCount: number, displayCount: number) {
  const usableBins = Math.floor(rawCount * 0.5);
  const ranges: [number, number][] = [];

  for (let i = 0; i < displayCount; i++) {
    const t0 = i / displayCount;
    const t1 = (i + 1) / displayCount;
    const start = Math.floor(t0 * t0 * usableBins);
    const end = Math.max(start + 1, Math.floor(t1 * t1 * usableBins));
    ranges.push([start, end]);
  }
  return ranges;
}

export async function createAudio(
  url: string,
  audioContext: AudioContext
): Promise<AudioSource> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  const gain = audioContext.createGain();

  source.connect(analyser);
  analyser.connect(gain);
  gain.connect(audioContext.destination);

  const raw = new Uint8Array(analyser.frequencyBinCount);
  const data = new Float32Array(DISPLAY_BINS) as Float32Array & { avg: number };
  data.avg = 0;

  const ranges = buildBinRanges(raw.length, DISPLAY_BINS);

  return {
    context: audioContext,
    source,
    gain,
    raw,
    data,
    update: () => {
      analyser.getByteFrequencyData(raw);

      let total = 0;
      for (let i = 0; i < DISPLAY_BINS; i++) {
        const [start, end] = ranges[i];
        let sum = 0;
        const count = end - start;
        for (let j = start; j < end; j++) {
          sum += raw[j];
        }
        data[i] = sum / count;
        total += data[i];
      }

      data.avg = total / DISPLAY_BINS;
      return data.avg;
    },
  };
}
