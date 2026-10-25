// ?debug=1 の重ね表示: コライダーの線・盤面の文字・FPS・SettleDetector の状態。

import * as THREE from 'three';
import { COLS } from '../rules/GameRules';
import type { BoardPhysics } from '../physics/BoardPhysics';
import type { Game } from '../Game';
import type { GlassSound } from '../audio/GlassSound';

export class DebugOverlay {
  private readonly pre = document.querySelector<HTMLPreElement>('#debug')!;
  private readonly lines: THREE.LineSegments;
  private frames = 0;
  private acc = 0;
  private fps = 0;

  constructor(
    scene: THREE.Scene,
    private readonly physics: BoardPhysics,
    private readonly game: Game,
    private readonly sound: GlassSound,
  ) {
    this.pre.hidden = false;
    const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    this.lines.renderOrder = 10;
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  update(dt: number) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
    }

    // Rapier のコライダーの線（2D の点を z = 0.6 の手前に置く）
    const { vertices, colors } = this.physics.debugLines();
    const pos = new Float32Array((vertices.length / 2) * 3);
    for (let i = 0, j = 0; i < vertices.length; i += 2, j += 3) {
      pos[j] = vertices[i];
      pos[j + 1] = vertices[i + 1];
      pos[j + 2] = 0.6;
    }
    const geo = this.lines.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    const settle = Array.from({ length: COLS }, (_, c) =>
      this.physics.isMoving(c) ? `<span class="moving">●</span>` : '○',
    ).join(' ');
    const s = this.game.state;
    const result = s.result ? (s.result.kind === 'draw' ? 'draw' : `win ${s.result.winner}`) : '-';
    this.pre.innerHTML = [
      `fps ${this.fps.toFixed(1)}`,
      `turn ${s.turn}  result ${result}  flips R${s.flipsLeft.R} B${s.flipsLeft.B}`,
      `locked ${this.game.locked}  audio ${this.sound.state}  hits ${this.game.hitCount}`,
      `<span id="debug-board">${this.game.boardText()}</span>`,
      settle,
    ].join('\n');
  }
}
