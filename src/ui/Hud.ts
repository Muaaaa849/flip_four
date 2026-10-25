// DOM の表示: 手番・モードの切り替え・結果・音のボタン。

import type { Player, Result } from '../rules/GameRules';

export type Mode = 'drop' | 'flip';

const NAME: Record<Player, string> = { R: '赤', B: '青' };
const COLOR: Record<Player, string> = { R: '#FF3B5C', B: '#2E7BFF' };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

export class Hud {
  private readonly turn = $('#turn');
  private readonly mode = $('#mode');
  private readonly result = $('#result');
  private readonly mute = $<HTMLButtonElement>('#mute');

  onMode: (mode: Mode) => void = () => {};
  onAgain: () => void = () => {};
  onMute: () => void = () => {};

  constructor() {
    this.mode.addEventListener('click', (e) => {
      const m = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode;
      if (m === 'drop' || m === 'flip') this.onMode(m);
    });
    $('#again').addEventListener('click', () => this.onAgain());
    this.mute.addEventListener('click', () => this.onMute());
  }

  setTurn(p: Player) {
    this.turn.style.setProperty('--turn-color', COLOR[p]);
    this.turn.querySelector('.label')!.textContent = `${NAME[p]}の番`;
  }

  setMode(mode: Mode) {
    for (const b of this.mode.querySelectorAll<HTMLElement>('[data-mode]')) {
      b.classList.toggle('active', b.dataset.mode === mode);
    }
  }

  /** 手番の人の反転の残り回数。0 ならボタンを暗くする */
  setFlipsLeft(n: number) {
    const b = this.mode.querySelector<HTMLButtonElement>('[data-mode="flip"]')!;
    b.textContent = `反転 あと${n}`;
    b.classList.toggle('empty', n < 1);
  }

  setLocked(locked: boolean) {
    this.mode.classList.toggle('locked', locked);
  }

  setMuted(muted: boolean) {
    this.mute.classList.toggle('off', muted);
  }

  showResult(r: Result | null) {
    this.result.hidden = r === null;
    this.turn.style.opacity = r === null ? '1' : '0';
    if (r) this.result.querySelector('.label')!.textContent = r.kind === 'draw' ? '引き分け' : `${NAME[r.winner]}の勝ち`;
  }
}
