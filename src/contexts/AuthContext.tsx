import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '@/lib/api'

interface AuthContextType {
  isAuthenticated: boolean
  password: string | null
  login: (password: string) => Promise<boolean>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [password, setPassword] = useState<string | null>(localStorage.getItem('password'))
  // 认证只依赖 localStorage，同步可得，避免首屏额外 loading
  const [loading, setLoading] = useState(false)

  // 不再为简单本地校验引入异步 loading 状态
  useEffect(() => {}, [password])

  const login = async (passwordInput: string): Promise<boolean> => {
    try {
      const response = await api.post('/api/login', { password: passwordInput })
      if (response.data.success) {
        setPassword(passwordInput)
        localStorage.setItem('password', passwordInput)
        return true
      }
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const logout = () => {
    setPassword(null)
    localStorage.removeItem('password')
  }

  const value: AuthContextType = {
    isAuthenticated: !!password,
    password,
    login,
    logout,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
