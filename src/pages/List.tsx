import React, { useState, useEffect, Suspense, lazy, useRef, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, Settings, Tag } from 'lucide-react'
import Button from '@/components/ui/Button'
import NoteCard from '@/components/Card'
import AdvancedSearch from '@/components/Advanced'
import BackToTop from '@/components/BackTop'
import { AlertModal, ConfirmModal } from '@/components/Modal'
import { useModal } from '@/hooks/Modal'
import { notesApi, orderApi } from '@/lib/api'
import type { Note, SettingsChangedEvent } from '@/types'

const SettingsModal = lazy(() => import('@/components/Settings'))

const List: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [notes, setNotes] = useState<Note[]>(() => {
    const state = location.state as { notes?: Note[] } | null
    if (state?.notes && Array.isArray(state.notes)) {
      return state.notes
    }
    try {
      const cache = sessionStorage.getItem('notes-cache') || localStorage.getItem('notes-cache')
      return cache ? JSON.parse(cache) as Note[] : []
    } catch {
      return []
    }
  })
  const [filteredNotes, setFilteredNotes] = useState<Note[]>(() => {
    const state = location.state as { notes?: Note[] } | null
    if (state?.notes && Array.isArray(state.notes)) {
      return state.notes
    }
    try {
      const cache = sessionStorage.getItem('notes-cache') || localStorage.getItem('notes-cache')
      return cache ? JSON.parse(cache) as Note[] : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    try {
      const cache = sessionStorage.getItem('notes-cache') || localStorage.getItem('notes-cache')
      return !cache
    } catch {
      return true
    }
  })
  const [error, setError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [displayTitle, setDisplayTitle] = useState('')
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [, setDraggedTag] = useState<string | null>(null)
  const [tagOrder, setTagOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tag-order')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    } catch {}
    return []
  })
  const [flash, setFlash] = useState<{ action: 'created' | 'updated'; title: string; noteId?: string; timestamp: number } | null>(null)
  const hasInitialCacheRef = useRef<boolean>(false)
  try {
    hasInitialCacheRef.current = !!(sessionStorage.getItem('notes-cache') || localStorage.getItem('notes-cache'))
  } catch {}
  
  const modal = useModal()


  useEffect(() => {
    const state = location.state as { notes?: Note[] } | null
    const hasCache = (state?.notes && state.notes.length > 0) || notes.length > 0
    if (hasCache) {
      setTimeout(() => {
        loadNotesSilently()
      }, 100)
    } else {
      loadNotes()
    }
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
    
    const loadTagOrder = async () => {
      try {
        const response = await orderApi.getOrder('tag-order')
        const data = response.data?.data
        if (data && Array.isArray(data) && data.length > 0) {
          setTagOrder(current => {
            const currentStr = JSON.stringify(current)
            const newStr = JSON.stringify(data)
            if (currentStr !== newStr) {
              return data
            }
            return current
          })
          localStorage.setItem('tag-order', JSON.stringify(data))
        }
      } catch {
      }
    }
    loadTagOrder()
    
    try {
      const raw = localStorage.getItem('note-flash')
      if (raw) {
        const data = JSON.parse(raw)
        if (data && (data.action === 'created' || data.action === 'updated') && typeof data.title === 'string' && typeof data.timestamp === 'number') {
          setFlash({ action: data.action, title: data.title, noteId: data.noteId, timestamp: data.timestamp })
        }
      }
    } catch {
    }
    
    const settingsHandler = (event: SettingsChangedEvent) => {
      loadSettingsTitle()

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
    window.addEventListener('settings-changed', settingsHandler as EventListener)
    
    const notesImportedHandler = () => {
      loadNotes()
    }
    window.addEventListener('notes-imported', notesImportedHandler as EventListener)
    
    const notesLoadedHandler = (event: CustomEvent) => {
      const newNotes = event.detail
      if (Array.isArray(newNotes)) {
        setNotes(newNotes)
        setFilteredNotes(newNotes)
        setLoading(false)
      }
    }
    window.addEventListener('notes-loaded', notesLoadedHandler as EventListener)
    
    return () => {
      window.removeEventListener('settings-changed', settingsHandler as EventListener)
      window.removeEventListener('notes-imported', notesImportedHandler as EventListener)
      window.removeEventListener('notes-loaded', notesLoadedHandler as EventListener)
    }
  }, [])

  const loadNoteOrder = async (): Promise<string[]> => {
    try {
      const response = await orderApi.getOrder('note-order')
      const data = response.data?.data
      if (data && Array.isArray(data)) {
        return data
      }
      return []
    } catch {
      try {
        const raw = localStorage.getItem('note-order')
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
  }

  const applyOrder = async (list: Note[]): Promise<Note[]> => {
    const order = await loadNoteOrder()
    if (!Array.isArray(list) || list.length === 0 || order.length === 0) return list
    const idToNote = new Map(list.map((n) => [n.id, n]))
    const ordered: Note[] = []
    for (const id of order) {
      const note = idToNote.get(id)
      if (note) {
        ordered.push(note)
        idToNote.delete(id)
      }
    }

    for (const note of list) {
      if (idToNote.has(note.id)) {
        ordered.push(note)
      }
    }
    return ordered
  }

  const saveNoteOrder = async (list: Note[]) => {
    try {
      const ids = Array.isArray(list) ? list.map((n) => n.id) : []
      await orderApi.saveOrder('note-order', ids)
      localStorage.setItem('note-order', JSON.stringify(ids))
    } catch {
      try {
        const ids = Array.isArray(list) ? list.map((n) => n.id) : []
        localStorage.setItem('note-order', JSON.stringify(ids))
      } catch {}
    }
  }

  useEffect(() => {
    if (notes && notes.length > 0) {
      applyOrder(notes).then((ordered) => {
        if (JSON.stringify(ordered.map((n) => n.id)) !== JSON.stringify(notes.map((n) => n.id))) {
          setNotes(ordered)
          setFilteredNotes(ordered)
        }
      })
    }
  }, [])

  const loadNotes = async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await notesApi.getNotes()
      
      if (Array.isArray(response.data)) {
        const ordered = await applyOrder(response.data)
        setNotes(ordered)
        setFilteredNotes(ordered)
        try {
          sessionStorage.setItem('notes-cache', JSON.stringify(ordered))
          localStorage.setItem('notes-cache', JSON.stringify(ordered))
        } catch {}
        await saveNoteOrder(ordered)
      } else if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {

        const singleNote = response.data as Note
        const noteArray = [{
          id: singleNote.id || '1',
          title: singleNote.title || '默认笔记',
          content: singleNote.content || '',
          tags: singleNote.tags || [],
          createdAt: singleNote.createdAt || new Date().toISOString(),
          updatedAt: singleNote.updatedAt || new Date().toISOString()
        }]
        const ordered = await applyOrder(noteArray)
        setNotes(ordered)
        setFilteredNotes(ordered)
        try {
          sessionStorage.setItem('notes-cache', JSON.stringify(ordered))
          localStorage.setItem('notes-cache', JSON.stringify(ordered))
        } catch {}
        await saveNoteOrder(ordered)
      } else {
        setNotes([])
        setFilteredNotes([])
      }
    } catch (err: unknown) {
      console.error('Load notes error:', err)
      const error = err as { response?: { status: number }; message?: string }
      if (error.response?.status === 401) {
        setError('未授权访问，请重新登录')
      } else {
        setError('加载笔记失败: ' + (error.message || '未知错误'))
      }
    } finally {
      setLoading(false)
    }
  }

  const loadNotesSilently = async () => {
    try {
      const response = await notesApi.getNotes()
      
      let newNotes: Note[] = []
      
      if (Array.isArray(response.data)) {
        newNotes = response.data
      } else if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {

        const singleNote = response.data as Note
        newNotes = [{
          id: singleNote.id || '1',
          title: singleNote.title || '默认笔记',
          content: singleNote.content || '',
          tags: singleNote.tags || [],
          createdAt: singleNote.createdAt || new Date().toISOString(),
          updatedAt: singleNote.updatedAt || new Date().toISOString()
        }]
      }
      
      const ordered = await applyOrder(newNotes)

      if (JSON.stringify(ordered) !== JSON.stringify(notes)) {
        setNotes(ordered)
        setFilteredNotes(ordered)
        try {
          sessionStorage.setItem('notes-cache', JSON.stringify(ordered))
          localStorage.setItem('notes-cache', JSON.stringify(ordered))
        } catch {}
        await saveNoteOrder(ordered)
      }
    } catch (_err: unknown) {
      console.error('Load notes error (silent):', _err)

    }
  }

  const handleCreateNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: '新笔记',
      content: '',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    navigate(`/notes/${newNote.id}/edit`, { state: { note: newNote, isNew: true } })
  }

  const handleViewNote = (note: Note) => {
    navigate(`/notes/${note.id}`, { state: { note } })
  }

  const handleDeleteNote = async (noteId: string) => {
    
    const confirmed = await modal.showConfirm('确定要删除这个笔记吗？此操作不可撤销。', {
      title: '删除确认',
      type: 'warning',
      confirmText: '删除',
      cancelText: '取消'
    })
    
    
    if (!confirmed) {
      return
    }

    try {
      await notesApi.deleteNote(noteId)
      
      setNotes((prev: Note[]) => prev.filter((note: Note) => note.id !== noteId))
      setFilteredNotes((prev: Note[]) => prev.filter((note: Note) => note.id !== noteId))

      try {
        const current = await loadNoteOrder()
        const updated = current.filter((id) => id !== noteId)
        await orderApi.saveOrder('note-order', updated)
        localStorage.setItem('note-order', JSON.stringify(updated))
      } catch {
        try {
          const raw = localStorage.getItem('note-order')
          const parsed = raw ? JSON.parse(raw) : []
          const updated = parsed.filter((id: string) => id !== noteId)
          localStorage.setItem('note-order', JSON.stringify(updated))
        } catch {}
      }
      try {
        const cacheRaw = sessionStorage.getItem('notes-cache')
        if (cacheRaw) {
          const list = JSON.parse(cacheRaw) as Array<{ id: string; [key: string]: unknown }>
          const filtered = list.filter((n) => n.id !== noteId)
          sessionStorage.setItem('notes-cache', JSON.stringify(filtered))
        }
      } catch {}
      try {
        const cacheRaw2 = localStorage.getItem('notes-cache')
        if (cacheRaw2) {
          const list2 = JSON.parse(cacheRaw2) as Array<{ id: string; [key: string]: unknown }>
          const filtered2 = list2.filter((n) => n.id !== noteId)
          localStorage.setItem('notes-cache', JSON.stringify(filtered2))
        }
      } catch {}
      try {
        sessionStorage.removeItem('note-cache:' + `/notes/${noteId}`)
        localStorage.removeItem('note-cache:' + `/notes/${noteId}`)
      } catch {}
      
      modal.showAlert('笔记删除成功！', { 
        type: 'success',
        title: '删除成功',
        confirmText: '确定'
      })
      
    } catch (err: unknown) {
      console.error('删除笔记失败:', err)
      modal.showAlert('删除笔记失败，请检查网络连接', { 
        type: 'error',
        title: '删除失败',
        confirmText: '确定'
      })
    }
  }

  const handleSettings = () => {
    setIsSettingsOpen(true)
  }

  const handleSearch = (results: Note[]) => {
    setFilteredNotes(results)
  }

  const handleTagClick = (tag: string) => {

    const notesWithTag = notes.filter((note: Note) => note.tags && note.tags.includes(tag))
    if (notesWithTag.length > 0) {

      const first = notesWithTag[0]
      navigate(`/notes/${first.id}`, { state: { note: first } })
    }
  }

  const getAllTags = useMemo(() => {
    const allTags = new Set<string>()
    notes.forEach((note: Note) => {
      if (note.tags) {
        note.tags.forEach((tag: string) => allTags.add(tag))
      }
    })
    const tagsArray = Array.from(allTags)
    
    if (tagOrder.length > 0) {
      const orderedTags = tagOrder.filter(tag => allTags.has(tag))
      const newTags = tagsArray.filter(tag => !tagOrder.includes(tag))
      return [...orderedTags, ...newTags.sort()]
    }
    
    return tagsArray.sort()
  }, [notes, tagOrder])

  const handleNoteDragStart = (e: React.DragEvent, noteId: string) => {
    setDraggedNoteId(noteId);
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  }

  const handleNoteDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1'
    setDraggedNoteId(null)
  }

  const handleNoteDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleNoteDrop = async (e: React.DragEvent, targetNoteId: string) => {
    e.preventDefault()
    if (!draggedNoteId || draggedNoteId === targetNoteId) return

    const draggedIndex = filteredNotes.findIndex(note => note.id === draggedNoteId)
    const targetIndex = filteredNotes.findIndex(note => note.id === targetNoteId)
    
    if (draggedIndex === -1 || targetIndex === -1) return

    const newNotes = [...filteredNotes]
    const draggedNote = newNotes[draggedIndex]
    newNotes.splice(draggedIndex, 1)
    newNotes.splice(targetIndex, 0, draggedNote)

    setFilteredNotes(newNotes)
    setNotes(newNotes)
    
    try {
      sessionStorage.setItem('notes-cache', JSON.stringify(newNotes))
      localStorage.setItem('notes-cache', JSON.stringify(newNotes))
    } catch {}

    await saveNoteOrder(newNotes)
  }

  const handleTagDragStart = (e: React.DragEvent, tag: string) => {
    setDraggedTag(tag);
    e.dataTransfer.setData('text/plain', tag);
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  }

  const handleTagDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1'
    setDraggedTag(null)
  }

  const handleTagDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleTagDrop = async (e: React.DragEvent, targetTag: string) => {
    e.preventDefault()
    const draggedTagName = e.dataTransfer.getData('text/plain')
    if (!draggedTagName || draggedTagName === targetTag) return

    const currentTags = getAllTags
    const draggedIndex = currentTags.findIndex(tag => tag === draggedTagName)
    const targetIndex = currentTags.findIndex(tag => tag === targetTag)
    
    if (draggedIndex === -1 || targetIndex === -1) return

    const newTagOrder = [...currentTags]
    const draggedTagValue = newTagOrder[draggedIndex]
    newTagOrder.splice(draggedIndex, 1)
    newTagOrder.splice(targetIndex, 0, draggedTagValue)

    setTagOrder(newTagOrder)
    
    try {
      await orderApi.saveOrder('tag-order', newTagOrder)
      localStorage.setItem('tag-order', JSON.stringify(newTagOrder))
    } catch {
      try {
        localStorage.setItem('tag-order', JSON.stringify(newTagOrder))
      } catch {}
    }
  }

  const formatRelativeTime = (time: number) => {
    const diff = Date.now() - time
    const sec = Math.floor(diff / 1000)
    if (sec < 10) return '刚刚'
    if (sec < 60) return `${sec}秒前`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}分钟前`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}小时前`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day}天前`
    const d = new Date(time)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${dd} ${hh}:${mm}`
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100/60 to-gray-200/60" style={{ backgroundImage: "var(--app-bg-image, url('/background.webp'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>

      <form 
        style={{ display: 'none' }}
        method="post"
        action="/login"
        data-form="login"
      >
        <input
          type="text"
          name="username"
          autoComplete="username"
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          tabIndex={-1}
          aria-hidden="true"
        />
        <button type="submit" tabIndex={-1} aria-hidden="true">登录</button>
      </form>

      <header className="bg-white/30 backdrop-blur-md shadow-sm border-b border-white/30">
        <div className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 relative">

          {flash && (
            <button
              onClick={() => {
                if (flash.noteId) {
                  navigate(`/notes/${flash.noteId}`)
                }
                try { localStorage.removeItem('note-flash') } catch {}
                setFlash(null)
              }}
              className={`absolute left-1/2 -translate-x-1/2 inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium border transition-colors hover:opacity-90 ${flash.action === 'created' ? 'bg-green-50/80 text-green-700 border-green-200/80' : 'bg-blue-50/80 text-blue-700 border-blue-200/80'}`}
              style={{ backdropFilter: 'blur(2px)' }}
            >
              {flash.action === 'created' ? '新建了' : '修改了'}
              {`“${flash.title || '无标题'}”笔记 · ${formatRelativeTime(flash.timestamp)}`}
            </button>
          )}

          <h1 className="font-semibold text-gray-900" style={{ fontSize: 'var(--global-font-size, 16px)' }}>{displayTitle || '笔记系统'}</h1>

          <div className="flex items-center gap-4">
            <div className="flex space-x-2">
              <Button onClick={handleCreateNote} variant="success">
                <Plus className="h-4 w-4 mr-2" />
                新建笔记
              </Button>
              <Button onClick={handleSettings} variant="secondary" className="border border-white">
                <Settings className="h-4 w-4 mr-2" />
                设置
              </Button>
            </div>
            <div className="w-80 relative z-[9998]">
              <AdvancedSearch
                notes={notes}
                onSearch={handleSearch}
                placeholder="搜索笔记..."
              />
            </div>
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="flex gap-6">

          <div className="w-80 flex-shrink-0 -ml-4 sm:-ml-6 lg:-ml-8">
            <div className="bg-white/40 backdrop-blur-lg rounded-lg shadow border border-white/30 p-4 ml-4 sm:ml-6 lg:ml-8">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center" style={{ fontSize: 'var(--global-font-size, 16px)' }}>
                <Tag className="h-5 w-5 mr-2" />
                标签
              </h3>
              <div className="space-y-2">
                {getAllTags.map((tag) => {
                  return (
                    <button
                      key={tag}
                      onClick={() => handleTagClick(tag)}
                      className="w-full text-left px-3 py-2 rounded-lg flex items-center text-xl font-semibold"
                      style={{
                        backgroundColor: 'transparent',
                        color: '#FFFFFF',
                        transition: 'none'
                      }}
                      draggable
                      onDragStart={(e) => handleTagDragStart(e, tag)}
                      onDragEnd={handleTagDragEnd}
                      onDragOver={handleTagDragOver}
                      onDrop={(e) => handleTagDrop(e, tag)}
                      onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
                        e.currentTarget.style.color = '#111827'
                      }}
                      onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                        e.currentTarget.style.color = '#FFFFFF'
                      }}
                    >
                      <span className="flex items-center">
                        <Tag className="h-3 w-3 mr-2" />
                        {tag}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 py-4 sm:px-6 lg:px-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-600">{error}</div>
            </div>
          )}

          {filteredNotes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8">
              {filteredNotes.map((note: Note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onView={handleViewNote}
                  onDelete={handleDeleteNote}
                  onDragStart={handleNoteDragStart}
                  onDragEnd={handleNoteDragEnd}
                  onDragOver={handleNoteDragOver}
                  onDrop={handleNoteDrop}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900 mb-2" style={{ fontSize: 'var(--global-font-size, 16px)' }}>
                {loading ? '正在加载笔记...' : (notes.length === 0 ? '还没有笔记' : '没有找到匹配的笔记')}
              </h3>
              <p className="text-gray-500 mb-4">
                {loading 
                  ? '请稍候，正在为您准备内容...'
                  : (notes.length === 0 
                    ? '点击"新建笔记"开始创建您的第一个笔记'
                    : '尝试使用不同的关键词搜索，或调整搜索选项'
                  )
                }
              </p>
            </div>
          )}
          </div>
        </div>
      </main>

      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </Suspense>

      <AlertModal
        isOpen={modal.alertState.isOpen}
        onClose={modal.closeAlert}
        title={modal.alertState.title}
        message={modal.alertState.message}
        type={modal.alertState.type}
        confirmText={modal.alertState.confirmText}
        onConfirm={modal.alertState.onConfirm}
      />

      <ConfirmModal
        isOpen={modal.confirmState.isOpen}
        onClose={modal.closeConfirm}
        title={modal.confirmState.title}
        message={modal.confirmState.message}
        type={modal.confirmState.type}
        confirmText={modal.confirmState.confirmText}
        cancelText={modal.confirmState.cancelText}
        onConfirm={modal.confirmState.onConfirm || (() => {})}
        onCancel={modal.confirmState.onCancel}
      />
      <BackToTop />
    </div>
  )
}

export default List
