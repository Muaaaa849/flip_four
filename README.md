# Flip Four

列を反転できるガラスの四目並べ（スマホ用ブラウザゲーム）。遊ぶ: https://muaaaa849.github.io/flip_four/

要項は `docs/spec.md`、設計と確かめた事実は `docs/design.md`。

```sh
npm install
npm run dev      # 開発サーバー。?debug=1 で重ね表示
npm test         # GameRules と SettleDetector のテスト
npm run build    # dist/ に静的ファイルを出力
```

## 公開

`main` に push すると、GitHub Actions（`.github/workflows/deploy.yml`）がテストとビルドをして GitHub Pages に公開する。
