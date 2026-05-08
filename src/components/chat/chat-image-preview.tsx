'use client'

import { useState } from 'react'

interface ChatImagePreviewProps {
  src: string
  alt: string
  className?: string
  caption?: string
}

export function ChatImagePreview({
  src,
  alt,
  className = 'h-16 w-16 object-cover',
  caption,
}: ChatImagePreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="overflow-hidden rounded-md border border-border/30 bg-black/10"
      >
        <img
          src={src}
          alt={alt}
          className={className}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1 text-sm text-white/90 hover:bg-black/80"
          >
            Close
          </button>
          <div
            className="max-h-full max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={src}
              alt={alt}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            />
            {caption && (
              <div className="mt-2 text-center text-xs text-white/80">{caption}</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
