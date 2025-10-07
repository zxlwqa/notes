import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Save, ArrowLeft, Settings, Home } from 'lucide-react'
import BackToTop from '@/components/BackToTop'
import Button from '@/components/ui/Button'
import Loading from '@/components/ui/Loading'
import { notesApi } from '@/lib/api'

const SettingsModal = lazy(() => import('@/components/SettingsModal'))

import NotesEditor from '@/components/NotesEditor'

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

const NoteEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  
  const [note, setNote] = useState<Note | null>(() => {
    const state = location.state as { note?: Note; isNew?: boolean } | null
    if (state?.note) return state.note
    try {
      const cache = sessionStorage.getItem('note-cache:' + (window.location.pathname || ''))
      if (cache) return JSON.parse(cache) as Note
    } catch {}
    return null
  })
  const [loading, setLoading] = useState<boolean>(() => {
    const state = location.state as { note?: Note; isNew?: boolean } | null
    return !Boolean(state?.note)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isNewNote, setIsNewNote] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [editorReady, setEditorReady] = useState(false)

  useEffect(() => {

    const state = location.state as { note?: Note; isNew?: boolean }
    if (state?.note && state?.isNew) {
      setNote(state.note)
      setIsNewNote(true)
      setLoading(false)
    } else {
      if (!note) {
        loadNote()
      } else {
        setLoading(false)
      }
    }
    
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
    }
    window.addEventListener('settings-changed' as any, settingsHandler)
    
    const timer = setTimeout(() => {
      setEditorReady(true)
    }, 100)
    
    return () => {
      window.removeEventListener('settings-changed' as any, settingsHandler)
      clearTimeout(timer)
    }
  }, [id, location.state])

  const loadNote = async () => {
    if (!id) return
    
    try {
      setLoading(true)
      setError('')
      const response = await notesApi.getNote(id)
      console.log('Loaded note data:', response.data)
      
      if (response.data && response.data.id) {
        setNote({
          id: response.data.id,
          title: response.data.title || '无标题',
          content: response.data.content || '',
          tags: response.data.tags || [],
          createdAt: response.data.createdAt || new Date().toISOString(),
          updatedAt: response.data.updatedAt || new Date().toISOString()
        })
        try {
          sessionStorage.setItem('note-cache:' + window.location.pathname, JSON.stringify({
            id: response.data.id,
            title: response.data.title || '无标题',
            content: response.data.content || '',
            tags: response.data.tags || [],
            createdAt: response.data.createdAt || new Date().toISOString(),
            updatedAt: response.data.updatedAt || new Date().toISOString()
          }))
        } catch {}
      } else {
        throw new Error('笔记数据格式不正确')
      }
    } catch (err: any) {
      console.error('Load note error:', err)
      setError('加载笔记失败: ' + (err.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const handleContentChange = useCallback((value: string) => {
    setNote(prev => prev ? { ...prev, content: value } : null)
  }, [])

  const handleTitleChange = (value: string) => {
    if (note) {
      setNote(prev => prev ? { ...prev, title: value } : null)
    }
  }

  const handleAddTag = () => {
    if (tagInput.trim() && note) {
      const newTag = tagInput.trim()
      if (!note.tags.includes(newTag)) {
        setNote(prev => prev ? { ...prev, tags: [...prev.tags, newTag] } : null)
      }
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    if (note) {
      setNote(prev => prev ? { ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) } : null)
    }
  }

  const handleTagInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleSave = async () => {
    console.log('Save button clicked!')
    if (!note) {
      setError('笔记数据不存在')
      return
    }

    if (!note.id && !isNewNote) {
      setError('笔记ID不存在，无法保存')
      return
    }

    try {
      setSaving(true)
      setError('')
      
      const noteData = {
        title: note.title || '无标题',
        content: note.content || '',
        tags: note.tags || []
      }
      
      console.log('Saving note:', { 
        id: note.id, 
        isNewNote, 
        title: noteData.title, 
        contentLength: noteData.content.length 
      })
      
      if (isNewNote) {
        console.log('Creating new note...')
        const response = await notesApi.createNote(noteData)
        console.log('Create response:', response.data)
        const newNoteId = (response.data && response.data.id) ? response.data.id : note.id
        setIsNewNote(false)
        
        try {
          localStorage.setItem('note-flash', JSON.stringify({
            action: 'created',
            title: noteData.title,
            noteId: newNoteId,
            timestamp: Date.now()
          }))
        } catch {}

        setShowSuccessMessage(true)
        
        setTimeout(() => {
          setShowSuccessMessage(false)
          navigate(`/notes/${newNoteId}`, { state: { note: {
            id: newNoteId,
            title: noteData.title,
            content: noteData.content,
            tags: noteData.tags,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } } })
          try {
            const cacheRaw = sessionStorage.getItem('notes-cache')
            const list = cacheRaw ? JSON.parse(cacheRaw) as any[] : []
            const merged = [{
              id: newNoteId,
              title: noteData.title,
              content: noteData.content,
              tags: noteData.tags,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }, ...list]
            sessionStorage.setItem('notes-cache', JSON.stringify(merged))
          } catch {}
        }, 1500)
        
        return
      } else {
        console.log('Updating existing note with ID:', note.id)
        const response = await notesApi.updateNote(note.id, noteData)
        console.log('Update response:', response.data)

        try {
          localStorage.setItem('note-flash', JSON.stringify({
            action: 'updated',
            title: note.title || '无标题',
            noteId: note.id,
            timestamp: Date.now()
          }))
        } catch {}
      }
      
      setNote(prev => prev ? { 
        ...prev, 
        updatedAt: new Date().toISOString() 
      } : null)
      
      setShowSuccessMessage(true)
      
      setTimeout(() => {
        setShowSuccessMessage(false)
        navigate(`/notes/${note.id}`, { state: { note: {
          id: note.id,
          title: note.title,
          content: note.content,
          tags: note.tags,
          createdAt: note.createdAt,
          updatedAt: new Date().toISOString()
        } } })
        try {
          const cacheRaw = sessionStorage.getItem('notes-cache')
          if (cacheRaw) {
            const list = JSON.parse(cacheRaw) as any[]
            const updated = list.map(n => n.id === note.id ? {
              ...n,
              title: note.title,
              tags: note.tags,
              updatedAt: new Date().toISOString()
            } : n)
            sessionStorage.setItem('notes-cache', JSON.stringify(updated))
          }
        } catch {}
      }, 1500)
      
    } catch (err: any) {
      console.error('Save note error:', err)
      console.error('Error response:', err.response?.data)
      console.error('Error status:', err.response?.status)
      
      if (err.response?.status === 401) {
        setError('未授权访问，请重新登录')
      } else if (err.response?.status === 404) {
        setError('笔记不存在')
      } else if (err.response?.status === 400) {
        setError('数据格式错误: ' + (err.response?.data?.error || '未知错误'))
      } else if (err.response?.status === 405) {
        setError('请求方法不被允许，请检查API配置')
      } else if (err.response?.status === 500) {
        setError('服务器错误: ' + (err.response?.data?.error || '未知错误'))
      } else {
        setError('保存失败: ' + (err.message || '未知错误'))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (note) {
      navigate(`/notes/${note.id}`, { state: { note } })
    } else {
      navigate('/notes')
    }
  }

  const handleHome = () => {
    navigate('/notes')
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

  if (!note) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-bold text-gray-900 mb-4" style={{ fontSize: 'calc(var(--global-font-size, 16px) * 1.25)' }}>笔记不存在</h2>
          <p className="text-gray-600 mb-6">您要查看的笔记可能已被删除或不存在。</p>
          <Button onClick={handleBack} variant="secondary">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回笔记列表
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100/60 to-gray-200/60" style={{ backgroundImage: "var(--app-bg-image, url('/image/background.png'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      {/* Header */}
      <header className="bg-white/30 backdrop-blur-md shadow-sm border-b border-white/30">
        <div className="w-full">
          <div className="flex items-center h-16 px-4 sm:px-6 lg:px-8">
            <Button
              onClick={handleBack}
              variant="ghost"
              size="lg"
              className="-ml-4 sm:-ml-6 lg:-ml-8"
            >
              <ArrowLeft className="h-6 w-6 mr-2" />
              返回
            </Button>
            <Button
              onClick={handleHome}
              variant="ghost"
              size="lg"
              className="ml-2"
            >
              <Home className="h-6 w-6 mr-2" />
              首页
            </Button>
            <div className="flex-1 flex flex-col items-center space-y-2">
              <input
                type="text"
                value={note.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="输入笔记标题..."
                className="title-input font-semibold bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 text-center max-w-md"
                style={{ 
                  fontSize: 'calc(var(--global-font-size, 16px) * 1.5)',
                  fontFamily: 'var(--editor-font-family, inherit)',
                  lineHeight: 'var(--global-line-height, 1.6)'
                }}
              />

            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={handleSave}
                loading={saving}
                variant="success"
              >
                <Save className="h-4 w-4 mr-2" />
                保存
              </Button>
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
              <div className="text-red-600">{error}</div>
            </div>
          )}

          {/* 笔记信息（按需隐藏） */}
          {/* 已按需求去除顶部“新笔记/创建于/更新于”提示 */}

          {/* 编辑器 */}
          <div className="bg-white/30 backdrop-blur-md rounded-lg shadow border border-white/30">
            {editorReady ? (
              <NotesEditor
                value={note.content}
                onChange={handleContentChange}
                placeholder="开始编写您的笔记..."
                tags={note.tags}
                tagInput={tagInput}
                onTagInputChange={(value) => setTagInput(value)}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onTagInputKeyPress={handleTagInputKeyPress}
              />
            ) : (
              <div className="p-8 text-center">
                <Loading size="md" text="初始化编辑器中..." />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 设置弹窗 */}
      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </Suspense>

      {showSuccessMessage && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          保存成功！
        </div>
      )}
      <BackToTop />
    </div>
  )
}

export default NoteEditPage
