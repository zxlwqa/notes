import React from 'react'
import Loading from './Loading'

interface PageLoadingProps {
  text?: string
  size?: 'sm' | 'md' | 'lg'
}

const PageLoading: React.FC<PageLoadingProps> = ({ 
  text = '加载中...', 
  size = 'lg' 
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100/60 to-gray-200/60">
      <div className="text-center">
        <Loading size={size} text={text} />
        <div className="mt-4 text-sm text-gray-500">
          请稍候，正在为您准备内容...
        </div>
      </div>
    </div>
  )
}

export default PageLoading
