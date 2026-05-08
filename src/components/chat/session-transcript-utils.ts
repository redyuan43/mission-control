import type { SessionTranscriptMessage } from './session-message'
import type { ChatAttachment } from '@/store'

const OPTIMISTIC_MATCH_WINDOW_MS = 5 * 60 * 1000

export function createOptimisticSessionMessage(params: {
  prompt: string
  clientId: string
  attachments?: ChatAttachment[]
  timestamp?: string
}): SessionTranscriptMessage {
  return {
    role: 'user',
    parts: [
      ...(params.prompt ? [{ type: 'text', text: params.prompt } as const] : []),
      ...toImageParts(params.attachments),
    ],
    timestamp: params.timestamp || new Date().toISOString(),
    clientId: params.clientId,
    pendingStatus: 'sending',
    optimistic: true,
  }
}

export function markOptimisticMessageFailed(
  messages: SessionTranscriptMessage[],
  clientId: string,
): SessionTranscriptMessage[] {
  return messages.map((message) => {
    if (message.clientId !== clientId) return message
    return {
      ...message,
      pendingStatus: 'failed',
    }
  })
}

export function mergeSessionTranscriptMessages(params: {
  serverMessages: SessionTranscriptMessage[]
  optimisticMessages: SessionTranscriptMessage[]
}): {
  mergedMessages: SessionTranscriptMessage[]
  remainingOptimisticMessages: SessionTranscriptMessage[]
} {
  const sortedServerMessages = [...params.serverMessages].sort(compareSessionMessages)
  const unmatchedOptimisticMessages = [...params.optimisticMessages]

  for (const serverMessage of sortedServerMessages) {
    const optimisticIndex = unmatchedOptimisticMessages.findIndex((optimisticMessage) =>
      doesOptimisticMessageMatchServerMessage(optimisticMessage, serverMessage),
    )
    if (optimisticIndex >= 0) {
      unmatchedOptimisticMessages.splice(optimisticIndex, 1)
    }
  }

  const mergedMessages = [...sortedServerMessages, ...unmatchedOptimisticMessages].sort(compareSessionMessages)

  return {
    mergedMessages,
    remainingOptimisticMessages: unmatchedOptimisticMessages,
  }
}

export function getSessionMessageText(message: SessionTranscriptMessage): string {
  return message.parts
    .map((part) => {
      switch (part.type) {
        case 'text':
          return part.text
        case 'thinking':
          return part.thinking
        case 'tool_use':
          return `${part.name} ${part.input}`
        case 'tool_result':
          return part.content
        case 'image':
          return part.url || part.dataUrl || part.name || ''
        default:
          return ''
      }
    })
    .join('\n')
}

export function getSessionMessageSignature(message: SessionTranscriptMessage): string {
  return message.parts
    .map((part) => {
      switch (part.type) {
        case 'text':
          return `text:${normalizeSessionMessageText(part.text)}`
        case 'thinking':
          return `thinking:${normalizeSessionMessageText(part.thinking)}`
        case 'tool_use':
          return `tool:${part.name}:${normalizeSessionMessageText(part.input)}`
        case 'tool_result':
          return `result:${normalizeSessionMessageText(part.content)}`
        case 'image':
          return `image:${part.dataUrl || part.url || part.name || ''}`
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('|')
}

function doesOptimisticMessageMatchServerMessage(
  optimisticMessage: SessionTranscriptMessage,
  serverMessage: SessionTranscriptMessage,
): boolean {
  if (optimisticMessage.role !== 'user' || serverMessage.role !== 'user') return false

  const optimisticSignature = getSessionMessageSignature(optimisticMessage)
  const serverSignature = getSessionMessageSignature(serverMessage)
  if (!optimisticSignature || optimisticSignature !== serverSignature) return false

  const optimisticTs = Date.parse(optimisticMessage.timestamp || '')
  const serverTs = Date.parse(serverMessage.timestamp || '')

  if (Number.isNaN(optimisticTs) || Number.isNaN(serverTs)) return true
  return Math.abs(serverTs - optimisticTs) <= OPTIMISTIC_MATCH_WINDOW_MS
}

function normalizeSessionMessageText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
}

function toImageParts(attachments: ChatAttachment[] | undefined): SessionTranscriptMessage['parts'] {
  if (!attachments || attachments.length === 0) return []

  return attachments
    .filter((attachment) => attachment.type.startsWith('image/') && (attachment.dataUrl || attachment.url))
    .map((attachment) => ({
      type: 'image' as const,
      dataUrl: attachment.dataUrl,
      url: attachment.url,
      mimeType: attachment.type,
      name: attachment.name,
      alt: attachment.name,
    }))
}

function compareSessionMessages(a: SessionTranscriptMessage, b: SessionTranscriptMessage): number {
  const aTs = Date.parse(a.timestamp || '')
  const bTs = Date.parse(b.timestamp || '')

  if (Number.isNaN(aTs) && Number.isNaN(bTs)) return 0
  if (Number.isNaN(aTs)) return 1
  if (Number.isNaN(bTs)) return -1
  return aTs - bTs
}
