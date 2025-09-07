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

// 创建axios实例
export const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE || '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 - 添加认证密码
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

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // 防止将整页 HTML 当作 JSON 使用
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
      // 清除无效密码
      localStorage.removeItem('password')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// API函数
export const notesApi = {
  // 获取所有笔记
  getNotes: (): Promise<AxiosResponse<Note[]>> => api.get('/api/notes'),
  
  // 获取单个笔记
  getNote: (id: string): Promise<AxiosResponse<Note>> => api.get(`/api/notes/${id}`),
  
  // 创建新笔记
  createNote: (note: NoteCreateRequest): Promise<AxiosResponse<ApiResponse<{ id: string }>>> => 
    api.post('/api/notes', note),
  
  // 更新笔记
  updateNote: (id: string, note: NoteUpdateRequest): Promise<AxiosResponse<ApiResponse>> => 
    api.put(`/api/notes/${id}`, note),
  
  // 删除笔记
  deleteNote: (id: string): Promise<AxiosResponse<ApiResponse>> => 
    api.delete(`/api/notes/${id}`),
  
  // 导入笔记
  importNotes: (request: ImportRequest): Promise<AxiosResponse<ApiResponse>> => 
    api.post('/api/import', request),

  // 兼容旧版本
  updateNotes: (content: string): Promise<AxiosResponse<ApiResponse>> => 
    api.post('/api/notes', { content }),
}

export const authApi = {
  login: (request: LoginRequest): Promise<AxiosResponse<LoginResponse>> => 
    api.post('/api/login', request),
  
  changePassword: (request: ChangePasswordRequest): Promise<AxiosResponse<ApiResponse>> =>
    api.post('/api/password', request),
  
  // 获取密码状态（可选，用于前端显示当前密码来源）
  getPasswordStatus: (): Promise<AxiosResponse<PasswordStatusResponse>> => 
    api.get('/api/password/status'),
}

export const cloudApi = {
  // 上传笔记到云端（使用现有的backup.ts API）
  uploadToCloud: (): Promise<AxiosResponse<ApiResponse>> => 
    api.post('/api/backup'),
  
  // 从云端下载笔记（使用现有的backup.ts API）
  downloadFromCloud: (): Promise<AxiosResponse<CloudBackup>> => 
    api.get('/api/backup'),
}

// 日志相关 API
export const logsApi = {
  // 获取后端 Functions/API 调用日志
  getLogs: (): Promise<AxiosResponse<any>> => api.get('/api/logs'),
}
