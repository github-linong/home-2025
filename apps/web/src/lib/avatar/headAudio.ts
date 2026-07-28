/** Shared HeadAudio (audio-driven lip-sync) bootstrap for TalkingHead demos. */

import { HeadAudio } from "@met4citizen/headaudio/dist/headaudio.min.mjs";
import headAudioWorkletUrl from "@met4citizen/headaudio/dist/headworklet.min.mjs?url";
import type { TalkingHead } from "@met4citizen/talkinghead";

export const HEAD_AUDIO_MODEL_URL = "/vendor/headaudio/model-en-mixed.bin";

/** TalkingHead internals HeadAudio and the demos need access to. */
export type HeadInternals = TalkingHead & {
  audioCtx: AudioContext;
  audioSpeechGainNode: GainNode;
  mtAvatar: Record<string, { newvalue: number; needsUpdate: boolean } | undefined>;
  opt: { update?: (deltaMs: number) => void };
  armature?: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
};

export type HeadAudioHooks = {
  onstarted?: () => void;
  onended?: () => void;
};

/**
 * Attach HeadAudio to a loaded TalkingHead instance: loads the worklet and
 * acoustic model, routes the speech gain node into the detector and drives
 * the avatar's morph targets from detected visemes. Returns null when the
 * environment does not support it (caller falls back to approximate visemes).
 */
export async function attachHeadAudio(
  head: TalkingHead,
  hooks: HeadAudioHooks = {},
): Promise<HeadAudio | null> {
  const audioHead = head as HeadInternals;
  let detector: HeadAudio | null = null;
  try {
    await audioHead.audioCtx.audioWorklet.addModule(headAudioWorkletUrl);
    detector = new HeadAudio(audioHead.audioCtx, {
      parameterData: {
        vadGateActiveDb: -40,
        vadGateInactiveDb: -55,
        silMode: 0,
        speakerMeanHz: 220,
      },
    });
    await detector.loadModel(HEAD_AUDIO_MODEL_URL);
    audioHead.audioSpeechGainNode.connect(detector);
    detector.onvalue = (key, value) => {
      const target = audioHead.mtAvatar[key];
      if (target) Object.assign(target, { newvalue: value, needsUpdate: true });
    };
    if (hooks.onstarted) detector.onstarted = hooks.onstarted;
    if (hooks.onended) detector.onended = hooks.onended;
    const previousUpdate = audioHead.opt.update;
    audioHead.opt.update = (deltaMs) => {
      previousUpdate?.(deltaMs);
      detector?.update(deltaMs);
    };
    return detector;
  } catch (error) {
    detector?.disconnect();
    console.warn("[avatar] HeadAudio unavailable, using approximate visemes", error);
    return null;
  }
}
