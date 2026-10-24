// 盤: 独立した 7本の ColumnTube（縦長のガラスの筒）と、土台の枠。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLS } from '../rules/GameRules';
import { colX, TUBE_FLOOR } from '../physics/BoardPhysics';

const TUBE_W = 0.98;
const TUBE_D = 0.98;
const TUBE_H = 6.0;
const GLASS_OPACITY = 0.18;
const EDGE_OPACITY = 0.5;
const FLIP_TIME = 0.42;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 筒の縁の明るい線（太さ 0.02 の細い棒を 12本） */
function edgeGeometry(): THREE.BufferGeometry {
  const t = 0.02;
  const hw = TUBE_W / 2;
  const hd = TUBE_D / 2;
  const hh = TUBE_H / 2;
  const bars: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bars.push(new THREE.BoxGeometry(t, TUBE_H, t).translate(sx * hw, 0, sz * hd));
    }
  }
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) bars.push(new THREE.BoxGeometry(TUBE_W, t, t).translate(0, sy * hh, sz * hd));
    for (const sx of [-1, 1]) bars.push(new THREE.BoxGeometry(t, t, TUBE_D).translate(sx * hw, sy * hh, 0));
  }
  return mergeGeometries(bars);
}

/** 上下の口が開いた箱（反転しても形が変わらない筒） */
function tubeGeometry(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(TUBE_W, TUBE_H, TUBE_D);
  // BoxGeometry の面の順は +x, −x, +y, −y, +z, −z。+y と −y を使わない
  const keep = box.groups.filter((_, i) => i !== 2 && i !== 3);
  const index = box.getIndex()!;
  const indices: number[] = [];
  for (const g of keep) for (let i = g.start; i < g.start + g.count; i++) indices.push(index.getX(i));
  box.setIndex(indices);
  box.clearGroups();
  return box;
}

export class ColumnTube {
  /** 筒と、その中の玉の親。反転はこの group を回す */
  readonly group = new THREE.Group();
  private readonly glass: THREE.MeshPhysicalMaterial;
  private readonly edgeMaterial: THREE.MeshBasicMaterial;
  private dim = 1;
  private flipT = -1;
  private onFlipped: (() => void) | null = null;

  private static tubeGeo = tubeGeometry();
  private static edgeGeo = edgeGeometry();

  constructor(col: number, envMap: THREE.Texture) {
    this.group.position.set(colX(col), TUBE_FLOOR + TUBE_H / 2, 0);
    this.glass = new THREE.MeshPhysicalMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: GLASS_OPACITY,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMap,
      envMapIntensity: 1.2,
      depthWrite: false,
    });
    this.edgeMaterial = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: EDGE_OPACITY,
      depthWrite: false,
    });
    this.group.add(new THREE.Mesh(ColumnTube.tubeGeo, this.glass));
    this.group.add(new THREE.Mesh(ColumnTube.edgeGeo, this.edgeMaterial));
  }

  /** 触られている列を光らせる */
  setHighlight(on: boolean) {
    this.glass.emissive.set(on ? '#FFFFFF' : '#000000');
    this.glass.emissiveIntensity = on ? 0.35 : 0;
    this.edgeMaterial.opacity = on ? 0.9 : EDGE_OPACITY * this.dim;
  }

  setDim(dim: number) {
    this.dim = dim;
    this.glass.opacity = GLASS_OPACITY * dim;
    this.edgeMaterial.opacity = EDGE_OPACITY * dim;
  }

  /** X 軸まわりに 180° 回す。回り終えたら onFlipped を呼ぶ */
  flip(onFlipped: () => void) {
    this.flipT = 0;
    this.onFlipped = onFlipped;
  }

  update(dt: number) {
    if (this.flipT < 0) return;
    this.flipT = Math.min(this.flipT + dt / FLIP_TIME, 1);
    const t = this.flipT;
    // 上端が手前へ来る向きに回し、途中で手前へ浮かせる
    this.group.rotation.x = Math.PI * easeInOutCubic(t);
    this.group.position.z = 0.6 * Math.sin(Math.PI * t);
    if (t < 1) return;
    // 筒は上下対称なので、回転を 0 に戻しても見た目は変わらない。玉は物理側で上下に写す
    this.flipT = -1;
    this.group.rotation.x = 0;
    this.group.position.z = 0;
    const cb = this.onFlipped;
    this.onFlipped = null;
    cb?.();
  }
}

export class BoardGlass {
  readonly group = new THREE.Group();
  readonly tubes: ColumnTube[] = [];

  constructor(envMap: THREE.Texture) {
    for (let col = 0; col < COLS; col++) {
      const tube = new ColumnTube(col, envMap);
      this.tubes.push(tube);
      this.group.add(tube.group);
    }
    // 土台の枠: すりガラスの台
    const base = new THREE.Mesh(
      new RoundedBoxGeometry(COLS + 0.5, 0.5, 1.4, 4, 0.18),
      new THREE.MeshPhysicalMaterial({
        color: '#FFFFFF',
        transparent: true,
        opacity: 0.4,
        roughness: 0.4,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        envMap,
        envMapIntensity: 1.2,
        depthWrite: false,
      }),
    );
    base.position.set(0, TUBE_FLOOR - 0.25, 0);
    this.group.add(base);
  }

  update(dt: number) {
    for (const t of this.tubes) t.update(dt);
  }
}
