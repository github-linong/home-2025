/** Shared audio helpers for CosyVoice playback in the TalkingHead demos. */

export const VISEMES = ["aa", "O", "E", "I", "U", "PP", "SS", "CH"];

/**
 * Approximate viseme timeline from audio energy. Used as a fallback when
 * HeadAudio is unavailable; silent frames are skipped so the mouth closes
 * during pauses.
 */
export function createVisemeTimeline(buffer: AudioBuffer) {
  const stepMs = 130;
  const samplesPerStep = Math.max(1, Math.round((buffer.sampleRate * stepMs) / 1000));
  const count = Math.max(1, Math.min(240, Math.ceil(buffer.length / samplesPerStep)));
  const visemes: string[] = [];
  const vtimes: number[] = [];
  const vdurations: number[] = [];

  for (let frame = 0; frame < count; frame += 1) {
    const start = frame * samplesPerStep;
    const end = Math.min(buffer.length, start + samplesPerStep);
    let energy = 0;
    let sampleCount = 0;
    for (let index = start; index < end; index += 4) {
      let sample = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        sample += buffer.getChannelData(channel)[index] / buffer.numberOfChannels;
      }
      energy += sample * sample;
      sampleCount += 1;
    }
    const rms = sampleCount ? Math.sqrt(energy / sampleCount) : 0;
    if (rms < 0.012) continue;
    const energyBand = Math.min(3, Math.floor(rms * 24));
    visemes.push(VISEMES[(frame + energyBand) % VISEMES.length]);
    vtimes.push(frame * stepMs);
    vdurations.push(stepMs);
  }

  if (visemes.length === 0) {
    visemes.push("aa");
    vtimes.push(0);
    vdurations.push(Math.min(stepMs, buffer.duration * 1000));
  }
  return { visemes, vtimes, vdurations };
}

/** Downmix an AudioBuffer to 16-bit mono PCM for TalkingHead streamAudio. */
export function audioBufferToPcm(buffer: AudioBuffer) {
  const pcm = new Int16Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    let sample = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      sample += buffer.getChannelData(channel)[index] / buffer.numberOfChannels;
    }
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm;
}
