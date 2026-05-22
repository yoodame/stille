// Time constants shared by per-scene world components (Forest, Aurora, …).
// Exponential lerp rate = 1 - exp(-dt / TAU), so a scene at e.g. FADE_TAU=0.45
// reaches ~63% of the target in 0.45s and ~95% in ~1.35s.

/** How quickly a scene's group fades in/out when its `visible` prop flips. */
export const FADE_TAU = 0.45;

/** How quickly a scene's color uniforms / material colors lerp toward the
 *  current palette tint. Slower than FADE_TAU so palette shifts feel ambient. */
export const PALETTE_TAU = 1.0;
