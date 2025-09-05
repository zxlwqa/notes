// API响应类型
export interface ApiResponse<T = any> {
  success?: boolean
  error?: string
  data?: T
}

// 笔记相关类型
export interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface NoteResponse {
  content: string
}

// 认证相关类型
export interface LoginRequest {
  password: string
}

export interface LoginResponse {
  success: boolean
  token?: string
  error?: string
}

// 用户相关类型
export interface User {
  id: string
  username: string
}

// 会话相关类型
export interface Session {
  token: string
  userId: string
  createdAt: Date
}

// 编辑器相关类型
export interface EditorConfig {
  height: string
  language: string
  toolbarItems: string[][]
}

// 组件Props类型
export interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export interface InputProps {
  type?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  className?: string
}

// 路由相关类型
export interface RouteConfig {
  path: string
  element: React.ComponentType
  protected?: boolean
}

// 错误处理类型
export interface AppError {
  message: string
  code?: string
  details?: any
}

// 主题相关类型
export interface Theme {
  name: string
  primary: string
  secondary: string
  background: string
  text: string
}

// 设置相关类型
export interface AppSettings {
  fontSize: string
  backgroundImageUrl: string
  fontFamily: string
  theme: string
  autoSave: boolean
  spellCheck: boolean
  syntaxHighlight: boolean
  lineNumbers: boolean
  username: string
  emailNotification: boolean
  shortcutHints: boolean
  autoLock: boolean
  lockTimeout: string
  passwordStrength: string
}

// 搜索相关类型
export interface SearchResult {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
  displayText: string
  matchType: 'title' | 'content' | 'tag'
}

export interface SearchHistory {
  id: string
  query: string
  timestamp: number
  resultCount: number
}

export interface SearchOptions {
  useRegex: boolean
  caseSensitive: boolean
  searchInTitle: boolean
  searchInContent: boolean
  searchInTags: boolean
}

// 防抖和节流选项类型
export interface DebounceOptions {
  leading?: boolean
  trailing?: boolean
}

export interface ThrottleOptions {
  leading?: boolean
  trailing?: boolean
}

// 密码相关类型
export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface PasswordStatusResponse {
  source: 'd1' | 'env'
  hasPassword: boolean
}

// 导入相关类型
export interface ImportRequest {
  content: string
  format: ImportFormat
}

export type ImportFormat = 'markdown' | 'text' | 'json'

// 云备份相关类型
export interface CloudBackup {
  success: boolean
  url?: string
  fileName?: string
  totalNotes?: number
  uploadTime?: string
  error?: string
}

// 笔记创建和更新请求类型
export interface NoteCreateRequest {
  title: string
  content: string
  tags?: string[]
}

export interface NoteUpdateRequest {
  title: string
  content: string
  tags?: string[]
}

// 事件类型
export interface SettingsChangedEvent extends CustomEvent {
  detail: AppSettings
}

export interface NotesImportedEvent extends CustomEvent {
  detail: {
    count: number
    format: ImportFormat
  }
}
