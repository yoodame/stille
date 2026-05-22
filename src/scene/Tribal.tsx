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
// Two layered silhouette ranges. The back range is gentle FBM (rolling
// hills); the front range is the same FBM with heights quantized into
// discrete plateaus — gives the iconic flat-topped mesa look. A faint
// haze band sits along the horizon between sky and silhouette.

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
    // Back: smooth FBM — distant low hills.
    float hBack = 0.36 + 0.10 * fbm1(vUv.x * 1.4 + 11.3);

    // Front: same idea but quantized into 5 discrete plateau heights for
    // the mesa silhouette. Wider x-step makes each plateau a true table.
    float raw = fbm1(vUv.x * 1.1 + 5.7);
    float quantized = floor(raw * 5.0) / 5.0;
    float hFront = 0.20 + 0.22 * quantized;

    float backMask  = smoothstep(hBack  + 0.004, hBack  - 0.004, vUv.y);
    float frontMask = smoothstep(hFront + 0.003, hFront - 0.003, vUv.y);

    float anyMask = max(backMask, frontMask);
    if (anyMask * uOpacity < 0.005) discard;

    // Body color: back range gets atmospheric haze (mixed with the haze
    // band color), front is sharper and darker.
    vec3 hazedBack = mix(uBackColor, uHazeColor, 0.32);
    vec3 col = mix(hazedBack, uFrontColor, frontMask);

    // Thin glow line just above each ridge — twilight light catching the
    // tops. Narrow band right at the silhouette edge.
    float rim = smoothstep(0.012, 0.0, abs(vUv.y - hFront));
    col = mix(col, uHazeColor, rim * 0.35 * frontMask);

    float bottomFade = smoothstep(0.0, 0.10, vUv.y);
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
      tmpColor.setRGB(pal.cool[0] * 0.35, pal.cool[1] * 0.35, pal.cool[2] * 0.35);
      frontColor.lerp(tmpColor, rate);

      // Back: lighter mahogany for distance.
      tmpColor.setRGB(pal.cool[0] * 0.65, pal.cool[1] * 0.65, pal.cool[2] * 0.65);
      backColor.lerp(tmpColor, rate);

      // Haze: the warm sunset tone catching the mesa tops.
      tmpColor.setRGB(pal.warm[0], pal.warm[1], pal.warm[2]);
      hazeColor.lerp(tmpColor, rate);
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1} visible={false}>
      <mesh position={[0, -1.6, -14]}>
        <planeGeometry args={[36, 7]} />
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
