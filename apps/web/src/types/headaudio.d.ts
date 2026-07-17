declare module "@met4citizen/headaudio/dist/headaudio.min.mjs" {
  export class HeadAudio extends AudioWorkletNode {
    constructor(context: AudioContext, options?: AudioWorkletNodeOptions);
    loadModel(url: string, reset?: boolean): Promise<void>;
    update(deltaMs: number): void;
    start(): void;
    stop(): void;
    onvalue: ((key: string, value: number) => void) | null;
    onstarted: ((event: unknown) => void) | null;
    onended: ((event: unknown) => void) | null;
  }
}

declare module "*headworklet.min.mjs?url" {
  const url: string;
  export default url;
}
