// つないだアカウントの、公開された自分の投稿だけを取る。
// fxtwitter の statuses だけを使う。ログインもトークンも使わない。

import { createServerFn } from '@tanstack/react-start'
import { normalizeUsername } from './post-text'

const API = 'https://api.fxtwitter.com/2/profile'
const TARGET_COUNT = 12
const MAX_PAGES = 3
/** fxtwitter への連続リクエストはこれだけ空ける。 */
const REQUEST_GAP_MS = 1200

export type OwnPost = {
  id: string
  url: string
  text: string
  createdAt: number | null
  photos: string[]
  replyingTo: string | null
}

export type OwnPostsResult =
  | { ok: true; username: string; posts: OwnPost[] }
  | { ok: false; reason: 'invalid' | 'not-found' | 'private' | 'rate-limited' | 'unavailable' }

let lastRequestAt = 0

async function politeFetch(url: string): Promise<Response> {
  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
  return fetch(url, {
    headers: { 'User-Agent': 'yohaku-desk (own public posts only)', Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null
const str = (v: unknown) => (typeof v === 'string' ? v : null)

export function toPost(raw: unknown, username: string): OwnPost | null {
  if (!isObj(raw)) return null
  // リポストは出さない。
  if (raw.reposted_by != null) return null
  const author = isObj(raw.author) ? raw.author : null
  const screenName = str(author?.screen_name)
  if (!screenName || screenName.toLowerCase() !== username.toLowerCase()) return null
  const id = str(raw.id)
  if (!id || !/^\d+$/.test(id)) return null

  const media = isObj(raw.media) ? raw.media : null
  const photos = (Array.isArray(media?.photos) ? media.photos : [])
    .map((p) => (isObj(p) ? str(p.url) : null))
    .filter((u): u is string => !!u && u.startsWith('https://'))
    .slice(0, 4)

  const ts = typeof raw.created_timestamp === 'number' ? raw.created_timestamp * 1000 : Date.parse(str(raw.created_at) ?? '')
  return {
    id,
    url: `https://x.com/${screenName}/status/${id}`,
    text: str(raw.text) ?? '',
    createdAt: Number.isFinite(ts) ? ts : null,
    photos,
    replyingTo: str(raw.replying_to),
  }
}

export const fetchOwnPosts = createServerFn({ method: 'GET' })
  .validator((input: { username: string }) => input)
  .handler(async ({ data }): Promise<OwnPostsResult> => {
    const username = normalizeUsername(data.username)
    if (!username) return { ok: false, reason: 'invalid' }

    const posts: OwnPost[] = []
    const seen = new Set<string>()
    let cursor: string | null = null

    for (let page = 0; page < MAX_PAGES && posts.length < TARGET_COUNT; page++) {
      const url = `${API}/${encodeURIComponent(username)}/statuses${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
      let res: Response
      try {
        res = await politeFetch(url)
      } catch {
        return posts.length ? { ok: true, username, posts } : { ok: false, reason: 'unavailable' }
      }
      if (res.status === 429) {
        return posts.length ? { ok: true, username, posts } : { ok: false, reason: 'rate-limited' }
      }
      if (res.status === 404) return { ok: false, reason: 'not-found' }
      // 非公開アカウントは 401 で返る。403 などは取得先側の拒否として扱う。
      if (res.status === 401) return { ok: false, reason: 'private' }
      if (!res.ok) {
        return posts.length ? { ok: true, username, posts } : { ok: false, reason: 'unavailable' }
      }

      let body: unknown
      try {
        body = await res.json()
      } catch {
        return posts.length ? { ok: true, username, posts } : { ok: false, reason: 'unavailable' }
      }
      if (!isObj(body)) break

      const results = Array.isArray(body.results) ? body.results : []
      for (const raw of results) {
        const post = toPost(raw, username)
        if (post && !seen.has(post.id)) {
          seen.add(post.id)
          posts.push(post)
        }
      }

      const next = isObj(body.cursor) ? str(body.cursor.bottom) : null
      if (!next || next === cursor || results.length === 0) break
      cursor = next
    }

    return { ok: true, username, posts: posts.slice(0, TARGET_COUNT) }
  })
