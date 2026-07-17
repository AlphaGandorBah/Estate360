import api from '@/lib/apiClient'
import type { Verification } from '@/types'

export const verificationApi = {
  me: () => api.get<Verification>('/verification/me'),
  myStatus: () => api.get<Verification>('/verification/me'),
  submit: (
    d: { document_type: string; notes?: string },
    files: { front: File; back?: File | null; selfie: File },
    onProgress?: (percentage: number | null) => void,
  ) => {
    const fd = new FormData()
    fd.append('document_type', d.document_type)
    if (d.notes) fd.append('notes', d.notes)
    fd.append('document_front', files.front, files.front.name)
    if (files.back) fd.append('document_back', files.back, files.back.name)
    fd.append('selfie', files.selfie, files.selfie.name)
    return api.post<Verification>('/verification/', fd, {
      // Do not set Content-Type here. The browser must add the multipart
      // boundary; forcing the header is a common cause of empty request.FILES.
      onUploadProgress: onProgress
        ? (event) => {
            if (!event.total) {
              onProgress(null)
              return
            }
            onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
          }
        : undefined,
    })
  },
}
