import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { usersApi, verificationApi } from '@/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/utils'
import { formatDate } from '@/lib/intl'
import Avatar from '@/components/common/Avatar'
import type { User } from '@/types'

const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function AccountPage() {
  const qc = useQueryClient()
  const { user: authUser, setAuth, access } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [profileDraft, setProfileDraft] = useState<{
    userId: string
    fullName: string
    phone: string
  } | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.me().then((r) => r.data),
  })

  const { data: verification } = useQuery({
    queryKey: ['my-verification'],
    queryFn: () => verificationApi.myStatus().then((r) => r.data).catch(() => null),
    enabled: !!user && user.role !== 'admin',
  })

  const currentDraft = profileDraft?.userId === user?.id ? profileDraft : null
  const fullName = currentDraft?.fullName ?? user?.full_name ?? ''
  const phone = currentDraft?.phone ?? user?.phone ?? ''

  const updateProfileDraft = (field: 'fullName' | 'phone', value: string) => {
    if (!user) return
    setProfileDraft((current) => {
      const base = current?.userId === user.id
        ? current
        : { userId: user.id, fullName: user.full_name, phone: user.phone }
      return { ...base, [field]: value }
    })
  }

  const updateMut = useMutation({
    mutationFn: () => usersApi.updateMe({ full_name: fullName, phone }),
    onSuccess: () => { setSuccess(true); setError('') },
    onError: (err) => setError(getErrorMessage(err, 'Failed to update profile')),
  })

  // Keep the navbar's avatar in sync immediately, since it reads from the
  // auth store rather than this page's own ['me'] query.
  const syncAvatar = (updated: User) => {
    qc.setQueryData(['me'], updated)
    if (authUser && access) setAuth(access, { ...authUser, avatar_url: updated.avatar_url })
  }

  const avatarUploadMut = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file).then((r) => r.data),
    onSuccess: (updated) => { syncAvatar(updated); setError('') },
    onError: (err) => setError(getErrorMessage(err, 'Failed to upload photo')),
  })

  const avatarDeleteMut = useMutation({
    mutationFn: () => usersApi.deleteAvatar().then((r) => r.data),
    onSuccess: (updated) => { syncAvatar(updated); setError('') },
    onError: (err) => setError(getErrorMessage(err, 'Failed to remove photo')),
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      setError('Use a JPG, PNG, or WEBP image.')
      return
    }
    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      setError('Image must be 5 MB or smaller.')
      return
    }
    avatarUploadMut.mutate(file)
  }

  const [deleteReason, setDeleteReason] = useState('')

  const { data: deletionRequest, isLoading: deletionLoading } = useQuery({
    queryKey: ['my-deletion-request'],
    queryFn: () => usersApi.getDeletionRequest().then((r) => r.data as {
      id: number; status: 'pending' | 'approved' | 'rejected'; reason: string;
      requested_at: string; resolution_notes: string
    }),
    retry: (count, err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      return status !== 404 && count < 2
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => usersApi.requestDeletion(deleteReason),
    onSuccess: () => {
      setShowDelete(false)
      setDeleteReason('')
      qc.invalidateQueries({ queryKey: ['my-deletion-request'] })
    },
    onError: (err) => setError(getErrorMessage(err, 'Failed to submit deletion request')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSuccess(false)
    updateMut.mutate()
  }

  if (isLoading || !user) return <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Account</h1>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</div>}
      {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-400">Profile updated.</div>}

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <Avatar name={user.full_name} imageUrl={user.avatar_url} size="lg" />
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">{user.full_name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {user.email} · {user.role} · Joined {formatDate(user.date_joined)}
              {user.is_verified && <span className="ml-2 text-emerald-600 dark:text-emerald-400">Verified</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-sm">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploadMut.isPending}
                className="font-medium text-emerald-600 hover:underline disabled:opacity-50 dark:text-emerald-400"
              >
                {avatarUploadMut.isPending ? 'Uploading…' : user.avatar_url ? 'Change photo' : 'Add photo'}
              </button>
              {user.avatar_url && (
                <button
                  type="button"
                  onClick={() => avatarDeleteMut.mutate()}
                  disabled={avatarDeleteMut.isPending}
                  className="font-medium text-gray-500 hover:underline disabled:opacity-50 dark:text-gray-400"
                >
                  {avatarDeleteMut.isPending ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="label">Full name</label>
            <input value={fullName} onChange={(e) => updateProfileDraft('fullName', e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={phone} onChange={(e) => updateProfileDraft('phone', e.target.value)} className="input" />
          </div>
          <button type="submit" disabled={updateMut.isPending}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {updateMut.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      {/* Verification status notice — only for non-admin, non-verified users */}
      {user.role !== 'admin' && !user.is_verified && (
        <div className={`rounded-xl border p-5 ${
          verification?.status === 'pending'
            ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20'
            : verification?.status === 'rejected'
            ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
            : 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {verification?.status === 'pending'
                  ? 'Identity verification under review'
                  : verification?.status === 'rejected'
                  ? 'Identity verification rejected'
                  : 'Identity verification required'}
              </div>
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {verification?.status === 'pending'
                  ? 'Your documents are being reviewed. You will be notified once approved — this usually takes 1–2 business days.'
                  : verification?.status === 'rejected'
                  ? `Your submission was rejected: ${verification.notes || 'Please resubmit valid documents.'}. You must resubmit to access platform features.`
                  : 'You must submit a government-issued ID and a selfie before you can use Estate360 features. Your account is currently restricted.'}
              </div>
            </div>
            {verification?.status !== 'pending' && (
              <Link to="/verification"
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                {verification?.status === 'rejected' ? 'Resubmit' : 'Verify now'}
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-gray-800">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Request account deletion</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Your request will be reviewed by our team. Once approved, your account and listings will be permanently deactivated.
        </p>

        {deletionLoading ? (
          <div className="mt-3 h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
        ) : deletionRequest?.status === 'pending' ? (
          <div className="mt-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            Your deletion request is under review. Our team will respond shortly.
          </div>
        ) : deletionRequest?.status === 'approved' ? (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Your deletion request has been approved. Your account will be deactivated soon.
            {deletionRequest.resolution_notes && (
              <div className="mt-1 font-medium">Note: {deletionRequest.resolution_notes}</div>
            )}
          </div>
        ) : deletionRequest?.status === 'rejected' ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              Your previous deletion request was rejected.
              {deletionRequest.resolution_notes && (
                <div className="mt-1">
                  <span className="font-medium">Admin note: </span>{deletionRequest.resolution_notes}
                </div>
              )}
            </div>
            <button onClick={() => setShowDelete(true)}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
              Submit a new request
            </button>
          </div>
        ) : (
          <button onClick={() => setShowDelete(true)}
            className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
            Request account deletion
          </button>
        )}
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Request account deletion</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Your request will be reviewed by an admin before your account is deleted. You may optionally provide a reason.
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={3}
              placeholder="Reason for deletion (optional)…"
              className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setShowDelete(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm text-white disabled:opacity-50">
                {deleteMut.isPending ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
