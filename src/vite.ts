/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_APP_TITLE: string
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// 扩展全局 Window 接口
declare global {
  interface Window {
    // 自定义事件类型
    addEventListener(
      type: 'settings-changed',
      listener: (event: CustomEvent<Partial<import('./types').AppSettings>>) => void,
      options?: boolean | AddEventListenerOptions
    ): void
    addEventListener(
      type: 'notes-imported',
      listener: (event: CustomEvent<{ count: number; format: import('./types').ImportFormat }>) => void,
      options?: boolean | AddEventListenerOptions
    ): void
    addEventListener(
      type: 'note-created',
      listener: (event: CustomEvent<import('./types').Note>) => void,
      options?: boolean | AddEventListenerOptions
    ): void
    addEventListener(
      type: 'note-updated',
      listener: (event: CustomEvent<import('./types').Note>) => void,
      options?: boolean | AddEventListenerOptions
    ): void
    addEventListener(
      type: 'note-deleted',
      listener: (event: CustomEvent<{ id: string; title: string }>) => void,
      options?: boolean | AddEventListenerOptions
    ): void
  }
}

export {}
