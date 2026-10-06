import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { clearDraft, useDesk } from '../lib/desk-store'
import type { Desk, Target } from '../lib/desk-store'
import { fetchOwnPosts } from '../lib/own-posts'
import type { OwnPost, OwnPostsResult } from '../lib/own-posts'
import {
  LIMIT_LONG,
  LIMIT_SHORT,
  composeIntent,
  countPostLength,
  likeIntent,
  normalizeUsername,
  parsePostUrl,
  repostIntent,
} from '../lib/post-text'

type View = 'record' | 'react' | 'write'

export function YohakuApp() {
  const [desk, update] = useDesk()
  // 最初に開くのは記録。
  const [view, setView] = useState<View>('record')
  const [reactInput, setReactInput] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = desk.theme
  }, [desk.theme])

  // Android の戻るボタンで、書くページから記録へ戻れるように。
  const openWrite = useCallback(() => {
    window.history.pushState({ yohaku: 'write' }, '')
    setView('write')
    window.scrollTo(0, 0)
  }, [])
  const leaveWrite = useCallback(() => {
    if (window.history.state?.yohaku === 'write') window.history.back()
    else setView('record')
  }, [])
  useEffect(() => {
    const onPop = () => setView((v) => (v === 'write' ? 'record' : v))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const goTab = (v: 'record' | 'react') => {
    setView(v)
    window.scrollTo(0, 0)
  }

  if (view === 'write') {
    return <WritePage desk={desk} update={update} onBack={leaveWrite} />
  }

  return (
    <div className="min-h-dvh pb-[calc(96px+env(safe-area-inset-bottom))]">
      <Band
        title={view === 'record' ? '記録' : '反応'}
        theme={desk.theme}
        onToggleTheme={() => update({ theme: desk.theme === 'night' ? 'day' : 'night' })}
      />
      <main className="mx-auto max-w-xl px-4 pt-4">
        {view === 'record' ? (
          <RecordView
            username={desk.username}
            onConnect={(username) => update({ username })}
            onSelect={(post) => {
              setReactInput(post.url)
              goTab('react')
            }}
          />
        ) : (
          <ReactView
            input={reactInput}
            onInput={setReactInput}
            onCompose={(target) => {
              update({ target })
              openWrite()
            }}
          />
        )}
      </main>

      {view === 'record' && desk.username && (
        <button
          type="button"
          onClick={() => {
            update({ target: null })
            openWrite()
          }}
          className="yh-primary fixed right-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-20 px-5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
        >
          ＋ 新しい投稿
        </button>
      )}

      <BottomNav view={view} onChange={goTab} />
    </div>
  )
}

/* ---------- 上の帯 ---------- */

function Band({ title, theme, onToggleTheme }: { title: string; theme: Desk['theme']; onToggleTheme: () => void }) {
  return (
    <header className="sticky top-0 z-10 bg-key pt-[env(safe-area-inset-top)] text-on-key">
      <div className="mx-auto flex max-w-xl items-end justify-between px-4 pt-2 pb-3">
        <div>
          <p className="text-xs leading-none">余白</p>
          <h1 className="mt-1 text-2xl leading-tight">{title}</h1>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'night' ? '昼モードにする' : '夜モードにする'}
          className="cursor-pointer rounded-[8px] border border-white/70 px-3 py-1 text-sm text-on-key transition-colors hover:bg-white/15 active:bg-white/30"
        >
          {theme === 'night' ? '昼' : '夜'}
        </button>
      </div>
    </header>
  )
}

/* ---------- 下の 2 枚 ---------- */

