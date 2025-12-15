import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useAuth } from '@/contexts/Context'
import { notesApi } from '@/lib/api'
import { loadAndSetPageTitle } from '@/lib/utils'
import { Settings, Save, Edit3 } from 'lucide-react'
import BackToTop from '@/components/BackTop'
import Button from '@/components/ui/Button'
import Loading from '@/components/ui/Loading'

import NotesEditor from '@/components/Editor'
const SettingsModal = lazy(() => import('@/components/Settings'))
const ReactMarkdown = lazy(() => import('react-markdown'))

const Notes = () => {
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [displayTitle, setDisplayTitle] = useState('')
  useAuth()

  useEffect(() => {
    loadNotes()

    const username = loadAndSetPageTitle()
    if (username) {
      setDisplayTitle(username)
    }
    
    const handler = (event: CustomEvent) => {
      const username = loadAndSetPageTitle()
      if (username) {
        setDisplayTitle(username)
      }
      
      const settings = event.detail
      if (settings && settings.backgroundImageUrl) {
        const bg = settings.backgroundImageUrl.trim()
        if (bg) {
          document.documentElement.style.setProperty('--app-bg-image', `url('${bg}')`)

          const body = document.body
          if (body) {
            body.style.backgroundImage = `url('${bg}')`
            body.style.backgroundSize = 'cover'
            body.style.backgroundPosition = 'center'
            body.style.backgroundRepeat = 'no-repeat'
            body.style.backgroundAttachment = 'fixed'
          }
        } else {
          document.documentElement.style.removeProperty('--app-bg-image')

          const body = document.body
          if (body) {
            body.style.backgroundImage = "url('/background.webp')"
            body.style.backgroundSize = 'cover'
            body.style.backgroundPosition = 'center'
            body.style.backgroundRepeat = 'no-repeat'
            body.style.backgroundAttachment = 'fixed'
          }
        }
      }
    }
    window.addEventListener('settings-changed', handler as EventListener)
    return () => {
      window.removeEventListener('settings-changed', handler as EventListener)
    }
  }, [])

  const loadNotes = async () => {
    try {
      setLoading(true)
      const response = await notesApi.getNotes()
      const notes = Array.isArray(response.data) ? response.data : []
      const firstNote = notes[0]
      setContent(firstNote?.content || '')
    } catch (err) {
      setError('加载笔记失败')
      console.error('Load notes error:', err)
    } finally {
      setLoading(false)
    }
  }

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
    <div className="min-h-screen bg-gray-50" style={{ backgroundImage: "var(--app-bg-image, url('/background.webp'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>

      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="font-semibold text-gray-900" style={{ fontSize: 'var(--global-font-size, 16px)' }}>{displayTitle || '笔记系统'}</h1>
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

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-600">{error}</div>
            </div>
          )}

          {isEditing ? (
            <div className="bg-white rounded-lg shadow">
              <NotesEditor
                value={content}
                onChange={handleContentChange}
                placeholder="开始编写您的笔记..."
              />
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

      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </Suspense>
      <BackToTop />
    </div>
  )
}

export default Notes
