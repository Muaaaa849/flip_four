import { describe, expect, it } from 'vitest';
import {
  type Player,
  type State,
  apply,
  canFlip,
  createState,
  legalActions,
} from './GameRules';

const drop = (col: number) => ({ type: 'drop', col }) as const;
const flip = (col: number) => ({ type: 'flip', col }) as const;

/** 手を順に指す */
function play(...actions: ReturnType<typeof drop | typeof flip>[]): State {
  return actions.reduce((s, a) => apply(s, a), createState());
}

/** 列（底から上へ）を直接並べた state を作る */
function stateWith(cols: Player[][], turn: Player = 'R'): State {
  const s = createState();
  return { ...s, cols: Array.from({ length: 7 }, (_, c) => cols[c] ?? []), turn };
}

describe('GameRules: 基本', () => {
  it('赤が先手で、手番が交代する', () => {
    const s = createState();
    expect(s.turn).toBe('R');
    expect(apply(s, drop(3)).turn).toBe('B');
  });

  it('drop は列の底へ詰めて置く', () => {
    const s = play(drop(2), drop(2));
    expect(s.cols[2]).toEqual(['R', 'B']);
  });

  it('満杯の列には落とせない', () => {
    const s = play(drop(0), drop(0), drop(0), drop(0), drop(0), drop(0));
    expect(legalActions(s)).not.toContainEqual(drop(0));
    expect(() => apply(s, drop(0))).toThrow();
  });

  it('apply は元の state を変えない', () => {
    const s = play(drop(1));
    const before = JSON.stringify(s);
    apply(s, drop(1));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('GameRules: 反転', () => {
  it('上から赤・青の列が、反転で上から青・赤になる', () => {
    // 底から [青, 赤] = 上から 赤・青
    const s = stateWith([[], ['B', 'R']]);
    const next = apply(s, flip(1));
    // 底から [赤, 青] = 上から 青・赤
    expect(next.cols[1]).toEqual(['R', 'B']);
  });

  it('玉が1個以下の列は反転できない', () => {
    const s = stateWith([[], ['R']]);
    expect(canFlip(s, 0)).toBe(false);
    expect(canFlip(s, 1)).toBe(false);
    expect(legalActions(s).filter((a) => a.type === 'flip')).toEqual([]);
    expect(() => apply(s, flip(1))).toThrow();
  });

  it('相手が直前に反転した列は反転できない（別の列や、その次の手番なら反転できる）', () => {
    const s = apply(stateWith([['R', 'B'], ['B', 'R']]), flip(0));
    expect(s.turn).toBe('B');
    expect(canFlip(s, 0)).toBe(false);
    expect(canFlip(s, 1)).toBe(true);
    // 青が別の手を指したあとは、赤が列0を反転できる
    const s2 = apply(s, drop(5));
    expect(canFlip(s2, 0)).toBe(true);
  });

  it('全部同じ色の列も反転でき、1手として数える', () => {
    const s = stateWith([['R', 'R']]);
    const next = apply(s, flip(0));
    expect(next.cols[0]).toEqual(['R', 'R']);
    expect(next.turn).toBe('B');
  });
});

describe('GameRules: 勝ちの判定', () => {
  it('縦の4つで勝つ', () => {
    const s = play(drop(0), drop(1), drop(0), drop(1), drop(0), drop(1), drop(0));
    expect(s.result).toMatchObject({ kind: 'win', winner: 'R' });
  });

  it('横の4つで勝つ', () => {
    const s = play(drop(0), drop(0), drop(1), drop(1), drop(2), drop(2), drop(3));
    expect(s.result).toMatchObject({ kind: 'win', winner: 'R' });
    if (s.result?.kind === 'win') {
      expect(s.result.cells).toEqual(
        expect.arrayContaining([
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ]),
      );
    }
  });

  it('右上がりの斜めの4つで勝つ', () => {
    const s = apply(
      stateWith([['R'], ['B', 'R'], ['B', 'B', 'R'], ['B', 'B', 'B']], 'R'),
      drop(3),
    );
    expect(s.result).toMatchObject({ kind: 'win', winner: 'R' });
  });

  it('右下がりの斜めの4つで勝つ', () => {
    const s = apply(
      stateWith([['B', 'B', 'B'], ['B', 'B', 'R'], ['B', 'R'], ['R']], 'R'),
      drop(0),
    );
    expect(s.result).toMatchObject({ kind: 'win', winner: 'R' });
  });

  it('反転で両者に揃いができたら、指した側の勝ち', () => {
    // 青が列3を反転すると、赤の横（段0）と青の横（段1）が同時にできる
    const s = stateWith(
      [
        ['R', 'B'],
        ['R', 'B'],
        ['R', 'B'],
        ['B', 'R'],
      ],
      'B',
    );
    expect(s.result).toBeNull();
    const next = apply(s, flip(3));
    expect(next.cols[3]).toEqual(['R', 'B']);
    expect(next.result).toMatchObject({ kind: 'win', winner: 'B' });
  });

  it('相手だけに揃いができたら、相手の勝ち', () => {
    // 青が列3を反転すると、赤の横だけができる
    const s = stateWith(
      [['R'], ['R'], ['R'], ['B', 'R']],
      'B',
    );
    expect(s.result).toBeNull();
    const next = apply(s, flip(3));
    expect(next.result).toMatchObject({ kind: 'win', winner: 'R' });
  });

  it('勝負が付いたあとは指せない', () => {
    const s = play(drop(0), drop(1), drop(0), drop(1), drop(0), drop(1), drop(0));
    expect(legalActions(s)).toEqual([]);
    expect(() => apply(s, drop(4))).toThrow();
  });
});

describe('GameRules: 引き分け', () => {
  it('42マス埋まって揃いが無ければ引き分け', () => {
    // 2段ずつ色を替えた列を、隣どうしで色を逆にして並べる（どの向きにも4つ揃わない）
    const a: Player[] = ['R', 'R', 'B', 'B', 'R', 'R'];
    const b: Player[] = ['B', 'B', 'R', 'R', 'B', 'B'];
    const cols = [a, b, a, b, a, b, a].map((c) => [...c]);
    const last = cols[6].pop()!; // 最後の1つは drop で置く
    const s = stateWith(cols, last);
    expect(s.result).toBeNull();
    const next = apply(s, drop(6));
    expect(next.result).toEqual({ kind: 'draw' });
  });
});
