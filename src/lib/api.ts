import axios, { AxiosResponse, AxiosError } from 'axios'
import type { 
  ApiResponse, 
  ApiError, 
  Note, 
  NoteCreateRequest, 
  NoteUpdateRequest, 
  LoginRequest, 
  LoginResponse, 
  ChangePasswordRequest, 
  PasswordStatusResponse,
  ImportRequest,
  CloudBackup
} from '@/types'

export const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE || '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(
  (config) => {
    const password = localStorage.getItem('password')
    if (password) {
      config.headers.Authorization = `Bearer ${password}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response: AxiosResponse) => {
    const contentType = response.headers?.['content-type'] || ''
    const isJson = contentType.includes('application/json')
    const data = response.data
    const looksLikeHtml = typeof data === 'string' && data.trim().toLowerCase().startsWith('<!doctype html')
    if (!isJson && looksLikeHtml) {
      const error = new Error('服务返回了 HTML，而不是 JSON。请检查 API 代理或部署路径。') as AxiosError
      error.response = response
      throw error
    }
    return response
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('password')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const notesApi = {
  getNotes: (): Promise<AxiosResponse<Note[]>> => api.get('/api/notes'),
  
  getNote: (id: string): Promise<AxiosResponse<Note>> => api.get(`/api/notes/${id}`),
  
  createNote: (note: NoteCreateRequest): Promise<AxiosResponse<ApiResponse<{ id: string }>>> => 
    api.post('/api/notes', note),
  
  updateNote: (id: string, note: NoteUpdateRequest): Promise<AxiosResponse<ApiResponse>> => 
    api.put(`/api/notes/${id}`, note),
  
  deleteNote: (id: string): Promise<AxiosResponse<ApiResponse>> => 
    api.delete(`/api/notes/${id}`),
  
  importNotes: (request: ImportRequest): Promise<AxiosResponse<ApiResponse>> => 
    api.post('/api/import', request),

  updateNotes: (content: string): Promise<AxiosResponse<ApiResponse>> => 
    api.post('/api/notes', { content }),
}

export const authApi = {
  login: (request: LoginRequest): Promise<AxiosResponse<LoginResponse>> => 
    api.post('/api/login', request),
  
  changePassword: (request: ChangePasswordRequest): Promise<AxiosResponse<ApiResponse>> =>
    api.post('/api/password', request),
  
  getPasswordStatus: (): Promise<AxiosResponse<PasswordStatusResponse>> => 
    api.get('/api/password/status'),
}

export const cloudApi = {
  uploadToCloud: (): Promise<AxiosResponse<ApiResponse>> => 
    api.post('/api/backup'),
  
  downloadFromCloud: (): Promise<AxiosResponse<CloudBackup>> => 
    api.get('/api/backup'),
}

export const logsApi = {
  getLogs: (): Promise<AxiosResponse<any>> => api.get('/api/logs'),
  clearLogs: (): Promise<AxiosResponse<any>> => api.delete('/api/logs'),
}
