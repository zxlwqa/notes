import { type ClassValue, clsx } from 'clsx'
import type { DebounceOptions, ThrottleOptions } from '@/types'

/**
 * 合并CSS类名
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/**
 * 格式化日期
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return '刚刚'
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)}分钟前`
  } else if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)}小时前`
  } else if (diffInSeconds < 2592000) {
    return `${Math.floor(diffInSeconds / 86400)}天前`
  } else {
    return formatDate(date)
  }
}

/**
 * 生成随机ID
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options: DebounceOptions = {}
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  let lastCallTime = 0
  let lastInvokeTime = 0

  const { leading = false, trailing = true } = options

  function debounced(...args: Parameters<T>) {
    const time = Date.now()
    const isInvoking = leading && (time - lastInvokeTime) >= wait

    lastCallTime = time

    if (isInvoking) {
      lastInvokeTime = time
      func.apply(this, args)
    } else {
      if (timeout) {
        clearTimeout(timeout)
      }

      if (trailing) {
        timeout = setTimeout(() => {
          lastInvokeTime = Date.now()
          func.apply(this, args)
        }, wait)
      }
    }
  }

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }

  return debounced
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number,
  options: ThrottleOptions = {}
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  let lastCallTime = 0
  let lastInvokeTime = 0

  const { leading = true, trailing = true } = options

  function throttled(...args: Parameters<T>) {
    const time = Date.now()
    const timeSinceLastInvoke = time - lastInvokeTime
    const timeSinceLastCall = time - lastCallTime

    lastCallTime = time

    if (timeSinceLastInvoke >= limit) {
      lastInvokeTime = time
      func.apply(this, args)
    } else if (trailing && timeSinceLastCall >= limit) {
      if (timeout) {
        clearTimeout(timeout)
      }

      timeout = setTimeout(() => {
        lastInvokeTime = Date.now()
        func.apply(this, args)
      }, limit - timeSinceLastInvoke)
    }
  }

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }

  return throttled
}

/**
 * 本地存储工具
 */
export const storage = {
  get: <T>(key: string, defaultValue?: T): T | null => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue || null
    } catch {
      return defaultValue || null
    }
  },
  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      console.error('Failed to save to localStorage')
    }
  },
  remove: (key: string): void => {
    localStorage.removeItem(key)
  },
  clear: (): void => {
    localStorage.clear()
  },
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 降级方案
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      return true
    } catch {
      return false
    } finally {
      document.body.removeChild(textArea)
    }
  }
}

/**
 * 下载文件
 */
export function downloadFile(content: string, filename: string, type = 'text/plain'): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 验证密码强度
 */
export function validatePassword(password: string): {
  isValid: boolean
  strength: 'weak' | 'medium' | 'strong'
  message: string
} {
  if (password.length < 6) {
    return {
      isValid: false,
      strength: 'weak',
      message: '密码至少需要6个字符',
    }
  }

  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)

  if (hasLetter && hasNumber && hasSpecial && password.length >= 8) {
    return {
      isValid: true,
      strength: 'strong',
      message: '密码强度：强',
    }
  } else if ((hasLetter && hasNumber) || (hasLetter && hasSpecial) || (hasNumber && hasSpecial)) {
    return {
      isValid: true,
      strength: 'medium',
      message: '密码强度：中等',
    }
  } else {
    return {
      isValid: true,
      strength: 'weak',
      message: '密码强度：弱',
    }
  }
}
