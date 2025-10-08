export interface ApiResponse<T = any> {
  success?: boolean
  error?: string
  data?: T
}

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

export interface LoginRequest {
  password: string
}

export interface LoginResponse {
  success: boolean
  token?: string
  error?: string
}

export interface User {
  id: string
  username: string
}

export interface Session {
  token: string
  userId: string
  createdAt: Date
}

export interface EditorConfig {
  height: string
  language: string
  toolbarItems: string[][]
}

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

export interface RouteConfig {
  path: string
  element: React.ComponentType
  protected?: boolean
}

export interface AppError {
  message: string
  code?: string
  details?: any
}

export interface Theme {
  name: string
  primary: string
  secondary: string
  background: string
  text: string
}

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

export interface DebounceOptions {
  leading?: boolean
  trailing?: boolean
}

export interface ThrottleOptions {
  leading?: boolean
  trailing?: boolean
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface PasswordStatusResponse {
  source: 'd1' | 'env' | 'postgresql'
  hasPassword: boolean
  usingD1?: boolean
  usingPostgreSQL?: boolean
  passwordSource?: 'd1' | 'env' | 'postgresql'
}

export interface ImportRequest {
  content: string
  format: ImportFormat
}

export type ImportFormat = 'markdown' | 'text' | 'json'

export interface CloudBackup {
  success: boolean
  url?: string
  fileName?: string
  totalNotes?: number
  uploadTime?: string
  error?: string
}

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

export interface SettingsChangedEvent extends CustomEvent {
  detail: AppSettings
}

export interface NotesImportedEvent extends CustomEvent {
  detail: {
    count: number
    format: ImportFormat
  }
}

