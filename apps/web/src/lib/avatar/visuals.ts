/**
 * Shared avatar appearance for the TalkingHead demos: realistic Avaturn
 * model config plus a three-point lighting setup tuned for skin tones.
 */

export const AVATAR_URL = "/models/talkinghead/avaturn.glb";

/**
 * showAvatar() config for the Avaturn model. The retarget/baseline values
 * come from the official TalkingHead siteconfig example for Avaturn T2
 * avatars (small shoulder/neck adjustment plus relaxed eyelids).
 */
export function createAvatarConfig(overrides: Record<string, unknown> = {}) {
  return {
    url: AVATAR_URL,
    body: "F",
    avatarMood: "neutral",
    ttsLang: "zh-CN",
    // Supplied Oculus visemes are language-independent; TalkingHead's
    // built-in word-to-viseme module does not include Chinese.
    lipsyncLang: "en",
    retarget: {
      Hips: { y: 0.03 },
      Spine: { y: 0.02 },
      Spine1: { y: 0.02, z: 0.01 },
      Spine2: { y: 0.02, z: 0.01 },
      Neck: { z: 0.02, y: 0.01 },
      Head: { z: 0.02 },
      LeftShoulder: { rx: -0.5 },
      RightShoulder: { rx: -0.5 },
      scaleToHipsLevel: 1.0,
    },
    baseline: {
      headRotateX: -0.05,
      eyeBlinkLeft: 0.15,
      eyeBlinkRight: 0.15,
    },
    ...overrides,
  };
}

/**
 * TalkingHead constructor options for a realistic look. Three-point setup:
 * warm key (directional), low neutral ambient fill, and a cool spot used as
 * rim/back light aimed at the head for silhouette separation.
 */
export function createHeadOptions(overrides: Record<string, unknown> = {}) {
  return {
    lipsyncModules: [],
    modelPixelRatio: window.devicePixelRatio,
    modelFPS: 30,
    // Key light: warm tungsten tone from the front side, slightly above.
    // Values picked via screenshot iteration (2026-07-17, variant C).
    lightDirectColor: 0xffdcb4,
    lightDirectIntensity: 30,
    lightDirectPhi: 1.1,
    lightDirectTheta: 2.55,
    // Fill: keep ambient low so facial shading survives.
    lightAmbientColor: 0xf4f6ff,
    lightAmbientIntensity: 1.1,
    // Rim: cool back light on the head to lift hair/shoulders off the page.
    lightSpotColor: 0x99bbff,
    lightSpotIntensity: 20,
    lightSpotPhi: 0.35,
    lightSpotTheta: 4.6,
    lightSpotDispersion: 1,
    ...overrides,
  };
}
