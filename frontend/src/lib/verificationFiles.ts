export const DOCUMENT_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'
export const SELFIE_ACCEPT = '.jpg,.jpeg,.png,image/jpeg,image/png'

const MAX_FILE_SIZE = 8 * 1024 * 1024
const DOCUMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])
const SELFIE_MIME_TYPES = new Set(['image/jpeg', 'image/png'])

export type PreparedVerificationFile =
  | { file: File; error: '' }
  | { file: null; error: string }

function inferredMimeType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'pdf') return 'application/pdf'
  return ''
}

export function prepareVerificationFile(
  source: File,
  kind: 'document' | 'selfie',
): PreparedVerificationFile {
  if (source.size === 0) {
    return { file: null, error: 'This file is empty. Please choose another file.' }
  }
  if (source.size > MAX_FILE_SIZE) {
    return { file: null, error: 'The file is larger than 8 MB. Please choose a smaller file.' }
  }

  const declaredType = source.type.toLowerCase()
  const mimeType = declaredType && declaredType !== 'application/octet-stream'
    ? declaredType === 'image/jpg' ? 'image/jpeg' : declaredType
    : inferredMimeType(source.name)
  const allowedTypes = kind === 'document' ? DOCUMENT_MIME_TYPES : SELFIE_MIME_TYPES

  if (!allowedTypes.has(mimeType)) {
    const formats = kind === 'document' ? 'JPG, PNG, or PDF' : 'JPG or PNG'
    return { file: null, error: `Unsupported file format. Please use ${formats}.` }
  }

  // Some mobile browsers provide an empty or non-standard MIME type. Give the
  // multipart part the normalized type expected by the API in that case.
  const file = source.type === mimeType
    ? source
    : new File([source], source.name, { type: mimeType, lastModified: source.lastModified })
  return { file, error: '' }
}
