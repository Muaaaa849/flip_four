# Flip Four 設計メモ

要件の正本は `docs/spec.md`（受け取った要項そのまま）。ここには、実装で決めたことと確かめた事実だけを書く。

## モジュールの分け方

| ファイル | 役割 |
|---|---|
| `src/rules/GameRules.ts` | 盤面の純粋なロジック。物理と描画を知らない |
| `src/physics/BoardPhysics.ts` | Rapier2D の世界。列ごとの筒・玉・固定ステップ・補間・衝突音のきっかけ |
| `src/physics/SettleDetector.ts` | 列の玉が止まったかの判定（純粋な関数） |
| `src/render/*` | three.js の描画（背景・盤・ガラス玉・カメラ） |
| `src/audio/GlassSound.ts` | Web Audio の合成音 |
| `src/ui/*` | DOM の UI（手番・モード切り替え・結果・音のボタン）と入力 |
| `src/debug/DebugOverlay.ts` | `?debug=1` の重ね表示 |
| `src/Game.ts` | 1手の流れ（入力 → ルール → 演出 → ロック解除）をまとめる |

## 座標

- 盤の面が z = 0。列 c（0〜6）の中心は x = c − 3、段 r（0〜5、0が底）の中心は y = r − 2.5。筒の内側の底は y = −3、上端は y = +3
- 物理（Rapier2D）は盤の面の (x, y) をそのまま使う

## 1手の流れ

1. 入力を受けたら `GameRules.apply` で新しい state を確定する（勝敗もここで決まる）
2. 入力をロックし、演出（落下／反転）を流す
3. 列が止まったら（SettleDetector）、ルール上の位置へ吸着させ、止まった玉は物理上 fixed にする
4. 勝負が付いていれば勝ちの演出、付いていなければ手番を替えてロックを外す

演出中の入力は捨てる。ルールの state は演出を待たずに確定しているので、物理の揺れで勝敗は変わらない。

## 要項の設計値から変えたこと

- 物理の玉の円の半径を 0.5 にした（見た目は 0.46 のまま）。積み上がった玉の静止位置がマス位置（間隔 1.0）と一致し、吸着で玉が上下に動かないため
- 筒の物理上の内幅の半分を 0.52 にした。物理の半径 0.5 の玉が、左右 ±0.02 のずれで壁に引っかからないため
- 衝突音は contact force event の「力が閾値を超えた瞬間」（前のステップで同じ玉に event が無かった）だけで鳴らす。積み重なった玉が押し合う力で鳴り続けないため
- 玉の影（contact shadow）は、玉の少し下の筒の奥の面に置く。盤が立っていて、ほぼ正面から見るので、床に寝かせた楕円は見えないため
- 反転モードで反転できない列は、筒の不透明度を 0.35 倍にし、玉の明るさを 0.35 倍にする。玉は屈折で描くので半透明にはしない
- 勝ちのチャイムの減衰は 600ms にした（音色の倍音比はコツッと同じ）。70ms ではチャイムに聞こえないため
- 揃いが複数あるときは、勝った側の揃いに含まれる玉をすべて光らせる
- 屈折で画面座標をずらす量は、玉の画面上の半径の 3.0 倍にした（`Stage.ts` の `REFRACT_GAIN`）。1.7 倍では玉の中の背景が逆さに見えなかったため
- 玉のシェーダーに、光源の反対側（右下の手前）が自分の色で明るくなる集光の項を足した。これが無いと玉がプラスチックの球に見えたため
- 筒のガラスは表の面だけ描く（DoubleSide にしない）。裏の面も描くと白い膜が2枚重なり、玉が白っぽく見えたため
- `vite.config.ts` で `chunkSizeWarningLimit` を 4500kB にした。rapier2d-compat は WASM を JS に同梱するので、1つの塊が約 4MB になるため
- `?debug=1` の表示に、AudioContext の state と衝突音のきっかけの回数（hits）を足した。Playwright で音を確かめるため

## 確かめた事実（2026-10-24、npm とパッケージの型定義で確認）

- three 0.186.1。RoomEnvironment は `three/examples/jsm/environments/RoomEnvironment.js`
- ShaderMaterial には PMREM の CubeUV 用の define が自動では付かない。`ENVMAP_TYPE_CUBE_UV`・`CUBEUV_TEXEL_WIDTH`・`CUBEUV_TEXEL_HEIGHT`・`CUBEUV_MAX_MIP` を自分で付け、`#include <cube_uv_reflection_fragment>` の `textureCubeUV()` を使う（値の計算は three の `WebGLProgram.generateCubeUVSize` と同じ）
- RenderTarget へ描くとき、three のシェーダーの出力は Linear。RenderTarget の texture の colorSpace を SRGBColorSpace にすると、8bit でも暗部の段が出にくく、読むときに Linear へ戻る
- @dimforge/rapier2d-compat 0.21.0。`await RAPIER.init()` が要る
  - 反発の結合則: `ColliderDesc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)`
  - contact force event: `ColliderDesc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)` と `setContactForceEventThreshold(n)`、`world.step(eventQueue)` のあと `eventQueue.drainContactForceEvents(e => e.collider1(), e.maxForceMagnitude())`
  - collision group: `setCollisionGroups((membership << 16) | filter)`

## 確かめた結果（2026-10-24、Windows の Chromium、Playwright、390×844）

- 玉を落とすと底で跳ね（1個目で hits 4）、止まってロックが外れる。AudioContext の state は running
- 底から [赤, 青] の列を反転すると、`?debug=1` の盤面表示が底から [青, 赤] になる
- 反転の演出中に 8回連打しても、手番は1つしか進まない
- 縦の4つで勝つと、4つが光り、背景が赤に寄り、「赤の勝ち」と「もう一度」が出る。「もう一度」で盤が空に戻る
- FPS は 58〜60（デスクトップ）。iPhone の実機では確かめていない
- iOS Safari での `audioCtx.resume()` と `backdrop-filter` の表示は確かめていない。CSS には `-webkit-backdrop-filter` も書いた
