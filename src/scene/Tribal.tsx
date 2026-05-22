import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { paletteFor, tintForTimeOfDay } from '../audio/scenes';
import { FADE_TAU, PALETTE_TAU } from './sceneConstants';

type Props = {
  stateRef: React.RefObject<SceneState>;
  trebleRef: React.RefObject<number>;
  visible: boolean;
};

// ───── Mesas ─────────────────────────────────────────────────────────
// Two silhouette layers across the bottom quarter of the frame. The
// back range is gentler / hazier; the front is a dark, hard-edged
// mesa with flat plateau tops from quantized FBM. A faint warm horizon
// line sits where the back range meets the sky.

const mesaVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const mesaFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uFrontColor;
  uniform vec3 uBackColor;
  uniform vec3 uHazeColor;
  uniform float uOpacity;
  varying vec2 vUv;

  float hash1(float x) {
    return fract(sin(x * 127.1) * 43758.5453);
  }
  float n1d(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash1(i), hash1(i + 1.0), u);
  }
  float fbm1(float x) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      sum += n1d(x * freq) * amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return sum;
  }

  void main() {
    // Back range: smooth low FBM — gentle distant hills, slightly above
    // the front silhouette for atmospheric depth.
    float hBack = 0.48 + 0.06 * fbm1(vUv.x * 1.6 + 11.3);

    // Front range: 4-level quantized FBM — chunky stepped mesa tops.
    float raw = fbm1(vUv.x * 0.9 + 5.7);
    float quantized = floor(raw * 4.0) / 3.0; // 0, 0.33, 0.66, 1.0
    float hFront = 0.30 + 0.20 * quantized;

    // Sharp silhouette edges.
    float backMask  = smoothstep(hBack  + 0.004, hBack  - 0.004, vUv.y);
    float frontMask = smoothstep(hFront + 0.003, hFront - 0.003, vUv.y);

    float anyMask = max(backMask, frontMask);
    if (anyMask * uOpacity < 0.005) discard;

    vec3 hazedBack = mix(uBackColor, uHazeColor, 0.25);
    vec3 col = mix(hazedBack, uFrontColor, frontMask);

    // Very thin warm rim catching the top edge of the back range — reads
    // as a single line of dusk light, not a wide glow band.
    float horizon = smoothstep(0.008, 0.0, abs(vUv.y - hBack));
    col = mix(col, uHazeColor, horizon * 0.6 * backMask);

    float bottomFade = smoothstep(0.0, 0.06, vUv.y);
    gl_FragColor = vec4(col, anyMask * uOpacity * bottomFade);
  }
`;

export function Tribal({ stateRef, trebleRef: _trebleRef, visible }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const mesaMatRef = useRef<THREE.ShaderMaterial>(null);

  const frontColor = useMemo(() => new THREE.Color(0.10, 0.06, 0.07), []);
  const backColor  = useMemo(() => new THREE.Color(0.22, 0.12, 0.13), []);
  const hazeColor  = useMemo(() => new THREE.Color(0.88, 0.50, 0.32), []);
  const tmpColor   = useMemo(() => new THREE.Color(), []);

  const mesaUniforms = useMemo(
    () => ({
      uFrontColor: { value: frontColor },
      uBackColor:  { value: backColor },
      uHazeColor:  { value: hazeColor },
      uOpacity:    { value: 0 },
    }),
    [frontColor, backColor, hazeColor],
  );

  const opacityRef = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 24);

    const target = visible ? 1 : 0;
    const fadeRate = 1 - Math.exp(-dt / FADE_TAU);
    opacityRef.current += (target - opacityRef.current) * fadeRate;

    if (mesaMatRef.current) mesaMatRef.current.uniforms.uOpacity.value = opacityRef.current;
    if (groupRef.current) groupRef.current.visible = opacityRef.current > 0.005;

    if (opacityRef.current > 0.005) {
      const pal = tintForTimeOfDay(paletteFor(stateRef.current.sceneId));
      const rate = 1 - Math.exp(-dt / PALETTE_TAU);

      // Front: near-black mahogany.
      tmpColor.setRGB(pal.cool[0] * 0.30, pal.cool[1] * 0.30, pal.cool[2] * 0.30);
      frontColor.lerp(tmpColor, rate);

      // Back: lighter mahogany for distance.
      tmpColor.setRGB(pal.cool[0] * 0.60, pal.cool[1] * 0.60, pal.cool[2] * 0.60);
      backColor.lerp(tmpColor, rate);

      // Haze: warm sunset tone catching the silhouette tops.
      tmpColor.setRGB(pal.warm[0], pal.warm[1], pal.warm[2]);
      hazeColor.lerp(tmpColor, rate);
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1} visible={false}>
      {/* Sits low in the frame so the silhouettes occupy only the
          bottom quarter. */}
      <mesh position={[0, -3.0, -12]}>
        <planeGeometry args={[30, 5]} />
        <shaderMaterial
          ref={mesaMatRef}
          vertexShader={mesaVertex}
          fragmentShader={mesaFragment}
          uniforms={mesaUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
