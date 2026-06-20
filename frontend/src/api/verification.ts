import api from '@/lib/apiClient'
import type { Verification } from '@/types'

export const verificationApi = {
  me: () => api.get<Verification>('/verification/me'),
  myStatus: () => api.get<Verification>('/verification/me'),
  submit: (
    d: { document_type: string; notes?: string },
    files: { front: File; back?: File | null; selfie: File },
  ) => {
    const fd = new FormData()
    fd.append('document_type', d.document_type)
    if (d.notes) fd.append('notes', d.notes)
    fd.append('document_front', files.front)
    if (files.back) fd.append('document_back', files.back)
    fd.append('selfie', files.selfie)
    return api.post<Verification>('/verification/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
