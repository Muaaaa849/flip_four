// 画面いっぱいの 4色のメッシュグラデーション。

import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColors[4];
  uniform vec3 uWinColor;
  uniform float uWinMix;
  varying vec2 vUv;

  // 色の位置を 30秒周期でゆっくり漂わせる
  vec2 anchor(int i, float t) {
    float a = t * 6.2831853 / 30.0;
    if (i == 0) return vec2(0.0, 1.0) + 0.18 * vec2(sin(a), cos(a * 2.0));
    if (i == 1) return vec2(1.0, 1.0) + 0.18 * vec2(cos(a + 1.3), sin(a));
    if (i == 2) return vec2(0.0, 0.0) + 0.18 * vec2(cos(a * 2.0 + 2.1), sin(a + 0.7));
    return vec2(1.0, 0.0) + 0.18 * vec2(sin(a + 2.6), cos(a + 1.9));
  }

  void main() {
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 4; i++) {
      float d = distance(vUv, anchor(i, uTime));
      float w = 1.0 / pow(d + 0.05, 2.6);
      sum += uColors[i] * w;
      wsum += w;
    }
    vec3 color = mix(sum / wsum, uWinColor, uWinMix);
    // 8bit の段を目立たなくするディザ
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color += (n - 0.5) / 255.0;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export class BackdropGradient {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    uTime: { value: 0 },
    uColors: {
      // 左上・右上・左下・右下
      value: ['#141A3A', '#4B2E83', '#C86B98', '#F2A68B'].map((c) => new THREE.Color(c)),
    },
    uWinColor: { value: new THREE.Color() },
    uWinMix: { value: 0 },
  };
  private winT = -1;

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
  }

  /** 勝った側の色を 1.2秒で 40% 混ぜ始める */
  showWinner(color: THREE.Color) {
    this.uniforms.uWinColor.value.copy(color);
    this.winT = 0;
  }

  reset() {
    this.winT = -1;
    this.uniforms.uWinMix.value = 0;
  }

  update(time: number, dt: number) {
    this.uniforms.uTime.value = time;
    if (this.winT >= 0) {
      this.winT = Math.min(this.winT + dt, 1.2);
      this.uniforms.uWinMix.value = 0.4 * (this.winT / 1.2);
    }
  }
}
