// 列への操作。触った列を光らせ、同じ列で離したらその手を指す。

export interface ColumnInput {
  pickColumn(clientX: number, clientY: number): number | null;
  /** 今の手番とモードで、この列に指せるか */
  canAct(col: number): boolean;
  /** 演出中か */
  isLocked(): boolean;
  setPressed(col: number | null): void;
  act(col: number): void;
}

export class InputController {
  private pressed: number | null = null;
  private pointerId: number | null = null;

  constructor(target: HTMLElement, input: ColumnInput) {
    target.addEventListener('pointerdown', (e) => {
      if (input.isLocked() || this.pointerId !== null) return;
      const col = input.pickColumn(e.clientX, e.clientY);
      if (col === null || !input.canAct(col)) return;
      this.pressed = col;
      this.pointerId = e.pointerId;
      input.setPressed(col);
    });
    const release = (e: PointerEvent, commit: boolean) => {
      if (e.pointerId !== this.pointerId) return;
      const pressed = this.pressed;
      this.pressed = null;
      this.pointerId = null;
      input.setPressed(null);
      if (!commit || pressed === null || input.isLocked()) return;
      if (input.pickColumn(e.clientX, e.clientY) === pressed) input.act(pressed);
    };
    window.addEventListener('pointerup', (e) => release(e, true));
    window.addEventListener('pointercancel', (e) => release(e, false));
  }
}
