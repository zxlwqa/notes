import React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  
  // 应用全局字体大小
  const globalFontSize = 'var(--global-font-size, 14px)'
  
  const variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    secondary: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
  }
  
  const sizeClasses = {
    sm: 'px-3 py-1.5',
    md: 'px-4 py-2',
    lg: 'px-6 py-3',
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return
    
    const button = e.currentTarget
    const originalStyle = button.style
    
    // 根据variant设置悬停效果
    switch (variant) {
      case 'primary':
        button.style.backgroundColor = '#1d4ed8' // primary-700
        break
      case 'secondary':
        button.style.backgroundColor = '#f3f4f6' // gray-100
        break
      case 'danger':
        button.style.backgroundColor = '#dc2626' // red-700
        break
      case 'success':
        button.style.backgroundColor = '#16a34a' // green-700
        break
      case 'ghost':
        button.style.backgroundColor = '#f3f4f6' // gray-100
        break
    }
  }
  
  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return
    
    const button = e.currentTarget
    
    // 恢复原始背景色
    switch (variant) {
      case 'primary':
        button.style.backgroundColor = '#2563eb' // primary-600
        break
      case 'secondary':
        button.style.backgroundColor = 'transparent'
        break
      case 'danger':
        button.style.backgroundColor = '#dc2626' // red-600
        break
      case 'success':
        button.style.backgroundColor = '#16a34a' // green-600
        break
      case 'ghost':
        button.style.backgroundColor = 'transparent'
        break
    }
  }

  return (
    <button
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      style={{ 
        fontSize: globalFontSize,
        transition: 'none'
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
      )}
      {children}
    </button>
  )
}

export default Button
