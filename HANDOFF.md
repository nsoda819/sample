# 余白（Yohaku）引き継ぎ

Android 向けの、**自分の X 投稿だけを書く・見る机**。タイムライン、おすすめ、フォロー中の流れは出さない。ネイティブアプリではなく、ホーム画面に追加できるモバイル Web アプリ（TanStack Start + React + Tailwind v4）。画面の本体は `src/components/yohaku-app.tsx`。

```sh
npm install
npm run dev        # http://localhost:3000
npm test           # post-text / own-posts の単体テスト
npm run typecheck
npm run build && npm start
```

## 公開（携帯で触る）

Netlify に置く。`netlify.toml` と `@netlify/vite-plugin-tanstack-start` で、`npm run build` がそのまま Netlify 向けの出力（`dist/client` と `.netlify/v1/functions`）になる。Netlify で GitHub の `nsoda819/sample` を取り込み、ブランチを選ぶだけ。`npm audit` の high はこのプラグインの開発用依存で、公開されるアプリには入らない。

## やってはいけないこと

- X のパスワードログインや OAuth は入れない。X は他アプリに投稿させない。
- タイムライン、For You、おすすめ、フォロー中フィードは出さない。
- 「投稿した」と表示しない。このアプリがやるのは、X 公式の投稿窓を開くところまで。

## 画面

1. **最初に開くのは記録。** 書く画面は出さない。
2. 記録には、つないだアカウントの**公開された自分の投稿だけ**。リポストも、このアプリ内の反応ログも出さない。
3. 右下の **＋ 新しい投稿** で、書くだけのページへ。
4. 書くページはほぼ空白のテキストエリア。左上の **投稿窓を開く** が `https://x.com/intent/tweet` を別タブで開く。送信は X 側。**戻る**（Android の戻るボタンも）で記録へ。
5. 下のボタンは **記録** と **反応** だけ。「書く」タブはない。
6. **反応** は、貼った投稿 URL にだけ返す。返信・引用は書くページへ。いいね・リポストは X の確認窓だけ。リンクが空、または読めないときは「投稿のリンクとして読めません」。

投稿カード全体が「この投稿に返す」になる（押すと反応にそのリンクが入る）。

## X とのつなぎ方

- パスワードは聞かない。`@ユーザー名` だけをこの端末の `localStorage`（キー `yohaku-desk-v1`）に保存。
- 取得は `src/lib/own-posts.ts` のサーバー関数。fxtwitter の statuses（`/2/profile/:name/statuses`）だけを使い、作者が自分で `reposted_by` がないものだけ残す。最大 12 件、最大 3 ページ。連続リクエストは 1200ms 空ける。
- 非公開アカウント（401）は読めない。429 は「混んでいます」。

## 投稿の仕組み

`src/lib/post-text.ts`。

- 文字数は X と同じ数えかた。X 公式の `twitter-text` の `weightedLength`。日本語・絵文字は 1 字 2、英数字は 1、URL（`example.com` のような scheme なしも）は 23。
- 上限は 280（日本語だけなら 140 字）と長文（25000）。書くページの「長文」で切り替え。
- スレッドは「続き」。一本ずつ投稿窓を開き、直前の投稿 URL を貼ると次は返信（`in_reply_to`）になる。
- 引用は intent の `url` に投稿 URL を載せる。
- intent の URL が 1900 字を超えたら、本文をコピーし、空の投稿窓を開いて貼らせる。
- 開くのは実リンク（`<a target="_blank">`）。プログラムで作ったクリックはプレビュー内で弾かれる。

## デザイン（ユーザー指定）

デジタル庁デザインシステム v2。色は `src/styles.css` の CSS 変数。

- 文字は Noto Sans JP。太さは 400 と 700 だけ。数字は Noto Sans Mono（`.yh-num`）。本文 16px、行間 175%、字間 0.02em。
- キーカラーは Cyan。帯・選択中・主ボタンは `#006f83`、文字は白。押したときは `#004c59`。
- 地は `#f2f2f2`。カードは白、枠 `#949494`、角 8px。ホバー `#e6e6e6`、押下 `#cccccc`。
- 上は Cyan の帯。小さい「余白」の下に「記録」または「反応」。
- 下の記録と反応は、並んだ 2 枚のカード。開いているほうだけ Cyan。
- 夜モードあり（`data-theme="night"`、帯の「夜／昼」で切り替え）。同じ Cyan の暗い側。

押せるものは、ホバーと押下で色が変わる（`.yh-press` / `.yh-primary`）。変わらないと「壊れている」と言われた。

## 主なファイル

| ファイル | 役割 |
|---|---|
| `src/components/yohaku-app.tsx` | 画面全部 |
| `src/lib/desk-store.ts` | 下書き、返信先、テーマ、ユーザー名。`localStorage` |
| `src/lib/post-text.ts` | 文字数、URL 解析、intent |
| `src/lib/own-posts.ts` | 自分の公開投稿の取得 |
| `src/styles.css` | 色と文字 |
| `src/routes/__root.tsx` | フォント、`theme-color` `#006f83`、manifest |
| `public/manifest.webmanifest` | ホーム画面に追加するための設定 |

`sample.rb` と `site/` はこのリポジトリに元からあったもので、余白とは関係ない。

## 残っている制限

- アプリ内からタイムラインへ直接投稿はできない。
- プレビューの iframe では新しいタブがブロックされることがある。そのときは「投稿窓が開かないときはこちら」。
- fxtwitter はレート制限で空になることがある。
- 開発環境のネットワークから fxtwitter に届かなかったため、記録の取得は実データで確かめていない（応答の読み取りはテストで確認）。
