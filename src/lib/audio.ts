export type AudioStreamer = {
  stop: () => Promise<Blob | null>;
};

export type MicrophoneLevelSample = {
  rms: number;
  peak: number;
};

function floatTo16BitPCM(float32Array: Float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number) {
  const targetSampleRate = 16000;

  if (inputSampleRate === targetSampleRate) {
    return input;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  let outputIndex = 0;
  let inputIndex = 0;

  while (outputIndex < outputLength) {
    const nextInputIndex = Math.round((outputIndex + 1) * ratio);
    let sum = 0;
    let count = 0;

    for (let index = inputIndex; index < nextInputIndex && index < input.length; index += 1) {
      sum += input[index];
      count += 1;
    }

    output[outputIndex] = count > 0 ? sum / count : input[Math.min(inputIndex, input.length - 1)] ?? 0;
    outputIndex += 1;
    inputIndex = nextInputIndex;
  }

  return output;
}

export async function requestMicrophoneStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

export async function startMicrophoneStream(
  onChunk: (chunk: Blob) => void,
  onLevel?: (sample: MicrophoneLevelSample) => void,
  existingStream?: MediaStream,
): Promise<AudioStreamer> {
  const stream = existingStream ?? (await requestMicrophoneStream());

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error("AudioContext is not supported in this browser.");
  }

  const audioContext = new AudioContextCtor({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const recordedChunks: Blob[] = [];
  const mediaRecorder =
    typeof MediaRecorder !== "undefined"
      ? new MediaRecorder(
          stream,
          MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? { mimeType: "audio/webm;codecs=opus" }
            : undefined,
        )
      : null;

  if (mediaRecorder) {
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    mediaRecorder.start(250);
  }

  processor.onaudioprocess = (event) => {
    const channelData = event.inputBuffer.getChannelData(0);
    let sumSquares = 0;
    let peak = 0;

    for (let index = 0; index < channelData.length; index += 1) {
      const amplitude = Math.abs(channelData[index]);
      sumSquares += amplitude * amplitude;
      if (amplitude > peak) {
        peak = amplitude;
      }
    }

    onLevel?.({
      rms: Math.sqrt(sumSquares / channelData.length),
      peak,
    });

    const downsampled = downsampleTo16k(channelData, audioContext.sampleRate);
    const pcmBuffer = floatTo16BitPCM(downsampled);

    onChunk(
      new Blob([pcmBuffer], {
        type: "audio/pcm;rate=16000",
      }),
    );
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    stop: async () => {
      const recordingBlob = await new Promise<Blob | null>((resolve) => {
        if (!mediaRecorder) {
          resolve(null);
          return;
        }

        mediaRecorder.onstop = () => {
          resolve(
            recordedChunks.length > 0
              ? new Blob(recordedChunks, {
                  type: mediaRecorder.mimeType || "audio/webm",
                })
              : null,
          );
        };

        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        } else {
          resolve(null);
        }
      });

      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
      return recordingBlob;
    },
  };
}

export class PcmPlayer {
  private readonly audioContext: AudioContext;

  private nextTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
  }

  async resume() {
    if (this.audioContext.state !== "running") {
      await this.audioContext.resume();
    }
  }

  playChunk(chunk: ArrayBuffer) {
    const input = new Int16Array(chunk);
    const buffer = this.audioContext.createBuffer(1, input.length, 24000);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < input.length; index += 1) {
      channel[index] = input[index] / 0x7fff;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };

    const startTime = Math.max(this.audioContext.currentTime, this.nextTime);
    source.start(startTime);
    this.nextTime = startTime + buffer.duration;
  }

  interrupt() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Ignore sources that already ended.
      }
    }
    this.activeSources.clear();
    this.nextTime = this.audioContext.currentTime;
  }

  async close() {
    await this.audioContext.close();
  }
}
