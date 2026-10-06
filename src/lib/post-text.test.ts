import { describe, expect, it } from 'vitest'
import {
  LIMIT_SHORT,
  MAX_INTENT_URL_LENGTH,
  composeIntent,
  countPostLength,
  normalizeUsername,
  parsePostUrl,
} from './post-text'

describe('countPostLength', () => {
  it('X の数えかた：日本語と絵文字は 2、英数字は 1', () => {
    expect(countPostLength('')).toBe(0)
    expect(countPostLength('余白')).toBe(4)
    expect(countPostLength('abc')).toBe(3)
    expect(countPostLength('👨‍👩‍👧')).toBe(2)
    expect(countPostLength('が')).toBe(2)
  })
  it('URL は 23', () => {
    expect(countPostLength('https://example.com/very/long/path?q=1')).toBe(23)
    expect(countPostLength('見て https://x.com 。')).toBe(4 + 1 + 23 + 1 + 2)
  })
  it('日本語は 140 字で 280', () => {
    expect(countPostLength('あ'.repeat(140))).toBe(LIMIT_SHORT)
    expect(countPostLength('あ'.repeat(141))).toBeGreaterThan(LIMIT_SHORT)
  })
})

describe('parsePostUrl', () => {
  it('x.com と twitter.com の投稿を読む', () => {
    expect(parsePostUrl('https://x.com/jack/status/20')).toEqual({ id: '20', user: 'jack', url: 'https://x.com/jack/status/20' })
    expect(parsePostUrl('twitter.com/jack/status/20?s=20')?.id).toBe('20')
    expect(parsePostUrl('https://mobile.twitter.com/jack/status/20/photo/1')?.id).toBe('20')
    expect(parsePostUrl('https://x.com/i/web/status/20')?.id).toBe('20')
  })
  it('投稿でないものは null', () => {
    expect(parsePostUrl('')).toBeNull()
    expect(parsePostUrl('https://x.com/jack')).toBeNull()
    expect(parsePostUrl('https://example.com/jack/status/20')).toBeNull()
    expect(parsePostUrl('こんにちは')).toBeNull()
  })
})

describe('normalizeUsername', () => {
  it('@ や URL を外す', () => {
    expect(normalizeUsername('@jack')).toBe('jack')
    expect(normalizeUsername(' https://x.com/jack ')).toBe('jack')
    expect(normalizeUsername('jack doe')).toBeNull()
    expect(normalizeUsername('a'.repeat(16))).toBeNull()
  })
})

describe('composeIntent', () => {
  it('本文と返信先を載せる', () => {
    const { href, tooLong } = composeIntent({ text: 'こんにちは', inReplyTo: '20' })
    expect(tooLong).toBe(false)
    const url = new URL(href)
    expect(url.origin + url.pathname).toBe('https://x.com/intent/tweet')
    expect(url.searchParams.get('text')).toBe('こんにちは')
    expect(url.searchParams.get('in_reply_to')).toBe('20')
  })
  it('引用は url に載せる', () => {
    const url = new URL(composeIntent({ text: 'a', quoteUrl: 'https://x.com/jack/status/20' }).href)
    expect(url.searchParams.get('url')).toBe('https://x.com/jack/status/20')
  })
  it('長い日本語は本文を外す', () => {
    const { href, tooLong } = composeIntent({ text: 'あ'.repeat(300), inReplyTo: '20' })
    expect(tooLong).toBe(true)
    expect(href.length).toBeLessThanOrEqual(MAX_INTENT_URL_LENGTH)
    expect(new URL(href).searchParams.get('text')).toBeNull()
    expect(new URL(href).searchParams.get('in_reply_to')).toBe('20')
  })
})
