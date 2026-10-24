import './ui/style.css';
import { Stage } from './render/Stage';
import { BoardPhysics } from './physics/BoardPhysics';
import { GlassSound } from './audio/GlassSound';
import { Hud } from './ui/Hud';
import { InputController } from './ui/InputController';
import { Game } from './Game';
import { DebugOverlay } from './debug/DebugOverlay';

async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
  const stage = new Stage(canvas);
  const physics = await BoardPhysics.create();
  const sound = new GlassSound();
  const game = new Game(stage, physics, sound, new Hud());

  // iOS Safari では pointerup の中で resume する（どのボタンでも最初の操作で音を出せるようにする）
  window.addEventListener('pointerup', () => sound.unlock());

  new InputController(canvas, {
    pickColumn: (x, y) => stage.pickColumn(x, y),
    canAct: (col) => game.canAct(col),
    isLocked: () => game.locked,
    setPressed: (col) => game.setPressed(col),
    act: (col) => game.act(col),
  });

  const debug = new URLSearchParams(location.search).get('debug') === '1'
    ? new DebugOverlay(stage.scene, physics, game, sound)
    : null;

  let last = performance.now();
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const alpha = physics.step(dt);
    stage.board.update(dt);
    game.update(dt, alpha);
    stage.backdrop.update(now / 1000, dt);
    debug?.update(dt);
    stage.render();
  });
}

void main();
