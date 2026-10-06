import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '../styles.css?url'
import { STORAGE_KEY } from '../lib/desk-store'

// 描画前に夜モードを当てて、白く光らないようにする。
const themeScript = `try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}');if(d.theme==='night')document.documentElement.dataset.theme='night'}catch(e){}`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: '余白' },
      { name: 'description', content: '自分の X 投稿だけを書く・見る机。' },
      { name: 'theme-color', content: '#006f83' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: '余白' },
    ],
    links: [
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+Mono:wght@400;700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
