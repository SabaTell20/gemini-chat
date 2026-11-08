// recorder.js - records a voice memo and turns it into a .wav file.
// Browsers record in a format Gemini doesn't list (webm), so we decode the recording
// and write plain 16 kHz mono WAV, which Gemini accepts.

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);

  const stopped = new Promise((resolve) => {
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
  });
  recorder.start();

  return {
    /** Stop and return a WAV File. */
    async stop() {
      recorder.stop();
      const blob = await stopped;
      const wav = await toWav(blob);
      return new File([wav], `voice_memo_${Date.now()}.wav`, { type: "audio/wav" });
    },
    /** Stop and throw the recording away. */
    cancel() {
      recorder.stop();
    },
  };
}

async function toWav(blob) {
  const context = new AudioContext({ sampleRate: 16000 });
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  await context.close();
  const samples = audio.getChannelData(0);       // mono is enough for speech

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);                  // size of the format block
  view.setUint16(20, 1, true);                   // 1 = plain PCM
  view.setUint16(22, 1, true);                   // 1 channel
  view.setUint32(24, 16000, true);               // samples per second
  view.setUint32(28, 32000, true);               // bytes per second
  view.setUint16(32, 2, true);                   // bytes per sample
  view.setUint16(34, 16, true);                  // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clipped * 32767, true);
  });
  return new Blob([buffer], { type: "audio/wav" });
}
