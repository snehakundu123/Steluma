'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageUploadProps {
  value?: string          // current URL or CID
  onChange: (cid: string, url: string) => void
  onClear?: () => void
  label?: string
  hint?: string
  className?: string
  aspectRatio?: 'banner' | 'square'
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function ImageUpload({
  value,
  onChange,
  onClear,
  label = 'Upload Image',
  hint = 'PNG, JPG, WEBP up to 10MB',
  className,
  aspectRatio = 'banner',
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setError(null)
    setIsUploading(true)
    try {
      const token = localStorage.getItem('steluma:access_token')
      const form = new FormData()
      form.append('file', file)

      const res = await fetch(`${API}/api/v1/upload/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message ?? 'Upload failed')
      }

      const { cid, url } = await res.json()
      onChange(cid, url)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [])

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }, [])

  const aspectClass = aspectRatio === 'banner' ? 'aspect-[3/1]' : 'aspect-square'

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border-2 border-dashed transition-colors',
          aspectClass,
          isDragging ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300',
          value && 'border-solid border-gray-200',
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !value && inputRef.current?.click()}
      >
        {value ? (
          <>
            <img src={value} alt="Preview" className="h-full w-full object-cover" />
            {onClear && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClear() }}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            {isUploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="text-sm text-gray-500">Uploading to IPFS...</p>
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
                  <ImageIcon className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-1 flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" /> Browse files
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <X className="h-3 w-3" /> {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
