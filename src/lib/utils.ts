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

/**
 * 标签颜色配置
 */
export const TAG_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200' },
  { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
  { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200' },
  { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-200' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
] as const

/**
 * 根据标签名称生成一致的颜色
 */
export function getTagColor(tagName: string): typeof TAG_COLORS[0] {
  // 使用标签名称的哈希值来确保相同标签总是得到相同颜色
  let hash = 0
  for (let i = 0; i < tagName.length; i++) {
    const char = tagName.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // 转换为32位整数
  }
  
  // 确保索引为正数
  const index = Math.abs(hash) % TAG_COLORS.length
  return TAG_COLORS[index]
}

/**
 * 获取标签的CSS类名
 */
export function getTagClassName(tagName: string): string {
  const color = getTagColor(tagName)
  return `${color.bg} ${color.text} ${color.border}`
}
