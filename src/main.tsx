import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { loadAndApplyBackground } from './lib/background'

// 在应用启动时应用已保存的外观设置
function applySavedAppearanceSettings() {
  try {
    const saved = localStorage.getItem('app-settings')
    if (!saved) return
    const parsed = JSON.parse(saved)
    const fontSizeMap: Record<string, string> = { '小': '12px', '中': '14px', '大': '16px', '特大': '18px', '超大': '20px' }
    const resolvedFontSize = fontSizeMap[parsed.fontSize as keyof typeof fontSizeMap] || '14px'
    const resolvedLineHeight = '1.6'
    
    // 设置全局字体大小
    document.documentElement.style.setProperty('--global-font-size', resolvedFontSize)
    document.documentElement.style.setProperty('--global-line-height', resolvedLineHeight)
    
    // 保持编辑器字体大小设置（向后兼容）
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

    // 使用统一的背景图管理工具
    loadAndApplyBackground(parsed.backgroundImageUrl)

    if (parsed.username && typeof parsed.username === 'string') {
      document.title = parsed.username
    }
  } catch {}
}

// 确保样式在DOM完全加载后应用
function ensureStylesApplied() {
  // 等待DOM完全加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySavedAppearanceSettings)
  } else {
    applySavedAppearanceSettings()
  }
}

// 确保样式在DOM完全加载后应用
ensureStylesApplied()

// 在生产环境中禁用 StrictMode 以避免编辑器双重渲染问题
const isDevelopment = import.meta.env.DEV

ReactDOM.createRoot(document.getElementById('root')!).render(
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
