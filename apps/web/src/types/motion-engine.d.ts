declare module "motion-engine" {
  import type { TalkingHead } from "@met4citizen/talkinghead";

  export type MotionDefinition = {
    _track?: "pose" | "mood" | "action";
    [key: string]: unknown;
  };

  export class MotionEngine {
    constructor(
      talkingHead: TalkingHead,
      options?: {
        gestureFadeIn?: number;
        gestureFadeOut?: number;
        stopFade?: number;
      },
    );
    registerMotions(motions: Record<string, MotionDefinition>): number;
    play(name: string, duration?: number): Promise<void>;
    stop(): void;
    update(deltaMs: number): void;
    getMotionNames(): string[];
  }
}

declare module "motion-engine/motions" {
  import type { MotionDefinition } from "motion-engine";

  const motions: Record<string, MotionDefinition>;
  export default motions;
}
