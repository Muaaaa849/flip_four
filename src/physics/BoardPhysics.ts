// Rapier2D による盤の面上の物理。ルールの state は持たず、見せ方だけを受け持つ。

import RAPIER from '@dimforge/rapier2d-compat';
import { COLS, type Player } from '../rules/GameRules';
import { SettleDetector } from './SettleDetector';

const GRAVITY = -38;
const FIXED_DT = 1 / 120;
/** 物理の玉の半径。マス間隔 1.0 と合わせ、積み上がった玉がマス位置で静止するようにする（見た目は 0.46） */
const BODY_RADIUS = 0.5;
/** 筒の内幅の半分 */
const TUBE_INNER_HALF = 0.52;
const WALL_HALF = 0.05;
const RESTITUTION = 0.32;
/** 筒の内側の底の y */
export const TUBE_FLOOR = -3;
const TUBE_TOP = 3;
/** 落とす玉を出す高さ（盤の上端から +1.2） */
const SPAWN_Y = TUBE_TOP + 1.2;
const SNAP_TIME = 0.09;
/** これ未満の力は衝突音のきっかけにしない（玉1個の重さは約 30） */
const HIT_THRESHOLD = 60;

export const colX = (col: number) => col - (COLS - 1) / 2;
export const rowY = (row: number) => TUBE_FLOOR + 0.5 + row;

export interface Marble {
  id: number;
  col: number;
  player: Player;
  body: RAPIER.RigidBody;
  prev: { x: number; y: number };
  cur: { x: number; y: number };
  /** 吸着の途中なら、その始点と経過時間 */
  snap: { fromX: number; fromY: number; t: number } | null;
}

type ColumnPhase = 'idle' | 'moving' | 'held' | 'snapping';

interface Column {
  /** 底から上への順（ルールの列と同じ並び） */
  marbles: Marble[];
  phase: ColumnPhase;
  detector: SettleDetector;
  onSettled: (() => void) | null;
}

export class BoardPhysics {
  private readonly world: RAPIER.World;
  private readonly events: RAPIER.EventQueue;
  private readonly columns: Column[] = [];
  private readonly byCollider = new Map<number, Marble>();
  private accumulator = 0;
  private nextId = 1;
  /** 前のステップで力の event があった玉の組 */
  private touching = new Set<string>();

  /** 玉が何かに当たった瞬間。force は contact force event の最大の力 */
  onHit: (marble: Marble, force: number) => void = () => {};

