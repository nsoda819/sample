import { describe, expect, it } from 'vitest'
import { toPost } from './own-posts'

const status = (over: Record<string, unknown> = {}) => ({
  id: '1800000000000000001',
  text: '余白の机。',
  created_timestamp: 1700000000,
  author: { screen_name: 'Jack' },
  media: { photos: [{ url: 'https://pbs.twimg.com/media/a.jpg' }] },
  ...over,
})

describe('toPost', () => {
  it('自分の投稿だけ残す', () => {
    const post = toPost(status(), 'jack')
    expect(post).toEqual({
      id: '1800000000000000001',
      url: 'https://x.com/Jack/status/1800000000000000001',
      text: '余白の机。',
      createdAt: 1700000000000,
      photos: ['https://pbs.twimg.com/media/a.jpg'],
      replyingTo: null,
    })
  })
  it('リポストと他人の投稿は外す', () => {
    expect(toPost(status({ reposted_by: { screen_name: 'jack' } }), 'jack')).toBeNull()
    expect(toPost(status({ author: { screen_name: 'someone' } }), 'jack')).toBeNull()
    expect(toPost(null, 'jack')).toBeNull()
  })
})
