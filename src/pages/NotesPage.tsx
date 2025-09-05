import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { notesApi } from '@/lib/api'
import { Settings, Save, Edit3 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Loading from '@/components/ui/Loading'

// 懒加载组件
const NotesEditor = lazy(() => import('@/components/NotesEditor'))
const SettingsModal = lazy(() => import('@/components/SettingsModal'))
const ReactMarkdown = lazy(() => import('react-markdown'))

const NotesPage = () => {
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [displayTitle, setDisplayTitle] = useState('')
  const { logout } = useAuth()

  useEffect(() => {
    loadNotes()
    // 加载设置中的用户名作为首页标题
    const loadSettingsTitle = () => {
      try {
        const saved = localStorage.getItem('app-settings')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.username && typeof parsed.username === 'string') {
            setDisplayTitle(parsed.username)
          }
        }
      } catch {}
    }
    loadSettingsTitle()
    const handler = () => loadSettingsTitle()
    window.addEventListener('settings-changed' as any, handler)
    return () => {
      window.removeEventListener('settings-changed' as any, handler)
    }
  }, [])

  const loadNotes = async () => {
    try {
      setLoading(true)
      const response = await notesApi.getNotes()
      setContent(response.data.content || '')
    } catch (err) {
      setError('加载笔记失败')
      console.error('Load notes error:', err)
    } finally {
      setLoading(false)
    }
  }

  // 使用 useCallback 优化 onChange 函数，避免不必要的重新渲染
  const handleContentChange = useCallback((value: string) => {
    setContent(value)
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      await notesApi.updateNotes(content)
      setIsEditing(false)
    } catch (err) {
      setError('保存失败')
      console.error('Save notes error:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleSettings = () => {
    setIsSettingsOpen(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading size="lg" text="加载笔记中..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ backgroundImage: "var(--app-bg-image, url('/image/background.png'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">{displayTitle || '科技刘笔记'}</h1>
            <div className="flex items-center space-x-4">
              {isEditing ? (
                <Button
                  onClick={handleSave}
                  loading={saving}
                  variant="success"
                >
                  <Save className="h-4 w-4 mr-2" />
                  保存
                </Button>
              ) : (
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="secondary"
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  编辑
                </Button>
              )}
              <Button
                onClick={handleSettings}
                variant="secondary"
              >
                <Settings className="h-4 w-4 mr-2" />
                设置
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-sm text-red-600">{error}</div>
            </div>
          )}

          {isEditing ? (
            <div className="bg-white rounded-lg shadow">
              <Suspense fallback={
                <div className="p-8 text-center">
                  <Loading size="md" text="加载编辑器中..." />
                </div>
              }>
                <NotesEditor
                  value={content}
                  onChange={handleContentChange}
                  placeholder="开始编写您的笔记..."
                />
              </Suspense>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6" style={{ fontSize: 'var(--editor-font-size, 14px)', lineHeight: 'var(--editor-line-height, 1.6)', fontFamily: 'var(--editor-font-family)' }}>
              <div className="prose max-w-none" style={{ fontFamily: 'var(--editor-font-family)' }}>
                {content ? (
                  <Suspense fallback={
                    <div className="p-8 text-center">
                      <Loading size="md" text="加载Markdown渲染器中..." />
                    </div>
                  }>
                    <ReactMarkdown>{content}</ReactMarkdown>
                  </Suspense>
                ) : (
                  <p className="text-gray-500">暂无内容</p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 设置弹窗 */}
      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </Suspense>
    </div>
  )
}

export default NotesPage
