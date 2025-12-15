import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { loadAndApplyBackground } from './lib/webp'

function applySavedAppearanceSettings() {
  try {
    const saved = localStorage.getItem('app-settings')
    if (!saved) return
    const parsed = JSON.parse(saved)
    const fontSizeMap: Record<string, string> = { '小': '14px', '中': '16px', '大': '18px', '特大': '20px', '超大': '22px' }
    const resolvedFontSize = fontSizeMap[parsed.fontSize as keyof typeof fontSizeMap] || '14px'
    const resolvedLineHeight = '1.6'
    
    document.documentElement.style.setProperty('--global-font-size', resolvedFontSize)
    document.documentElement.style.setProperty('--global-line-height', resolvedLineHeight)
    
    document.documentElement.style.setProperty('--editor-font-size', resolvedFontSize)
    document.documentElement.style.setProperty('--editor-line-height', resolvedLineHeight)

    const familyMap: Record<string, string> = {
      '默认': "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
      '宋体': "'SimSun', 'Songti SC', 'Noto Serif SC', serif",
      '楷体': "'KaiTi', 'Kaiti SC', 'STKaiti', 'Noto Serif SC', serif",
      '黑体': "'Heiti SC', 'SimHei', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
      '微软雅黑': "'Microsoft YaHei', 'Noto Sans SC', sans-serif",
      '思源黑体': "'Noto Sans SC', 'Source Han Sans SC', sans-serif",
      '思源宋体': "'Noto Serif SC', 'Source Han Serif SC', serif",
      '苹方': "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif",
      '仿宋': "'FangSong', 'FZSongYi-Z13', 'Songti SC', 'Noto Serif SC', serif",
      '隶书': "'LiSu', 'STLiti', 'KaiTi', 'Noto Serif SC', serif"
    }
    const resolvedFamily = familyMap[parsed.fontFamily as keyof typeof familyMap] || familyMap['默认']
    document.documentElement.style.setProperty('--editor-font-family', resolvedFamily)

    if (parsed.backgroundImageUrl && parsed.backgroundImageUrl.trim()) {
      loadAndApplyBackground(parsed.backgroundImageUrl)
    }

    if (parsed.logoUrl && parsed.logoUrl.trim()) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        link.type = 'image/x-icon'
        document.head.appendChild(link)
      }
      link.href = parsed.logoUrl
    }

    if (parsed.username && typeof parsed.username === 'string') {
      document.title = parsed.username
    }
  } catch {}
}

function ensureStylesApplied() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySavedAppearanceSettings)
  } else {
    applySavedAppearanceSettings()
  }
}


ensureStylesApplied()


interface ImportMetaEnv {
  DEV?: boolean
}

const isDevelopment = (import.meta as { env?: ImportMetaEnv }).env?.DEV ?? false

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  isDevelopment ? (
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  ) : (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  ),
)