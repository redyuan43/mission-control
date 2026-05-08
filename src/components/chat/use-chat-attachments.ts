'use client'

import { useCallback, useRef, useState } from 'react'
import type { ChatAttachment } from '@/store'

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export function useChatAttachments() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const addFiles = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > MAX_ATTACHMENT_BYTES) continue

      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        if (!dataUrl) return

        setAttachments((current) => [...current, {
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
        }])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachments([])
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files)
    }
  }, [addFiles])

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (let index = 0; index < items.length; index += 1) {
      if (!items[index].type.startsWith('image/')) continue
      const file = items[index].getAsFile()
      if (file) imageFiles.push(file)
    }

    if (imageFiles.length === 0) return

    event.preventDefault()
    addFiles(imageFiles)
  }, [addFiles])

  return {
    attachments,
    clearAttachments,
    fileInputRef,
    isDragOver,
    addFiles,
    removeAttachment,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
  }
}
