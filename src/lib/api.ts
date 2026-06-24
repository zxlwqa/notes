import axios, { AxiosResponse, AxiosError } from 'axios'
import {
  decryptContent,
  encryptContent,
  encryptField,
  decryptField,
  encryptTags,
  decryptTags,
  getEncryptionPassword,
  isEncryptedContent,
} from '@/lib/crypto'
import { prepareImportPayload } from '@/lib/backup'
import { getSessionToken, clearSessionToken } from '@/lib/session'
import type {
  ApiResponse,
  Note,
  NotesListResponse,
  NoteCreateRequest,
  NoteUpdateRequest,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  PasswordStatusResponse,
  ImportRequest,
  CloudBackup,
} from '@/types'

interface ImportMetaEnv {
  VITE_API_BASE?: string
}

export const api = axios.create({
  baseURL: (import.meta as { env?: ImportMetaEnv }).env?.VITE_API_BASE || '',
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(
  (config) => {
    const token = getSessionToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response: AxiosResponse) => {
    const contentType = String(response.headers?.['content-type'] ?? '')
    const isJson = contentType.includes('application/json')
    const data = response.data
    const looksLikeHtml =
      typeof data === 'string' && data.trim().toLowerCase().startsWith('<!doctype html')
    if (!isJson && looksLikeHtml) {
      const error = new Error(
        '服务返回了 HTML，而不是 JSON。请检查 API 代理或部署路径。'
      ) as AxiosError
      error.response = response
      throw error
    }
    return response
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearSessionToken()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

async function decryptNote(note: Note, password: string): Promise<Note> {
  const result = { ...note }
  if (note.title && isEncryptedContent(note.title)) {
    result.title = await decryptField(note.title, password)
  }
  if (note.tags?.length) {
    const tagsSource =
      note.tags.length === 1 && isEncryptedContent(note.tags[0])
        ? note.tags[0]
        : JSON.stringify(note.tags)
    result.tags = await decryptTags(tagsSource, password)
  }
  if (note.content) {
    if (isEncryptedContent(note.content)) {
      result.content = await decryptContent(note.content, password)
    }
  }
  return result
}

async function encryptNotePayload(
  note: NoteUpdateRequest,
  password: string
): Promise<NoteUpdateRequest> {
  const payload = { ...note }
  if (payload.title) {
    payload.title = await encryptField(payload.title, password)
  }
  if (payload.tags?.length) {
    payload.tags = [await encryptTags(payload.tags, password)]
  }
  if (payload.content) {
    payload.content = await encryptContent(payload.content, password)
  }
  return payload
}

async function maybeMigratePlaintext(note: Note, password: string): Promise<void> {
  const needsTitle = note.title && !isEncryptedContent(note.title)
  const needsTags =
    note.tags?.length && !(note.tags.length === 1 && isEncryptedContent(note.tags[0]))
  const needsContent = note.content && !isEncryptedContent(note.content)
  if (!needsTitle && !needsTags && !needsContent) return

  const encrypted = await encryptNotePayload(
    {
      title: note.title,
      tags: note.tags,
      ...(note.content !== undefined ? { content: note.content } : {}),
    },
    password
  )
  void api.put(`/api/notes/${note.id}`, encrypted)
}

export const notesApi = {
  getNotes: async (): Promise<AxiosResponse<Note[]>> => {
    const response = await api.get<Note[]>('/api/notes')
    const password = getEncryptionPassword()
    if (password && Array.isArray(response.data)) {
      response.data = await Promise.all(response.data.map((n) => decryptNote(n, password)))
    }
    return response
  },

  getNotesPage: async (page = 1, limit = 30): Promise<AxiosResponse<NotesListResponse>> => {
    const response = await api.get<NotesListResponse>('/api/notes', { params: { page, limit } })
    const password = getEncryptionPassword()
    if (password && response.data?.items) {
      response.data.items = await Promise.all(
        response.data.items.map((n) => decryptNote(n, password))
      )
    }
    return response
  },

  getAllSummaries: async (): Promise<Note[]> => {
    const all: Note[] = []
    let page = 1
    const limit = 100
    while (true) {
      const { data } = await notesApi.getNotesPage(page, limit)
      all.push(...data.items)
      if (!data.hasMore) break
      page += 1
    }
    return all
  },

  getNoteRaw: (id: string): Promise<AxiosResponse<Note>> => api.get<Note>(`/api/notes/${id}`),

  getNote: async (id: string): Promise<AxiosResponse<Note>> => {
    const response = await api.get<Note>(`/api/notes/${id}`)
    const password = getEncryptionPassword()
    if (password && response.data) {
      const raw = { ...response.data }
      response.data = await decryptNote(response.data, password)
      void maybeMigratePlaintext(raw, password)
    }
    return response
  },

  createNote: async (
    note: NoteCreateRequest
  ): Promise<AxiosResponse<ApiResponse<{ id: string }>>> => {
    const password = getEncryptionPassword()
    const payload = password ? await encryptNotePayload(note, password) : note
    return api.post('/api/notes', payload as NoteCreateRequest)
  },

  updateNote: async (id: string, note: NoteUpdateRequest): Promise<AxiosResponse<ApiResponse>> => {
    const password = getEncryptionPassword()
    const payload = password ? await encryptNotePayload(note, password) : note
    return api.put(`/api/notes/${id}`, payload)
  },

  updateNoteRaw: (id: string, note: NoteUpdateRequest): Promise<AxiosResponse<ApiResponse>> =>
    api.put(`/api/notes/${id}`, note),

  deleteNote: (id: string): Promise<AxiosResponse<ApiResponse>> => api.delete(`/api/notes/${id}`),

  importNotes: async (request: ImportRequest): Promise<AxiosResponse<ApiResponse>> => {
    if (!request.content) {
      return api.post('/api/import', { notes: [] })
    }

    try {
      const format =
        request.format === 'json' ? 'json' : request.format === 'text' ? 'text' : 'markdown'
      const notes = await prepareImportPayload(request.content, format)
      return api.post('/api/import', { notes })
    } catch {
      return api.post('/api/import', { notes: [] })
    }
  },

  updateNotes: async (content: string): Promise<AxiosResponse<ApiResponse>> => {
    const password = getEncryptionPassword()
    const payload = password ? await encryptContent(content, password) : content
    return api.post('/api/notes', { content: payload })
  },
}

export interface SessionResponse {
  authenticated: boolean
}

export interface RecoveryStatusResponse {
  configured: boolean
}

export interface RecoverySetupResponse {
  success: boolean
  recoveryCode?: string
}

export const authApi = {
  login: (request: LoginRequest): Promise<AxiosResponse<LoginResponse>> =>
    api.post('/api/login', request),

  logout: (): Promise<AxiosResponse<ApiResponse>> => api.post('/api/logout'),

  getSession: (): Promise<AxiosResponse<SessionResponse>> => api.get('/api/session'),

  changePassword: (request: ChangePasswordRequest): Promise<AxiosResponse<ApiResponse>> =>
    api.post('/api/password', request),

  getPasswordStatus: (): Promise<AxiosResponse<PasswordStatusResponse>> =>
    api.get('/api/password/status'),

  getRecoveryStatus: (): Promise<AxiosResponse<RecoveryStatusResponse>> =>
    api.get('/api/recovery/status'),

  setupRecovery: (): Promise<AxiosResponse<RecoverySetupResponse>> =>
    api.post('/api/recovery/setup'),

  resetWithRecovery: (
    recoveryCode: string,
    newPassword: string
  ): Promise<AxiosResponse<ApiResponse>> =>
    api.post('/api/recovery/reset', { recoveryCode, newPassword }),
}

export const cloudApi = {
  uploadToCloud: (): Promise<AxiosResponse<ApiResponse>> => api.post('/api/backup'),

  downloadFromCloud: (): Promise<AxiosResponse<CloudBackup>> => api.get('/api/backup'),
}

export const gistApi = {
  uploadToGist: (): Promise<AxiosResponse<ApiResponse>> => api.post('/api/gist'),

  downloadFromGist: (): Promise<AxiosResponse<CloudBackup>> => api.get('/api/gist'),
}

export const r2Api = {
  uploadToR2: (): Promise<AxiosResponse<ApiResponse>> => api.post('/api/r2'),

  downloadFromR2: (): Promise<AxiosResponse<CloudBackup>> => api.get('/api/r2'),
}

export interface LogEntry {
  id: string
  level: string
  message: string
  meta?: string
  created_at: string
}

export interface LogsResponse {
  success: boolean
  logs?: LogEntry[]
}

export const logsApi = {
  getLogs: (): Promise<AxiosResponse<LogsResponse>> => api.get('/api/logs'),
  clearLogs: (): Promise<AxiosResponse<ApiResponse>> => api.delete('/api/logs'),
}

export type OrderData = string[] | { [key: string]: unknown }

export const orderApi = {
  getOrder: (key: string): Promise<AxiosResponse<{ success: boolean; data: OrderData | null }>> =>
    api.get(`/api/order/${key}`),

  saveOrder: (key: string, data: OrderData): Promise<AxiosResponse<ApiResponse>> =>
    api.post(`/api/order/${key}`, data),
}
