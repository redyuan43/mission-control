export interface ChatAttachmentPayload {
  name: string
  type: string
  size: number
  dataUrl?: string
  url?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isValidImageDataUrl(value: string): boolean {
  return /^data:image\/[^;]+;base64,/i.test(value)
}

function isValidImageUrl(value: string): boolean {
  return /^(https?:\/\/|data:image\/)/i.test(value)
}

export function normalizeChatAttachments(value: unknown): ChatAttachmentPayload[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []

    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    const type = typeof entry.type === 'string' ? entry.type.trim() : ''
    const size = typeof entry.size === 'number' && Number.isFinite(entry.size) && entry.size >= 0 ? entry.size : 0
    const dataUrl = typeof entry.dataUrl === 'string' ? entry.dataUrl.trim() : ''
    const url = typeof entry.url === 'string' ? entry.url.trim() : ''

    if (!name || !type) return []
    if (!dataUrl && !url) return []
    if (dataUrl && !isValidImageDataUrl(dataUrl)) return []
    if (url && !isValidImageUrl(url)) return []

    return [{
      name,
      type,
      size,
      dataUrl: dataUrl || undefined,
      url: url || undefined,
    }]
  })
}

export function mergeMetadataWithAttachments(
  metadata: unknown,
  attachments: ChatAttachmentPayload[],
): Record<string, unknown> | null {
  const base = isRecord(metadata) ? { ...metadata } : {}

  if (attachments.length > 0) {
    base.attachments = attachments
  }

  return Object.keys(base).length > 0 ? base : null
}

export function splitAttachmentsFromMetadata(metadata: unknown): {
  attachments: ChatAttachmentPayload[]
  metadata: Record<string, unknown> | null
} {
  if (!isRecord(metadata)) {
    return { attachments: [], metadata: null }
  }

  const nextMetadata = { ...metadata }
  const attachments = normalizeChatAttachments(nextMetadata.attachments)
  delete nextMetadata.attachments

  return {
    attachments,
    metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : null,
  }
}
