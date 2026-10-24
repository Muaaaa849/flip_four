// 1手の流れ（入力 → ルール → 演出 → ロック解除）をまとめる。

import { type Action, apply, canDrop, canFlip, COLS, createState, ROWS, type State } from './rules/GameRules';
import type { BoardPhysics, Marble } from './physics/BoardPhysics';
import { GlassMarble, PLAYER_COLOR } from './render/GlassMarble';
import type { Stage } from './render/Stage';
import type { GlassSound } from './audio/GlassSound';
import type { Hud, Mode } from './ui/Hud';

/** 反転モードで反転できない列の明るさ */
const DIM = 0.35;

export class Game {
  state: State = createState();
  mode: Mode = 'drop';
  /** 演出中は true。入力を捨てる */
  locked = false;
  /** 衝突音のきっかけの回数（debug の表示用） */
  hitCount = 0;
  private pressed: number | null = null;
  private readonly views = new Map<number, GlassMarble>();

  constructor(
    private readonly stage: Stage,
    private readonly physics: BoardPhysics,
    private readonly sound: GlassSound,
    private readonly hud: Hud,
  ) {
    physics.onHit = (m, force) => {
      this.hitCount++;
      sound.hit(m.id, force);
    };
    hud.onMode = (mode) => {
      if (this.locked || this.state.result) return;
      this.mode = mode;
      this.refresh();
    };
    hud.onAgain = () => this.restart();
    hud.onMute = () => {
      sound.muted = !sound.muted;
      hud.setMuted(sound.muted);
    };
    this.refresh();
  }

  canAct(col: number): boolean {
    return this.mode === 'drop' ? canDrop(this.state, col) : canFlip(this.state, col);
  }

  setPressed(col: number | null) {
    this.pressed = col;
    this.refresh();
  }

  act(col: number) {
    if (this.locked || !this.canAct(col)) return;
    const action: Action = { type: this.mode, col };
    const mover = this.state.turn;
    this.state = apply(this.state, action);
    this.locked = true;
    this.refresh();

    if (action.type === 'drop') {
      const marble = this.physics.drop(col, mover, () => this.afterMove());
      this.addView(marble);
    } else {
      this.sound.flip();
      this.physics.holdForFlip(col);
      this.stage.board.tubes[col].flip(() => this.physics.releaseAfterFlip(col, () => this.afterMove()));
    }
  }

  private addView(m: Marble) {
    const view = new GlassMarble(m.player, this.stage.envMap, this.stage.marbleShared);
    this.views.set(m.id, view);
    this.stage.board.tubes[m.col].group.add(view.mesh);
    this.placeView(m, view, 0);
  }

  private placeView(m: Marble, view: GlassMarble, alpha: number) {
    const tube = this.stage.board.tubes[m.col].group;
    const p = this.physics.positionOf(m, alpha);
    // 玉は筒の子。筒の中心からの相対位置に置く（反転中は筒と一緒に回る）
    view.mesh.position.set(p.x - tube.position.x, p.y - tube.position.y, 0);
  }

  /** 演出が終わった */
  private afterMove() {
    const r = this.state.result;
    if (r?.kind === 'win') {
      for (const [c, row] of r.cells) {
        const m = this.physics.marblesOf(c)[row];
        this.views.get(m.id)?.startGlow();
      }
      this.stage.backdrop.showWinner(PLAYER_COLOR[r.winner]);
      this.sound.win();
    }
    this.mode = 'drop';
    this.locked = r !== null;
    this.hud.showResult(r);
    this.refresh();
  }

  private restart() {
    for (const v of this.views.values()) {
      v.mesh.removeFromParent();
      v.dispose();
    }
    this.views.clear();
    this.physics.clear();
    this.stage.backdrop.reset();
    this.state = createState();
    this.mode = 'drop';
    this.locked = false;
    this.hud.showResult(null);
    this.refresh();
  }

  /** 手番・モード・列の光り方・暗さを今の状態に合わせる */
  private refresh() {
    this.hud.setTurn(this.state.turn);
    this.hud.setMode(this.mode);
    this.hud.setLocked(this.locked);
    const dimming = this.mode === 'flip' && !this.locked;
    for (let col = 0; col < COLS; col++) {
      const dim = dimming && !canFlip(this.state, col) ? DIM : 1;
      const tube = this.stage.board.tubes[col];
      tube.setDim(dim);
      tube.setHighlight(this.pressed === col);
      for (const m of this.physics.marblesOf(col)) this.views.get(m.id)?.setDim(dim);
    }
  }

  update(dt: number, alpha: number) {
    for (let col = 0; col < COLS; col++) {
      for (const m of this.physics.marblesOf(col)) {
        const view = this.views.get(m.id);
        if (!view) continue;
        this.placeView(m, view, alpha);
        view.update(dt);
      }
    }
  }

  /** debug 用: 盤面を上の段から文字で表す */
  boardText(): string {
    const lines: string[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      lines.push(this.state.cols.map((c) => c[r] ?? '.').join(' '));
    }
    return lines.join('\n');
  }
}
