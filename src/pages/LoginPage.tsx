import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { notesApi } from '@/lib/api'
import { Eye, EyeOff } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const LoginPage = () => {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [displayTitle, setDisplayTitle] = useState('笔记系统')
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    document.title = '笔记系统'
    
    const loadSettingsTitle = () => {
      try {
        const saved = localStorage.getItem('app-settings')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.username && typeof parsed.username === 'string') {
            setDisplayTitle(parsed.username)
            document.title = parsed.username
            const descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement
            const appMeta = document.querySelector('meta[name="application-name"]') as HTMLMetaElement
            if (descMeta) descMeta.content = `${parsed.username} - 个人笔记管理系统`
            if (appMeta) appMeta.content = parsed.username
          }
          if (parsed.logoUrl && typeof parsed.logoUrl === 'string') {
            const url = parsed.logoUrl.trim()
            if (url) {
              const img = document.getElementById('login-logo') as HTMLImageElement | null
              if (img) img.src = url
              let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
              if (!link) {
                link = document.createElement('link')
                link.rel = 'icon'
                document.head.appendChild(link)
              }
              link.href = url
            }
          }
        }
      } catch {}
    }
    loadSettingsTitle()
    
    const settingsHandler = (event: any) => {
      const settings = event.detail
      if (settings && settings.backgroundImageUrl) {
        const bg = settings.backgroundImageUrl.trim()
        if (bg) {
          document.documentElement.style.setProperty('--app-bg-image', `url('${bg}')`)
        } else {
          document.documentElement.style.removeProperty('--app-bg-image')
        }
      }

      if (settings && settings.username && typeof settings.username === 'string') {
        setDisplayTitle(settings.username)

        document.title = settings.username
        const descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement
        const appMeta = document.querySelector('meta[name="application-name"]') as HTMLMetaElement
        if (descMeta) descMeta.content = `${settings.username} - 个人笔记管理系统`
        if (appMeta) appMeta.content = settings.username
      }

      if (settings && typeof settings.logoUrl === 'string') {
        const url = settings.logoUrl.trim()
        const img = document.getElementById('login-logo') as HTMLImageElement | null
        if (img && url) img.src = url
        if (url) {
          let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
          if (!link) {
            link = document.createElement('link')
            link.rel = 'icon'
            document.head.appendChild(link)
          }
          link.href = url
        }
      }
    }
    window.addEventListener('settings-changed' as any, settingsHandler)
    
    
    return () => {
      window.removeEventListener('settings-changed' as any, settingsHandler)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('请输入密码')
      return
    }
    

    setLoading(true)
    setError('')

    try {
      const success = await login(password)
      if (success) {

        try {

          let cached: any[] | null = null
          try {
            const raw = localStorage.getItem('notes-cache') || sessionStorage.getItem('notes-cache')
            if (raw) cached = JSON.parse(raw)
          } catch {}

          if (cached && Array.isArray(cached) && cached.length > 0) {
            navigate('/notes', { state: { notes: cached } })
          } else {

            const resp = await notesApi.getNotes()
            const list = Array.isArray(resp.data) ? resp.data : (resp.data ? [resp.data] : [])
            navigate('/notes', { state: { notes: list } })
            try {
              sessionStorage.setItem('notes-cache', JSON.stringify(list))
              localStorage.setItem('notes-cache', JSON.stringify(list))
            } catch {}
          }
        } catch {

          navigate('/notes')
        }
      } else {
        setError('密码错误')
      }
    } catch (err) {
      setError('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100/60 to-gray-200/60" style={{ backgroundImage: "var(--app-bg-image, url('/image/background.png'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white/70 backdrop-blur-md rounded-xl shadow-lg p-8 border border-white/40">
          <div className="text-center">
            <div className="flex justify-center">
              <img 
                id="login-logo"
                src="/image/logo.png" 
                alt="Logo" 
                className="mx-auto h-20 w-20 object-cover rounded-full"
                loading="eager"
                fetchpriority="high"
              />
            </div>
            <h2 className="mt-4 font-bold text-gray-900" style={{ fontSize: 'calc(var(--global-font-size, 16px) * 1.5)' }}>{displayTitle}</h2>
          </div>

          <form 
            className="mt-8 space-y-6" 
            onSubmit={handleSubmit} 
            data-form="login"
            method="post"
            action="/login"
          >
            <div>
              <label htmlFor="password" className="sr-only">
                密码
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-center">{error}</div>
            )}

            <div>
              <Button
                type="submit"
                loading={loading}
                className="w-full"
                size="lg"
                data-action="login"
              >
                登录
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
