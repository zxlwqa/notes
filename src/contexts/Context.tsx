import React, { createContext, useContext, useState, ReactNode } from 'react'
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

  const [loading] = useState(false)


  const login = async (passwordInput: string): Promise<boolean> => {
    try {
      const response = await api.post('/api/login', { password: passwordInput })
      
      if (response.data.success) {
        setPassword(passwordInput)
        localStorage.setItem('password', passwordInput)
        return true
      }
      return false
    } catch {
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