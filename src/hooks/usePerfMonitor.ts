import { useEffect, useRef } from 'react'

interface PerformanceMetrics {
  componentLoadTime: number
  renderTime: number
  totalTime: number
}

export const usePerfMonitor = (componentName: string) => {
  const startTime = useRef(performance.now())
  const renderStartTime = useRef<number | null>(null)

  useEffect(() => {
    const endTime = performance.now()
    const componentLoadTime = endTime - startTime.current
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🚀 ${componentName} 加载完成，耗时: ${componentLoadTime.toFixed(2)}ms`)
    }

  }, [componentName])

  const startRender = () => {
    renderStartTime.current = performance.now()
  }

  const endRender = () => {
    if (renderStartTime.current) {
      const renderTime = performance.now() - renderStartTime.current
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚡ ${componentName} 渲染完成，耗时: ${renderTime.toFixed(2)}ms`)
      }
    }
  }

  return {
    startRender,
    endRender,
    getMetrics: (): PerformanceMetrics => {
      const endTime = performance.now()
      const componentLoadTime = endTime - startTime.current
      const renderTime = renderStartTime.current ? endTime - renderStartTime.current : 0
      
      return {
        componentLoadTime,
        renderTime,
        totalTime: componentLoadTime + renderTime
      }
    }
  }
}
