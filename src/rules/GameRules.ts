// 盤面のルール。物理と描画を知らない純粋なロジック。

export const COLS = 7;
export const ROWS = 6;

/** R = 赤（先手）、B = 青 */
export type Player = 'R' | 'B';

/** 1ゲームで反転できる回数。先手の有利を減らすため、後手を1回多くする */
export const FLIP_LIMIT: Readonly<Record<Player, number>> = { R: 2, B: 3 };

export type Action = { type: 'drop'; col: number } | { type: 'flip'; col: number };

/** [列, 段]。段 0 が底 */
export type CellPos = [number, number];

export type Result = { kind: 'win'; winner: Player; cells: CellPos[] } | { kind: 'draw' };

export interface State {
  /** 列ごとの玉。底から上への順に並ぶ（常に底へ詰まっている） */
  cols: Player[][];
  turn: Player;
  /** 反転の残り回数 */
  flipsLeft: Record<Player, number>;
  /** 直前の手（相手が指した手） */
  lastAction: Action | null;
  result: Result | null;
}

export function createState(): State {
  return {
    cols: Array.from({ length: COLS }, () => []),
    turn: 'R',
    flipsLeft: { ...FLIP_LIMIT },
    lastAction: null,
    result: null,
  };
}

export const other = (p: Player): Player => (p === 'R' ? 'B' : 'R');

export function canDrop(s: State, col: number): boolean {
  return s.result === null && s.cols[col].length < ROWS;
}

export function canFlip(s: State, col: number): boolean {
  if (s.result !== null || s.cols[col].length < 2 || s.flipsLeft[s.turn] < 1) return false;
  const last = s.lastAction;
  return !(last?.type === 'flip' && last.col === col);
}

export function legalActions(s: State): Action[] {
  const actions: Action[] = [];
  for (let col = 0; col < COLS; col++) {
    if (canDrop(s, col)) actions.push({ type: 'drop', col });
    if (canFlip(s, col)) actions.push({ type: 'flip', col });
  }
  return actions;
}

export function apply(s: State, action: Action): State {
  const ok = action.type === 'drop' ? canDrop(s, action.col) : canFlip(s, action.col);
  if (!ok) throw new Error(`指せない手です: ${action.type}(${action.col})`);

  const cols = s.cols.map((c) => [...c]);
  const flipsLeft = { ...s.flipsLeft };
  if (action.type === 'drop') {
    cols[action.col].push(s.turn);
  } else {
    cols[action.col].reverse();
    flipsLeft[s.turn] -= 1;
  }

  return {
    cols,
    turn: other(s.turn),
    flipsLeft,
    lastAction: action,
    result: judge(cols, s.turn),
  };
}

/** 毎手のあとの判定。両者に揃いがあれば指した側の勝ち */
function judge(cols: Player[][], mover: Player): Result | null {
  for (const p of [mover, other(mover)]) {
    const cells = lineCells(cols, p);
    if (cells.length > 0) return { kind: 'win', winner: p, cells };
  }
  const filled = cols.reduce((n, c) => n + c.length, 0);
  return filled === COLS * ROWS ? { kind: 'draw' } : null;
}

const DIRS: CellPos[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** p の4つ揃いに含まれるマスをすべて返す（重複なし） */
function lineCells(cols: Player[][], p: Player): CellPos[] {
  const at = (c: number, r: number) => (c >= 0 && c < COLS ? cols[c][r] : undefined);
  const found = new Map<string, CellPos>();
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      for (const [dc, dr] of DIRS) {
        const line: CellPos[] = [0, 1, 2, 3].map((k) => [c + dc * k, r + dr * k]);
        if (line.every(([lc, lr]) => at(lc, lr) === p)) {
          for (const cell of line) found.set(cell.join(','), cell);
        }
      }
    }
  }
  return [...found.values()];
}
