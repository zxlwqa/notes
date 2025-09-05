import React from 'react'
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  type?: 'info' | 'success' | 'warning' | 'error'
  showCloseButton?: boolean
}

export interface AlertModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  confirmText?: string
  onConfirm?: () => void
}

export interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
  type?: 'info' | 'warning' | 'error'
}

export interface PromptModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  onConfirm: (value: string) => void
  onCancel?: () => void
}

export interface SelectModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
  options: Array<{ value: string; label: string; description?: string }>
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  onConfirm: (value: string) => void
  onCancel?: () => void
}

// 基础模态框组件
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  type = 'info',
  showCloseButton = true
}) => {
  if (!isOpen) return null

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-6 w-6 text-green-600" />
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-yellow-600" />
      case 'error':
        return <AlertCircle className="h-6 w-6 text-red-600" />
      default:
        return <Info className="h-6 w-6 text-blue-600" />
    }
  }

  const getHeaderColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      default:
        return 'bg-blue-50 border-blue-200'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70]">
      <div className="bg-white/90 backdrop-blur-xl rounded-lg shadow-xl w-full max-w-md mx-4 border border-white/40">
        {/* 弹窗头部 */}
        <div className={`${getHeaderColor()} px-6 py-4 border-b border-white/40 flex justify-between items-center`}>
          <div className="flex items-center gap-3">
            {getIcon()}
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* 弹窗内容 */}
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}

// 警告弹窗组件
export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  title = '提示',
  message,
  type = 'info',
  confirmText = '确定',
  onConfirm
}) => {
  const handleConfirm = () => {
    onConfirm?.()
    onClose()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  React.useEffect(() => {
    if (isOpen) {
      const handleGlobalKeyPress = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          handleConfirm()
        } else if (e.key === 'Escape') {
          onClose()
        }
      }
      
      document.addEventListener('keydown', handleGlobalKeyPress)
      return () => {
        document.removeEventListener('keydown', handleGlobalKeyPress)
      }
    }
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} type={type}>
      <div className="space-y-4">
        <p className="text-gray-700">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={handleConfirm}
            onKeyDown={handleKeyPress}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              type === 'error' 
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : type === 'warning'
                ? 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
                : type === 'success'
                ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 确认弹窗组件
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  title = '确认',
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'warning'
}) => {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const handleCancel = () => {
    onCancel?.()
    onClose()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  React.useEffect(() => {
    if (isOpen) {
      const handleGlobalKeyPress = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          handleConfirm()
        } else if (e.key === 'Escape') {
          handleCancel()
        }
      }
      
      document.addEventListener('keydown', handleGlobalKeyPress)
      return () => {
        document.removeEventListener('keydown', handleGlobalKeyPress)
      }
    }
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} type={type}>
      <div className="space-y-4">
        <p className="text-gray-700">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            onKeyDown={handleKeyPress}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            onKeyDown={handleKeyPress}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 ease-in-out ${
              type === 'error' 
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : type === 'warning'
                ? 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 输入弹窗组件
export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  title = '输入',
  message,
  placeholder = '请输入',
  defaultValue = '',
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel
}) => {
  const [value, setValue] = React.useState(defaultValue)

  React.useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
    }
  }, [isOpen, defaultValue])

  const handleConfirm = () => {
    onConfirm(value)
    onClose()
  }

  const handleCancel = () => {
    onCancel?.()
    onClose()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} type="info">
      <div className="space-y-4">
        <p className="text-gray-700">{message}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-150 ease-in-out"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-150 ease-in-out"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 选择弹窗组件
export const SelectModal: React.FC<SelectModalProps> = ({
  isOpen,
  onClose,
  title = '选择',
  message,
  options,
  defaultValue = '',
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel
}) => {
  const [selectedValue, setSelectedValue] = React.useState(defaultValue)

  React.useEffect(() => {
    if (isOpen) {
      setSelectedValue(defaultValue)
    }
  }, [isOpen, defaultValue])

  const handleConfirm = () => {
    onConfirm(selectedValue)
    onClose()
  }

  const handleCancel = () => {
    onCancel?.()
    onClose()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} type="info">
      <div className="space-y-4">
        <p className="text-gray-700">{message}</p>
        
        {/* 选项列表 */}
        <div className="space-y-2">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-start p-3 rounded-lg border cursor-pointer"
              style={{ 
                borderColor: selectedValue === option.value ? '#3b82f6' : '#e5e7eb',
                backgroundColor: selectedValue === option.value ? '#eff6ff' : '#ffffff',
                transition: 'none'
              }}
              onMouseEnter={(e) => {
                if (selectedValue !== option.value) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'
                  e.currentTarget.style.borderColor = '#d1d5db'
                }
              }}
              onMouseLeave={(e) => {
                if (selectedValue !== option.value) {
                  e.currentTarget.style.backgroundColor = '#ffffff'
                  e.currentTarget.style.borderColor = '#e5e7eb'
                }
              }}
            >
              <input
                type="radio"
                name="select-option"
                value={option.value}
                checked={selectedValue === option.value}
                onChange={(e) => setSelectedValue(e.target.value)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <div className="ml-3 flex-1">
                <div className="text-sm font-medium text-gray-900">
                  {option.label}
                </div>
                {option.description && (
                  <div className="text-xs text-gray-500 mt-1">
                    {option.description}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            onKeyDown={handleKeyPress}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-150 ease-in-out"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            onKeyDown={handleKeyPress}
            disabled={!selectedValue}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default Modal
