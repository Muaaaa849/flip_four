// three.js の描画の土台: レンダラー・カメラ・環境マップ・背景の RenderTarget。

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BackdropGradient } from './BackdropGradient';
import { BoardGlass } from './BoardGlass';
import { MARBLE_RADIUS, type MarbleShared } from './GlassMarble';
import { COLS } from '../rules/GameRules';

const FOV = 30;
const PITCH = THREE.MathUtils.degToRad(6);
/** 盤（土台を含む）の幅 */
const BOARD_WIDTH = COLS + 0.5;
const LOOK_AT = new THREE.Vector3(0, 0.3, 0);
/** 屈折のずれの大きさ（玉の画面上の半径の倍率）。大きいほど玉の中の背景が強く逆さに映る */
const REFRACT_GAIN = 3.0;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  readonly scene = new THREE.Scene();
  readonly backdrop = new BackdropGradient();
  readonly board: BoardGlass;
  readonly envMap: THREE.Texture;
  readonly marbleShared: MarbleShared;

  private readonly backdropScene = new THREE.Scene();
  private readonly backdropCamera = new THREE.Camera();
  private readonly backdropTarget: THREE.WebGLRenderTarget;
  private readonly raycaster = new THREE.Raycaster();
  private readonly boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 背景だけを描く半分の解像度の RenderTarget。sRGB で持ち、8bit でも暗部に段が出にくくする
    this.backdropTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.backdropTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.backdropScene.add(this.backdrop.mesh);

    this.marbleShared = {
      uBackdrop: { value: this.backdropTarget.texture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uRefractScale: { value: new THREE.Vector2(0, 0) },
    };

    this.board = new BoardGlass(this.envMap);
    this.scene.add(this.board.group);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 盤の幅が画面の幅の 92% になる距離
    const tanHalfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect;
    const dist = BOARD_WIDTH / 2 / (0.92 * tanHalfH);
    this.camera.position.set(0, LOOK_AT.y + dist * Math.sin(PITCH), dist * Math.cos(PITCH));
    this.camera.lookAt(LOOK_AT);
    this.camera.updateProjectionMatrix();

    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.backdropTarget.setSize(Math.max(1, Math.floor(buf.x / 2)), Math.max(1, Math.floor(buf.y / 2)));
    this.marbleShared.uResolution.value.copy(buf);
    // 屈折のずれの大きさを、玉の画面上の半径に合わせる（画面の UV 単位）
    const radiusPx = (MARBLE_RADIUS / (2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))) * buf.y;
    this.marbleShared.uRefractScale.value.set((radiusPx * REFRACT_GAIN) / buf.x, (radiusPx * REFRACT_GAIN) / buf.y);
  }

  /** 画面上の点から列を求める。盤の外なら null */
  pickColumn(clientX: number, clientY: number): number | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.boardPlane, new THREE.Vector3());
    if (!hit || hit.y < -3.6 || hit.y > 4.8) return null;
    const col = Math.floor(hit.x + COLS / 2);
    return col >= 0 && col < COLS ? col : null;
  }

  render() {
    this.renderer.setRenderTarget(this.backdropTarget);
    this.renderer.render(this.backdropScene, this.backdropCamera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.backdropScene, this.backdropCamera);
    this.renderer.render(this.scene, this.camera);
  }
}
