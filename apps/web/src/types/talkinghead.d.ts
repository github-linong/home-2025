declare module "@met4citizen/talkinghead" {
  export class TalkingHead {
    constructor(container: HTMLElement, options?: Record<string, unknown>);
    showAvatar(
      avatar: Record<string, unknown>,
      onProgress?: (event: { lengthComputable?: boolean; loaded?: number; total?: number }) => void,
    ): Promise<void>;
    setMood(mood: string): void;
    playGesture(name: string, duration?: number, mirror?: boolean, transitionMs?: number): void;
    stopGesture(transitionMs?: number): void;
    /** Look at viewport client coordinates (or camera if x/y are null). */
    lookAt(x: number | null, y: number | null, t: number): void;
    lookAtCamera(t: number): void;
    /** CCD IK; writes solved link quaternions into poseTarget when d is set. */
    ikSolve(
      ik: Record<string, unknown>,
      target?: unknown,
      relative?: boolean,
      d?: number | null,
    ): void;
    streamStart(
      options?: Record<string, unknown>,
      onAudioStart?: (() => void) | null,
      onAudioEnd?: (() => void) | null,
    ): Promise<void>;
    streamAudio(data: Record<string, unknown>): void;
    streamNotifyEnd(): void;
    streamInterrupt(): void;
    streamStop(): void;
    stop(): void;
  }
}
