import { describe, expect, it } from 'vitest'

import type { SessionTranscriptMessage } from '@/components/chat/session-message'
import {
  markOptimisticMessageFailed,
  mergeSessionTranscriptMessages,
} from '@/components/chat/session-transcript-utils'

function createUserMessage(params: {
  text: string
  timestamp: string
  clientId?: string
  pendingStatus?: 'sending' | 'failed'
  optimistic?: true
}): SessionTranscriptMessage {
  return {
    role: 'user',
    timestamp: params.timestamp,
    clientId: params.clientId,
    pendingStatus: params.pendingStatus,
    optimistic: params.optimistic,
    parts: [{ type: 'text', text: params.text }],
  }
}

describe('session-transcript-utils', () => {
  it('按发送顺序逐条消耗匹配重复 prompt 的 optimistic 消息', () => {
    const optimisticMessages: SessionTranscriptMessage[] = [
      createUserMessage({
        text: 'deploy now',
        timestamp: '2026-04-21T10:00:00.000Z',
        clientId: 'first',
        pendingStatus: 'sending',
        optimistic: true,
      }),
      createUserMessage({
        text: 'deploy now',
        timestamp: '2026-04-21T10:00:03.000Z',
        clientId: 'second',
        pendingStatus: 'sending',
        optimistic: true,
      }),
    ]

    const serverMessages: SessionTranscriptMessage[] = [
      createUserMessage({
        text: 'deploy now',
        timestamp: '2026-04-21T10:00:01.000Z',
      }),
    ]

    const result = mergeSessionTranscriptMessages({
      serverMessages,
      optimisticMessages,
    })

    expect(result.remainingOptimisticMessages).toHaveLength(1)
    expect(result.remainingOptimisticMessages[0]?.clientId).toBe('second')
    expect(result.mergedMessages).toHaveLength(2)
  })

  it('失败的 optimistic 消息会保留并标记失败', () => {
    const optimisticMessages: SessionTranscriptMessage[] = [
      createUserMessage({
        text: 'retry me',
        timestamp: '2026-04-21T10:05:00.000Z',
        clientId: 'failed-one',
        pendingStatus: 'sending',
        optimistic: true,
      }),
    ]

    const result = markOptimisticMessageFailed(optimisticMessages, 'failed-one')

    expect(result).toHaveLength(1)
    expect(result[0]?.pendingStatus).toBe('failed')
    expect(result[0]?.clientId).toBe('failed-one')
  })

  it('纯图片 optimistic 消息在 transcript 回来后也会正确去重', () => {
    const optimisticMessages: SessionTranscriptMessage[] = [{
      role: 'user',
      timestamp: '2026-04-21T10:06:00.000Z',
      clientId: 'image-only',
      pendingStatus: 'sending',
      optimistic: true,
      parts: [{
        type: 'image',
        dataUrl: 'data:image/png;base64,abcd',
        mimeType: 'image/png',
        name: 'generated.png',
      }],
    }]

    const serverMessages: SessionTranscriptMessage[] = [{
      role: 'user',
      timestamp: '2026-04-21T10:06:01.000Z',
      parts: [{
        type: 'image',
        dataUrl: 'data:image/png;base64,abcd',
        mimeType: 'image/png',
        name: 'generated.png',
      }],
    }]

    const result = mergeSessionTranscriptMessages({
      serverMessages,
      optimisticMessages,
    })

    expect(result.remainingOptimisticMessages).toHaveLength(0)
    expect(result.mergedMessages).toHaveLength(1)
  })
})
