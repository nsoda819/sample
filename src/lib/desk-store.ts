// この端末だけの机。下書き、返信先、テーマ、ユーザー名を localStorage に置く。
// パスワードやトークンは置かない。

import { useCallback, useSyncExternalStore } from 'react'

export const STORAGE_KEY = 'yohaku-desk-v1'

export type Theme = 'day' | 'night'

export type Target = {
  mode: 'reply' | 'quote'
  id: string
  user: string
  url: string
}

export type Desk = {
  username: string
  theme: Theme
  longForm: boolean
  /** 一本目と、その「続き」。 */
  parts: string[]
  /** parts[i] (i>=1) の返信先として貼った、直前の投稿 URL。 */
  prevUrls: string[]
  target: Target | null
}

export const EMPTY_DESK: Desk = {
  username: '',
  theme: 'day',
  longForm: false,
  parts: [''],
  prevUrls: [''],
  target: null,
}

function sanitize(raw: unknown): Desk {
  if (!raw || typeof raw !== 'object') return EMPTY_DESK
  const r = raw as Partial<Desk>
  const parts =
    Array.isArray(r.parts) && r.parts.length > 0 && r.parts.every((p) => typeof p === 'string')
      ? r.parts
      : ['']
  const prevUrls = parts.map((_, i) =>
    Array.isArray(r.prevUrls) && typeof r.prevUrls[i] === 'string' ? r.prevUrls[i] : '',
  )
  const t = r.target
  const target =
    t && (t.mode === 'reply' || t.mode === 'quote') && typeof t.id === 'string' && typeof t.url === 'string'
      ? { mode: t.mode, id: t.id, user: typeof t.user === 'string' ? t.user : '', url: t.url }
      : null
  return {
    username: typeof r.username === 'string' ? r.username : '',
    theme: r.theme === 'night' ? 'night' : 'day',
    longForm: r.longForm === true,
    parts,
    prevUrls,
    target,
  }
}

let current: Desk = EMPTY_DESK
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const text = window.localStorage.getItem(STORAGE_KEY)
    if (text) current = sanitize(JSON.parse(text))
  } catch {
    // 読めなければ空の机から。
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // 保存できない環境（プライベートモードなど）でも、画面はそのまま動かす。
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return
    try {
      current = e.newValue ? sanitize(JSON.parse(e.newValue)) : EMPTY_DESK
    } catch {
      return
    }
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot() {
  load()
  return current
}

export function updateDesk(change: Partial<Desk> | ((d: Desk) => Partial<Desk>)) {
  load()
  const patch = typeof change === 'function' ? change(current) : change
  current = { ...current, ...patch }
  save()
  for (const l of listeners) l()
}

export function useDesk(): [Desk, typeof updateDesk] {
  const desk = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_DESK)
  return [desk, useCallback(updateDesk, [])]
}

/** 書き終えて投稿窓を開いたあとに、机を空に戻す。ユーザー名とテーマは残す。 */
export function clearDraft() {
  updateDesk({ parts: [''], prevUrls: [''], target: null })
}
