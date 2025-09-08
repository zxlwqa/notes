/**
 * 预加载并应用背景图
 * @param imageUrl 背景图URL
 * @param onSuccess 成功回调
 * @param onError 失败回调
 */
export function loadAndApplyBackground(
  imageUrl: string | null | undefined,
  onSuccess?: () => void,
  onError?: () => void
) {
  const bg = imageUrl?.trim()
  
  if (!bg) {
    document.documentElement.style.removeProperty('--app-bg-image')
    onSuccess?.()
    return
  }

  const img = new Image()
  
  img.onload = () => {
    document.documentElement.style.setProperty('--app-bg-image', `url('${bg}')`)
    onSuccess?.()
  }
  
  img.onerror = () => {
    document.documentElement.style.removeProperty('--app-bg-image')
    onError?.()
  }
  
  img.src = bg
}

/**
 * 从localStorage获取设置并应用背景图
 * @param onSuccess 成功回调
 * @param onError 失败回调
 */
export function applyBackgroundFromSettings(
  onSuccess?: () => void,
  onError?: () => void
) {
  try {
    const saved = localStorage.getItem('app-settings')
    if (!saved) {
      onSuccess?.()
      return
    }
    
    const parsed = JSON.parse(saved)
    loadAndApplyBackground(parsed.backgroundImageUrl, onSuccess, onError)
  } catch (error) {
    console.error('Failed to apply background from settings:', error)
    onError?.()
  }
}

/**
 * 预加载背景图（不立即应用）
 * @param imageUrl 背景图URL
 * @returns Promise<boolean> 加载是否成功
 */
export function preloadBackground(imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = imageUrl
  })
}