function BottomNav({ view, onChange }: { view: View; onChange: (v: 'record' | 'react') => void }) {
  const items = [
    { id: 'record', label: '記録' },
    { id: 'react', label: '反応' },
  ] as const
  return (
    <nav
      aria-label="画面"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg px-4 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
        {items.map((it) => {
          const active = view === it.id
          return (
            <button
              key={it.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(it.id)}
              className={`${active ? 'yh-primary' : 'yh-press'} py-3 text-base font-bold`}
            >
              {it.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/* ---------- 記録 ---------- */

const REASON_TEXT: Record<Exclude<OwnPostsResult, { ok: true }>['reason'], string> = {
  invalid: 'ユーザー名として読めません。英数字と _ の 15 字までです。',
  'not-found': 'このアカウントが見つかりません。',
  private: '非公開アカウントの投稿は読めません。',
  'rate-limited': '取得先が混んでいます。少し待ってから更新してください。',
  unavailable: '投稿を取得できませんでした。少し待ってから更新してください。',
}

function RecordView({
  username,
  onConnect,
  onSelect,
}: {
  username: string
  onConnect: (username: string) => void
  onSelect: (post: OwnPost) => void
}) {
  const load = useServerFn(fetchOwnPosts)
  const [state, setState] = useState<{ status: 'idle' | 'loading' } | { status: 'done'; result: OwnPostsResult }>({
    status: 'idle',
  })
  const requestId = useRef(0)

  const refresh = useCallback(() => {
    if (!username) return
    const id = ++requestId.current
    setState({ status: 'loading' })
    load({ data: { username } })
      .then((result) => {
        if (id === requestId.current) setState({ status: 'done', result })
      })
      .catch(() => {
        if (id === requestId.current) setState({ status: 'done', result: { ok: false, reason: 'unavailable' } })
      })
  }, [load, username])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!username) return <ConnectForm onConnect={onConnect} />

  return (
    <section aria-label="自分の投稿">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-bold">@{username}</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={state.status === 'loading'}
            className="yh-press px-3 py-1 text-sm"
          >
            更新
          </button>
          <button type="button" onClick={() => onConnect('')} className="yh-press px-3 py-1 text-sm">
            つなぎ直す
          </button>
        </div>
      </div>

      {state.status !== 'done' ? (
        <p className="py-10 text-center text-ink-sub">読み込んでいます…</p>
      ) : !state.result.ok ? (
        <Notice tone="error">{REASON_TEXT[state.result.reason]}</Notice>
      ) : state.result.posts.length === 0 ? (
        <Notice>
          公開された投稿が見つかりません。取得先が混んでいると空になることがあります。少しして更新してください。
        </Notice>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.result.posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} onSelect={() => onSelect(post)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
})

function PostCard({ post, onSelect }: { post: OwnPost; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`この投稿に返す：${post.text.slice(0, 40)}`}
      className="yh-press block w-full p-4 text-left"
    >
      {post.replyingTo && <p className="mb-1 text-sm text-ink-sub">@{post.replyingTo} への返信</p>}
      <p className="break-words whitespace-pre-wrap">{post.text}</p>
      {post.photos.length > 0 && (
        <div className={`mt-3 grid gap-1 ${post.photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {post.photos.map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              loading="lazy"
              className="aspect-video w-full rounded-[4px] border border-line object-cover"
            />
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-sm text-ink-sub">
        <span className="yh-num">{post.createdAt ? dateFormat.format(post.createdAt) : ''}</span>
        <span className="font-bold text-key-text">この投稿に返す</span>
      </div>
    </button>
  )
}

function ConnectForm({ onConnect }: { onConnect: (username: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const name = normalizeUsername(value)
        if (!name) {
          setError(true)
          return
        }
        onConnect(name)
      }}
    >
      <p>自分の X アカウントの @ユーザー名 を入れてください。公開された自分の投稿だけを、ここに並べます。</p>
      <label className="flex flex-col gap-1">
        <span className="font-bold">ユーザー名</span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(false)
          }}
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="@username"
          aria-invalid={error}
          className="yh-field px-3 py-3"
        />
      </label>
      {error && <p className="text-error">ユーザー名として読めません。英数字と _ の 15 字までです。</p>}
      <button type="submit" className="yh-primary py-3">
        つなぐ
      </button>
      <p className="text-sm text-ink-sub">
        パスワードは聞きません。ユーザー名はこの端末にだけ保存します。非公開アカウントの投稿は読めません。
      </p>
    </form>
  )
}

/* ---------- 反応 ---------- */

function ReactView({
  input,
  onInput,
  onCompose,
}: {
  input: string
  onInput: (v: string) => void
  onCompose: (target: Target) => void
}) {
  const ref = useMemo(() => parsePostUrl(input), [input])

  return (
    <section aria-label="投稿に返す" className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-bold">投稿のリンク</span>
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://x.com/…/status/…"
          aria-invalid={!ref}
          aria-describedby="react-link-note"
          className="yh-field px-3 py-3"
        />
      </label>
      <p id="react-link-note" className={ref ? 'text-sm text-ink-sub' : 'text-sm text-error'}>
        {ref ? (
          <>
            {ref.user ? `@${ref.user} ` : ''}の投稿 <span className="yh-num">{ref.id}</span> に返します。
          </>
        ) : (
          '投稿のリンクとして読めません'
        )}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!ref}
          onClick={() => ref && onCompose({ mode: 'reply', ...ref })}
          className="yh-primary py-3"
        >
          返信を書く
        </button>
        <button
          type="button"
          disabled={!ref}
          onClick={() => ref && onCompose({ mode: 'quote', ...ref })}
          className="yh-primary py-3"
        >
          引用して書く
        </button>
        <ExternalAction href={ref ? likeIntent(ref.id) : undefined}>いいね</ExternalAction>
        <ExternalAction href={ref ? repostIntent(ref.id) : undefined}>リポスト</ExternalAction>
      </div>
      <p className="text-sm text-ink-sub">いいね・リポストは X の確認窓が開きます。確定は X 側で行います。</p>
    </section>
  )
}

function ExternalAction({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) {
    return (
      <span aria-disabled="true" className="yh-press py-3 text-center font-bold">
        {children}
      </span>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="yh-press py-3 text-center font-bold">
      {children}
    </a>
  )
}

/* ---------- 書く ---------- */

function WritePage({
  desk,
  update,
  onBack,
}: {
  desk: Desk
  update: (change: Partial<Desk> | ((d: Desk) => Partial<Desk>)) => void
  onBack: () => void
}) {
  const [active, setActive] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const firstRef = useRef<HTMLTextAreaElement>(null)
  const limit = desk.longForm ? LIMIT_LONG : LIMIT_SHORT
  const index = Math.min(active, desk.parts.length - 1)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  const intents = desk.parts.map((text, i) => {
    const target = i === 0 ? desk.target : null
    const inReplyTo = i === 0 ? (target?.mode === 'reply' ? target.id : null) : (parsePostUrl(desk.prevUrls[i] ?? '')?.id ?? null)
    const quoteUrl = target?.mode === 'quote' ? target.url : null
    const length = countPostLength(text)
    return {
      ...composeIntent({ text, inReplyTo, quoteUrl }),
      length,
      inReplyTo,
      openable: length <= limit && (length > 0 || !!quoteUrl),
    }
  })
  const current = intents[index]

  const setPart = (i: number, text: string) =>
    update((d) => ({ parts: d.parts.map((p, j) => (j === i ? text : p)) }))
  const setPrevUrl = (i: number, url: string) =>
    update((d) => ({ prevUrls: d.parts.map((_, j) => (j === i ? url : (d.prevUrls[j] ?? ''))) }))

  const onOpened = async (i: number) => {
    const intent = intents[i]
    const hasNext = i < desk.parts.length - 1
    if (intent.tooLong) {
      const copied = await copyText(desk.parts[i].trim())
      setNotice(
        copied
          ? '本文が長いので、コピーしました。開いた投稿窓に貼り付けてください。送信は X で行います。'
          : '本文が長く、コピーもできませんでした。本文を選んでコピーし、開いた投稿窓に貼り付けてください。',
      )
      return
    }
    setNotice(
      hasNext
        ? '投稿窓を開きました。送信は X で行います。送信したら、その投稿の URL を次の「続き」に貼ってください。'
        : '投稿窓を開きました。送信は X で行います。',
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-10 border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-2">
          <IntentLink
            href={current.href}
            enabled={current.openable}
            onOpen={() => onOpened(index)}
            className="yh-primary px-4 py-2"
          >
            投稿窓を開く{desk.parts.length > 1 ? `（${index === 0 ? '一本目' : `続き ${index}`}）` : ''}
          </IntentLink>
          <button type="button" onClick={onBack} className="yh-press px-4 py-2">
            戻る
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))]">
        {desk.target && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-[8px] border border-line bg-bg px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              {desk.target.mode === 'reply' ? '返信先' : '引用'}：
              {desk.target.user ? `@${desk.target.user} の投稿` : <span className="yh-num">{desk.target.id}</span>}
            </span>
            <button type="button" onClick={() => update({ target: null })} className="yh-press shrink-0 px-3 py-0.5">
              外す
            </button>
          </div>
        )}

        {notice && (
          <div role="status" className="mb-3">
            <Notice>{notice}</Notice>
          </div>
        )}

        {desk.parts.map((text, i) => {
          const it = intents[i]
          return (
            <div key={i} className={i === 0 ? 'flex flex-1 flex-col' : 'mt-6 flex flex-col border-t border-line pt-4'}>
              {i > 0 && (
                <div className="mb-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">続き {i}</span>
                    <button
                      type="button"
                      onClick={() => {
                        update((d) => ({
                          parts: d.parts.filter((_, j) => j !== i),
                          prevUrls: d.parts.map((_, j) => d.prevUrls[j] ?? '').filter((_, j) => j !== i),
                        }))
                        setActive((a) => (a >= i ? Math.max(0, a - 1) : a))
                      }}
                      className="yh-press px-3 py-0.5 text-sm"
                    >
                      消す
                    </button>
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>直前の投稿の URL（貼ると返信としてつながります）</span>
                    <input
                      value={desk.prevUrls[i] ?? ''}
                      onChange={(e) => setPrevUrl(i, e.target.value)}
                      onFocus={() => setActive(i)}
                      inputMode="url"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="https://x.com/…/status/…"
                      className="yh-field px-3 py-2"
                    />
                    {(desk.prevUrls[i] ?? '').trim() !== '' && !it.inReplyTo && (
                      <span className="text-error">投稿のリンクとして読めません</span>
                    )}
                  </label>
                </div>
              )}
              <textarea
                ref={i === 0 ? firstRef : undefined}
                value={text}
                onChange={(e) => setPart(i, e.target.value)}
                onFocus={() => setActive(i)}
                aria-label={i === 0 ? '本文' : `続き ${i} の本文`}
                placeholder={i === 0 ? '' : '続き'}
                className={`w-full resize-none bg-transparent text-ink outline-none placeholder:text-ink-sub ${
                  i === 0 ? 'min-h-[50dvh] flex-1' : 'min-h-40'
                }`}
              />
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span className={`yh-num ${it.length > limit ? 'font-bold text-error' : 'text-ink-sub'}`}>
                  {it.length} / {limit}
                </span>
                {i > 0 && (
                  <IntentLink
                    href={it.href}
                    enabled={it.openable}
                    onOpen={() => onOpened(i)}
                    className="yh-press px-3 py-1"
                  >
                    この続きの投稿窓を開く
                  </IntentLink>
                )}
              </div>
            </div>
          )
        })}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => {
              update((d) => ({ parts: [...d.parts, ''], prevUrls: [...d.parts.map((_, j) => d.prevUrls[j] ?? ''), ''] }))
              setActive(desk.parts.length)
            }}
            className="yh-press px-4 py-2"
          >
            ＋ 続き
          </button>
          <button
            type="button"
            aria-pressed={desk.longForm}
            onClick={() => update({ longForm: !desk.longForm })}
            className={`${desk.longForm ? 'yh-primary' : 'yh-press'} px-4 py-2`}
          >
            長文 <span className="yh-num">{desk.longForm ? LIMIT_LONG : LIMIT_SHORT}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('下書きを消しますか？')) {
                clearDraft()
                setActive(0)
                setNotice(null)
              }
            }}
            className="yh-press ml-auto px-4 py-2"
          >
            下書きを消す
          </button>
        </div>

        <p className="mt-4 text-sm text-ink-sub">
          このアプリは投稿しません。X の投稿窓を開き、送信は X 側で行います。
          {current.openable && (
            <>
              {' '}
              <a href={current.href} target="_top" className="text-key-text underline hover:no-underline active:opacity-70">
                投稿窓が開かないときはこちら
              </a>
            </>
          )}
        </p>
      </main>
    </div>
  )
}

/** 実リンクで開く。プログラムで作ったクリックはプレビュー内で弾かれるため。 */
function IntentLink({
  href,
  enabled,
  onOpen,
  className,
  children,
}: {
  href: string
  enabled: boolean
  onOpen: () => void
  className: string
  children: ReactNode
}) {
  if (!enabled) {
    return (
      <span aria-disabled="true" className={className}>
        {children}
      </span>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={className}>
      {children}
    </a>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

function Notice({ tone, children }: { tone?: 'error'; children: ReactNode }) {
  return (
    <div
      className={`rounded-[8px] border bg-surface px-4 py-3 ${tone === 'error' ? 'border-error text-error' : 'border-line'}`}
    >
      {children}
    </div>
  )
}
