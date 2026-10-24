// 列の玉が止まったかを判定する。

/** この速さ（マス/s）未満を「静か」とみなす */
const CALM_SPEED = 0.08;
/** 静かな状態がこの時間（秒）続いたら止まったとみなす */
const CALM_TIME = 0.12;
/** 動き始めからこの時間（秒）経ったら、動いていても止まったとみなす */
const MAX_TIME = 1.4;

export class SettleDetector {
  private elapsed = 0;
  private calm = 0;

  /** speeds: 列のすべての玉の速さ。dt: 秒。止まったら true */
  update(speeds: readonly number[], dt: number): boolean {
    this.elapsed += dt;
    this.calm = speeds.every((v) => v < CALM_SPEED) ? this.calm + dt : 0;
    // 浮動小数の足し算の誤差で 1 ステップ遅れないよう、わずかに余裕を持たせる
    return this.calm >= CALM_TIME - 1e-9 || this.elapsed >= MAX_TIME - 1e-9;
  }
}
