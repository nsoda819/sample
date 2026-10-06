// 文字数、投稿 URL の読み取り、X の intent URL。
// このアプリは投稿しない。X 公式の投稿窓を開くところまで。

import twitterText from 'twitter-text'

// 上限は X の数えかた（重み付き）で。日本語・絵文字は 1 字を 2、英数字は 1、URL は一律 23。
export const LIMIT_SHORT = 280
export const LIMIT_LONG = 25000
/** intent の URL がこれを超えたら、本文はコピーして空の投稿窓に貼らせる。 */
export const MAX_INTENT_URL_LENGTH = 1900

const INTENT_BASE = 'https://x.com/intent'

/** X と同じ数えかた。X 公式の twitter-text の weightedLength。 */
export function countPostLength(text: string): number {
  if (!text) return 0
  return twitterText.parseTweet(text).weightedLength
}

export type PostRef = {
  id: string
  user: string
  url: string
}

/** x.com / twitter.com の投稿リンクを読む。読めなければ null。 */
export function parsePostUrl(input: string): PostRef | null {
  const raw = input.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|mobile\.)/, '')
  if (!['x.com', 'twitter.com', 'fxtwitter.com', 'fixupx.com', 'vxtwitter.com'].includes(host)) {
    return null
  }
  const m = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:\/|$)/)
  if (!m || m[1].toLowerCase() === 'i') {
    const iweb = url.pathname.match(/^\/i\/(?:web\/)?status\/(\d{1,25})(?:\/|$)/)
    if (!iweb) return null
    return { id: iweb[1], user: '', url: `https://x.com/i/status/${iweb[1]}` }
  }
  return { id: m[2], user: m[1], url: `https://x.com/${m[1]}/status/${m[2]}` }
}

/** 「@name」「name」「x.com/name」を受けて、ユーザー名だけ返す。読めなければ null。 */
export function normalizeUsername(input: string): string | null {
  let s = input.trim()
  const fromUrl = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#\s]+)/i)
  if (fromUrl) s = fromUrl[1]
  s = s.replace(/^@/, '')
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null
}

export type ComposeIntent = {
  /** 投稿窓の URL。tooLong のときは本文を含まない。 */
  href: string
  /** 本文が長すぎて URL に載らない。コピーして貼らせる。 */
  tooLong: boolean
}

export function composeIntent(opts: {
  text: string
  inReplyTo?: string | null
  quoteUrl?: string | null
}): ComposeIntent {
  const build = (text: string) => {
    const params = new URLSearchParams()
    if (text) params.set('text', text)
    if (opts.quoteUrl) params.set('url', opts.quoteUrl)
    if (opts.inReplyTo) params.set('in_reply_to', opts.inReplyTo)
    const q = params.toString()
    return q ? `${INTENT_BASE}/tweet?${q}` : `${INTENT_BASE}/tweet`
  }
  // 前後の空行や空白は送らない。
  const full = build(opts.text.trim())
  if (full.length <= MAX_INTENT_URL_LENGTH) return { href: full, tooLong: false }
  return { href: build(''), tooLong: true }
}

export function likeIntent(id: string): string {
  return `${INTENT_BASE}/like?tweet_id=${encodeURIComponent(id)}`
}

export function repostIntent(id: string): string {
  return `${INTENT_BASE}/retweet?tweet_id=${encodeURIComponent(id)}`
}
