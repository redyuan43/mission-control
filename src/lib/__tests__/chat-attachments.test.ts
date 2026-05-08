import { describe, expect, it } from 'vitest'
import {
  mergeMetadataWithAttachments,
  normalizeChatAttachments,
  splitAttachmentsFromMetadata,
} from '@/lib/chat-attachments'

describe('chat-attachments', () => {
  it('normalizes image attachments from data urls and http urls', () => {
    const attachments = normalizeChatAttachments([
      {
        name: 'inline.png',
        type: 'image/png',
        size: 12,
        dataUrl: 'data:image/png;base64,abcd',
      },
      {
        name: 'remote.png',
        type: 'image/png',
        size: 0,
        url: 'https://example.com/remote.png',
      },
      {
        name: 'ignored.txt',
        type: 'text/plain',
        size: 1,
        dataUrl: 'data:text/plain;base64,aaaa',
      },
    ])

    expect(attachments).toHaveLength(2)
    expect(attachments[0]?.dataUrl).toContain('data:image/png')
    expect(attachments[1]?.url).toBe('https://example.com/remote.png')
  })

  it('stores attachments inside metadata and strips them back out for responses', () => {
    const metadata = mergeMetadataWithAttachments(
      { status: 'completed' },
      [{
        name: 'inline.png',
        type: 'image/png',
        size: 12,
        dataUrl: 'data:image/png;base64,abcd',
      }],
    )

    const result = splitAttachmentsFromMetadata(metadata)

    expect(result.attachments).toHaveLength(1)
    expect(result.metadata).toEqual({ status: 'completed' })
  })
})
