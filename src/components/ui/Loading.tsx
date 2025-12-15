import React from 'react'

interface LoadingProps {
  text?: string
  size?: 'sm' | 'md' | 'lg'
}

const Loading: React.FC<LoadingProps> = ({ 
  text = '加载中...', 
  size = 'lg' 
}) => {
  const sizeClasses: Record<string, string> = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8', 
    lg: 'h-12 w-12'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100/60 to-gray-200/60">
      <div className="text-center">
        <div className={`animate-spin rounded-full border-b-2 border-primary-500 mx-auto ${sizeClasses[size]}`}></div>
        <div className="mt-4 text-sm text-gray-500">
          {text}
        </div>
        <div className="mt-2 text-xs text-gray-400">
          请稍候，正在为您准备内容...
        </div>
      </div>
    </div>
  )
}

export default Loading