  static async create(): Promise<BoardPhysics> {
    await RAPIER.init();
    return new BoardPhysics();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY });
    this.world.timestep = FIXED_DT;
    this.events = new RAPIER.EventQueue(true);
    for (let col = 0; col < COLS; col++) {
      this.columns.push({ marbles: [], phase: 'idle', detector: new SettleDetector(), onSettled: null });
      this.buildTube(col);
    }
  }

  /** 列ごとに別の collision group にする（列同士は干渉しない） */
  private static groups(col: number) {
    const bit = 1 << col;
    return (bit << 16) | bit;
  }

  private buildTube(col: number) {
    const x = colX(col);
    const groups = BoardPhysics.groups(col);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const wallHalfH = (SPAWN_Y + 1 - TUBE_FLOOR) / 2;
    const wallCy = TUBE_FLOOR + wallHalfH;
    const make = (desc: RAPIER.ColliderDesc) =>
      this.world.createCollider(
        desc
          .setRestitution(RESTITUTION)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
          .setCollisionGroups(groups),
        body,
      );
    make(RAPIER.ColliderDesc.cuboid(WALL_HALF, wallHalfH).setTranslation(x - TUBE_INNER_HALF - WALL_HALF, wallCy));
    make(RAPIER.ColliderDesc.cuboid(WALL_HALF, wallHalfH).setTranslation(x + TUBE_INNER_HALF + WALL_HALF, wallCy));
    make(RAPIER.ColliderDesc.cuboid(TUBE_INNER_HALF + 2 * WALL_HALF, WALL_HALF).setTranslation(x, TUBE_FLOOR - WALL_HALF));
  }

  marblesOf(col: number): readonly Marble[] {
    return this.columns[col].marbles;
  }

  /** 列が動いているか（debug の表示用） */
  isMoving(col: number): boolean {
    return this.columns[col].phase !== 'idle';
  }

  /** 玉を盤の上から落とす。止まって吸着し終えたら onSettled を呼ぶ */
  drop(col: number, player: Player, onSettled: () => void): Marble {
    const x = colX(col) + (Math.random() * 2 - 1) * 0.02;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, SPAWN_Y));
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(BODY_RADIUS)
        .setDensity(1.0)
        .setRestitution(RESTITUTION)
        .setFriction(0.05)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setCollisionGroups(BoardPhysics.groups(col))
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(HIT_THRESHOLD),
      body,
    );
    const marble: Marble = {
      id: this.nextId++,
      col,
      player,
      body,
      prev: { x, y: SPAWN_Y },
      cur: { x, y: SPAWN_Y },
      snap: null,
    };
    this.byCollider.set(collider.handle, marble);
    this.columns[col].marbles.push(marble);
    this.startMoving(col, onSettled);
    return marble;
  }

  /** 反転の始まり。列の玉を kinematic にしてその場に留める */
  holdForFlip(col: number) {
    const c = this.columns[col];
    c.phase = 'held';
    for (const m of c.marbles) m.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  }

  /** 筒が 180° 回り終えた瞬間。玉を上下に写し、dynamic に戻して落とす */
  releaseAfterFlip(col: number, onSettled: () => void) {
    const c = this.columns[col];
    c.marbles.reverse();
    for (const m of c.marbles) {
      const p = m.body.translation();
      const mirrored = { x: p.x, y: -p.y };
      m.body.setTranslation(mirrored, true);
      m.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      m.body.setLinvel({ x: 0, y: 0 }, true);
      m.prev = { ...mirrored };
      m.cur = { ...mirrored };
    }
    this.startMoving(col, onSettled);
  }

  private startMoving(col: number, onSettled: () => void) {
    const c = this.columns[col];
    c.phase = 'moving';
    c.detector = new SettleDetector();
    c.onSettled = onSettled;
  }

  /** 経過時間を固定ステップで進める。戻り値は補間の係数 */
  step(dt: number): number {
    this.accumulator = Math.min(this.accumulator + dt, 0.1);
    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      this.fixedStep();
    }
    return this.accumulator / FIXED_DT;
  }

  private fixedStep() {
    for (const c of this.columns) {
      for (const m of c.marbles) m.prev = { ...m.cur };
    }
    this.world.step(this.events);
    this.collectHits();

    this.columns.forEach((c, col) => {
      if (c.phase === 'moving') {
        for (const m of c.marbles) m.cur = { ...m.body.translation() };
        const speeds = c.marbles.map((m) => {
          const v = m.body.linvel();
          return Math.hypot(v.x, v.y);
        });
        if (c.detector.update(speeds, FIXED_DT)) this.beginSnap(col);
      } else if (c.phase === 'snapping') {
        this.advanceSnap(c);
      }
    });
  }

  private collectHits() {
    const now = new Set<string>();
    this.events.drainContactForceEvents((e) => {
      const h1 = e.collider1();
      const h2 = e.collider2();
      const key = h1 < h2 ? `${h1}-${h2}` : `${h2}-${h1}`;
      now.add(key);
      if (this.touching.has(key)) return;
      const marble = this.byCollider.get(h1) ?? this.byCollider.get(h2);
      if (marble) this.onHit(marble, e.maxForceMagnitude());
    });
    this.touching = now;
  }

  /** 止まった列を、ルール上のマス位置へ吸着させる。物理上は fixed にする */
  private beginSnap(col: number) {
    const c = this.columns[col];
    c.phase = 'snapping';
    c.marbles.forEach((m, row) => {
      m.snap = { fromX: m.cur.x, fromY: m.cur.y, t: 0 };
      const target = { x: colX(col), y: rowY(row) };
      m.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      m.body.setTranslation(target, false);
    });
  }

  private advanceSnap(c: Column) {
    let done = true;
    for (const m of c.marbles) {
      if (!m.snap) continue;
      m.snap.t = Math.min(m.snap.t + FIXED_DT, SNAP_TIME);
      const k = easeOutQuad(m.snap.t / SNAP_TIME);
      const target = m.body.translation();
      m.cur = { x: lerp(m.snap.fromX, target.x, k), y: lerp(m.snap.fromY, target.y, k) };
      if (m.snap.t < SNAP_TIME) done = false;
    }
    if (!done) return;
    for (const m of c.marbles) m.snap = null;
    c.phase = 'idle';
    const cb = c.onSettled;
    c.onSettled = null;
    cb?.();
  }

  /** 描画用の位置（固定ステップの間を補間する） */
  positionOf(m: Marble, alpha: number) {
    return { x: lerp(m.prev.x, m.cur.x, alpha), y: lerp(m.prev.y, m.cur.y, alpha) };
  }

  /** debug 用のコライダーの線 */
  debugLines(): RAPIER.DebugRenderBuffers {
    return this.world.debugRender();
  }

  /** すべての玉を取り除く */
  clear() {
    for (const c of this.columns) {
      for (const m of c.marbles) this.world.removeRigidBody(m.body);
      c.marbles = [];
      c.phase = 'idle';
      c.onSettled = null;
    }
    this.byCollider.clear();
    this.touching.clear();
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
