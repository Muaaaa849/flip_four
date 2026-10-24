// ガラス玉の見た目。画面空間の擬似屈折・PMREM の反射・Beer–Lambert の吸収で描く。

import * as THREE from 'three';
import type { Player } from '../rules/GameRules';

export const MARBLE_RADIUS = 0.46;
export const PLAYER_COLOR: Record<Player, THREE.Color> = {
  R: new THREE.Color('#FF3B5C'),
  B: new THREE.Color('#2E7BFF'),
};

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewNormal = normalize(normalMatrix * normal);
    vec4 view = viewMatrix * world;
    vViewPos = view.xyz;
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <cube_uv_reflection_fragment>

  uniform sampler2D uBackdrop;
  uniform sampler2D uEnvMap;
  uniform vec2 uResolution;
  uniform vec2 uRefractScale;
  uniform vec3 uAbsorbColor;
  uniform float uAbsorb;
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uDim;
  uniform vec3 uLightDir;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float NdotV = clamp(dot(N, V), 0.0, 1.0);

    // 屈折: 視線を屈折させた向きで画面座標をずらし、背景だけを描いた RenderTarget を読む
    vec3 Nv = normalize(vViewNormal);
    vec3 Vv = normalize(-vViewPos);
    vec3 Rv = refract(-Vv, Nv, 1.0 / 1.5);
    vec2 uv = gl_FragCoord.xy / uResolution + Rv.xy * uRefractScale;
    vec3 refracted = texture2D(uBackdrop, clamp(uv, 0.001, 0.999)).rgb;

    // 吸収: 中心を通る光ほど厚みが増し、濃くなる
    float thickness = 2.0 * NdotV;
    refracted *= exp(-uAbsorb * uAbsorbColor * thickness);

    // 反射: PMREM の envMap と Schlick のフレネル（F0 = 0.04）
    vec3 R = reflect(-V, N);
    vec3 reflected = textureCubeUV(uEnvMap, R, 0.05).rgb;
    float F = 0.04 + 0.96 * pow(1.0 - NdotV, 5.0);
    vec3 color = mix(refracted, reflected, F);

    // 鋭い点状のハイライト（GGX、roughness 0.05）
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float NdotH = max(dot(N, H), 0.0);
    float a2 = 0.05 * 0.05;
    float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * d * d);
    color += vec3(D * F * max(dot(N, L), 0.0) * 0.6);

    // 集光: 玉を通った光が光源の反対側（右下の手前）に集まって明るく光る
    float caustic = smoothstep(0.55, 0.95, dot(N, normalize(vec3(-L.x, -L.y, L.z))));
    color += uColor * caustic * 0.9;

    // 縁の光
    color += vec3(pow(1.0 - NdotV, 3.0) * 0.35);

    // 勝った玉の光
    color += uColor * uGlow;

    gl_FragColor = vec4(color * uDim, 1.0);
    #include <colorspace_fragment>
  }
`;

/** PMREM の CubeUV を読むための define（three の WebGLProgram.generateCubeUVSize と同じ計算） */
function cubeUVDefines(envMap: THREE.Texture) {
  const imageHeight = (envMap.image as { height: number }).height;
  const maxMip = Math.log2(imageHeight) - 2;
  return {
    ENVMAP_TYPE_CUBE_UV: '',
    CUBEUV_TEXEL_WIDTH: 1.0 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16)),
    CUBEUV_TEXEL_HEIGHT: 1.0 / imageHeight,
    CUBEUV_MAX_MIP: `${maxMip}.0`,
  };
}

/** すべての玉で共有する uniform */
export interface MarbleShared {
  uBackdrop: { value: THREE.Texture };
  uResolution: { value: THREE.Vector2 };
  uRefractScale: { value: THREE.Vector2 };
}

export class GlassMarble {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private glowT = -1;

  private static geometry = new THREE.SphereGeometry(MARBLE_RADIUS, 48, 32);
  private static shadowGeometry = new THREE.PlaneGeometry(1.0, 0.62);
  private static shadowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.25 * smoothstep(1.0, 0.0, r) * smoothstep(1.0, 0.3, r));
      }
    `,
  });

  constructor(player: Player, envMap: THREE.Texture, shared: MarbleShared) {
    const color = PLAYER_COLOR[player];
    this.material = new THREE.ShaderMaterial({
      defines: cubeUVDefines(envMap),
      uniforms: {
        ...shared,
        uEnvMap: { value: envMap },
        uAbsorbColor: { value: new THREE.Vector3(1 - color.r, 1 - color.g, 1 - color.b) },
        uAbsorb: { value: 1.6 },
        uColor: { value: color.clone() },
        uGlow: { value: 0 },
        uDim: { value: 1 },
        uLightDir: { value: new THREE.Vector3(-0.4, 0.8, 0.45) },
      },
      vertexShader,
      fragmentShader,
    });
    this.mesh = new THREE.Mesh(GlassMarble.geometry, this.material);

    // contact shadow: 左上の手前の光で、筒の奥の面の右下に落ちる影
    const shadow = new THREE.Mesh(GlassMarble.shadowGeometry, GlassMarble.shadowMaterial);
    shadow.position.set(0.1, -0.22, -0.47);
    this.mesh.add(shadow);
  }

  setDim(dim: number) {
    this.material.uniforms.uDim.value = dim;
  }

  /** 勝った玉として光らせ始める */
  startGlow() {
    this.glowT = 0;
  }

  update(dt: number) {
    if (this.glowT < 0) return;
    this.glowT += dt;
    const t = this.glowT;
    // 0.6秒で 0→1.2（easeOutCubic）、そのあと 1.6秒周期で 0.8〜1.2 を脈打つ
    const glow =
      t < 0.6 ? 1.2 * (1 - Math.pow(1 - t / 0.6, 3)) : 1.0 + 0.2 * Math.cos(((t - 0.6) / 1.6) * Math.PI * 2);
    this.material.uniforms.uGlow.value = glow;
  }

  dispose() {
    this.material.dispose();
  }
}
