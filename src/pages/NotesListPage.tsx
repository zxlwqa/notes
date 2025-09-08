import React, { useState, useEffect, Suspense, lazy, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, Settings, Tag } from 'lucide-react'
import Button from '@/components/ui/Button'
import Loading from '@/components/ui/Loading'
import NoteCard from '@/components/NoteCard'
import AdvancedSearch from '@/components/Advanced'
import BackToTop from '@/components/BackToTop'
import { AlertModal, ConfirmModal } from '@/components/Modal'
import { useModal } from '@/hooks/useModal'
import { notesApi } from '@/lib/api'
import type { Note, SettingsChangedEvent, NotesImportedEvent } from '@/types'

// 懒加载组件
const SettingsModal = lazy(() => import('@/components/SettingsModal'))

const NotesListPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [notes, setNotes] = useState<Note[]>(() => {
    const state = location.state as { notes?: Note[] } | null
    if (state?.notes && Array.isArray(state.notes)) {
      return state.notes
    }
    try {
      const cache = sessionStorage.getItem('notes-cache')
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
      const cache = sessionStorage.getItem('notes-cache')
      return cache ? JSON.parse(cache) as Note[] : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    // 如果有缓存数据，初始就不显示 loading
    try {
      const cache = sessionStorage.getItem('notes-cache')
      return !Boolean(cache)
    } catch {
      return true
    }
  })
  const [error, setError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [displayTitle, setDisplayTitle] = useState('')
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [draggedTag, setDraggedTag] = useState<string | null>(null)
  const [tagOrder, setTagOrder] = useState<string[]>([])
  // 记录页面首次加载时是否已有缓存，用于避免刷新后骨架闪烁
  const hasInitialCacheRef = useRef<boolean>(false)
  try {
    hasInitialCacheRef.current = !!sessionStorage.getItem('notes-cache')
  } catch {}
  
  // 弹窗管理
  const modal = useModal()


  useEffect(() => {
    // 检查是否有缓存数据
    const state = location.state as { notes?: Note[] } | null
    const hasCache = (state?.notes && state.notes.length > 0) || notes.length > 0
    if (hasCache) {
      // 有缓存时后台静默刷新，不改变 loading 状态，改为空闲时刷新以减少抖动
      const scheduleIdle = (fn: () => void) => {
        try {
          const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number }
          if (w.requestIdleCallback) {
            w.requestIdleCallback(fn, { timeout: 1000 })
          } else {
            setTimeout(fn, 0)
          }
        } catch {
          setTimeout(fn, 0)
        }
      }
      scheduleIdle(() => {
        loadNotesSilently()
      })
    } else {
      // 无缓存时正常加载
      loadNotes()
    }
    // 加载设置中的用户名作为标题
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
    
    // 加载标签排序
    const loadTagOrder = () => {
      try {
        const saved = localStorage.getItem('tag-order')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) {
            setTagOrder(parsed)
          }
        }
      } catch {}
    }
    loadTagOrder()
    
    // 监听设置变更事件
    const settingsHandler = (event: SettingsChangedEvent) => {
      loadSettingsTitle()
      // 实时更新背景图
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
    window.addEventListener('settings-changed', settingsHandler as EventListener)
    
    // 监听笔记导入事件，自动刷新笔记列表
    const notesImportedHandler = (event: NotesImportedEvent) => {
      console.log('检测到笔记导入，正在刷新笔记列表...', event.detail)
      loadNotes()
    }
    window.addEventListener('notes-imported', notesImportedHandler as EventListener)
    
    // 监听后台数据加载完成事件
    const notesLoadedHandler = (event: any) => {
      console.log('检测到后台数据加载完成，更新笔记列表...', event.detail)
      const newNotes = event.detail
      if (Array.isArray(newNotes)) {
        setNotes(newNotes)
        setFilteredNotes(newNotes)
        setLoading(false) // 确保loading状态被清除
      }
    }
    window.addEventListener('notes-loaded', notesLoadedHandler as EventListener)
    
    return () => {
      window.removeEventListener('settings-changed', settingsHandler as EventListener)
      window.removeEventListener('notes-imported', notesImportedHandler as EventListener)
      window.removeEventListener('notes-loaded', notesLoadedHandler as EventListener)
    }
  }, [])

  const loadNotes = async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await notesApi.getNotes()
      console.log('Notes API Response:', response.data) // 调试日志
      
      // 确保返回的是数组格式
      if (Array.isArray(response.data)) {
        setNotes(response.data)
        setFilteredNotes(response.data)
        try {
          sessionStorage.setItem('notes-cache', JSON.stringify(response.data))
        } catch {}
      } else if (response.data && typeof response.data === 'object') {
        // 如果返回的是单个笔记对象，转换为数组
        const singleNote = response.data
        const noteArray = [{
          id: singleNote.id || '1',
          title: singleNote.title || '我的笔记',
          content: singleNote.content || '',
          tags: singleNote.tags || [],
          createdAt: singleNote.createdAt || new Date().toISOString(),
          updatedAt: singleNote.updatedAt || new Date().toISOString()
        }]
        setNotes(noteArray)
        setFilteredNotes(noteArray)
        try {
          sessionStorage.setItem('notes-cache', JSON.stringify(noteArray))
        } catch {}
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

  // 静默加载，不显示 loading 状态，只在数据有变化时更新
  const loadNotesSilently = async () => {
    try {
      const response = await notesApi.getNotes()
      console.log('Notes API Response (silent):', response.data) // 调试日志
      
      let newNotes: Note[] = []
      
      // 确保返回的是数组格式
      if (Array.isArray(response.data)) {
        newNotes = response.data
      } else if (response.data && typeof response.data === 'object') {
        // 如果返回的是单个笔记对象，转换为数组
        const singleNote = response.data
        newNotes = [{
          id: singleNote.id || '1',
          title: singleNote.title || '我的笔记',
          content: singleNote.content || '',
          tags: singleNote.tags || [],
          createdAt: singleNote.createdAt || new Date().toISOString(),
          updatedAt: singleNote.updatedAt || new Date().toISOString()
        }]
      }
      
      // 只在数据有变化时更新状态，避免不必要的重新渲染
      if (JSON.stringify(newNotes) !== JSON.stringify(notes)) {
        setNotes(newNotes)
        setFilteredNotes(newNotes)
        try {
          sessionStorage.setItem('notes-cache', JSON.stringify(newNotes))
        } catch {}
      }
    } catch (err: unknown) {
      console.error('Load notes error (silent):', err)
      // 静默加载失败时不显示错误，保持缓存内容
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
    console.log('开始删除笔记，ID:', noteId)
    
    const confirmed = await modal.showConfirm('确定要删除这个笔记吗？此操作不可撤销。', {
      title: '删除确认',
      type: 'warning',
      confirmText: '删除',
      cancelText: '取消'
    })
    
    console.log('用户确认结果:', confirmed)
    
    if (!confirmed) {
      console.log('用户取消删除')
      return
    }

    try {
      console.log('开始调用删除API...')
      const response = await notesApi.deleteNote(noteId)
      console.log('删除API响应:', response)
      
      setNotes((prev: Note[]) => prev.filter((note: Note) => note.id !== noteId))
      setFilteredNotes((prev: Note[]) => prev.filter((note: Note) => note.id !== noteId))
      console.log('笔记列表已更新')
      // 同步更新缓存，避免刷新后短暂出现已删除卡片
      try {
        const cacheRaw = sessionStorage.getItem('notes-cache')
        if (cacheRaw) {
          const list = JSON.parse(cacheRaw) as any[]
          const filtered = list.filter((n) => n.id !== noteId)
          sessionStorage.setItem('notes-cache', JSON.stringify(filtered))
        }
      } catch {}
      try {
        const cacheRaw2 = localStorage.getItem('notes-cache')
        if (cacheRaw2) {
          const list2 = JSON.parse(cacheRaw2) as any[]
          const filtered2 = list2.filter((n) => n.id !== noteId)
          localStorage.setItem('notes-cache', JSON.stringify(filtered2))
        }
      } catch {}
      try {
        sessionStorage.removeItem('note-cache:' + `/notes/${noteId}`)
        localStorage.removeItem('note-cache:' + `/notes/${noteId}`)
      } catch {}
      
      // 显示删除成功提示
      modal.showAlert('笔记删除成功！', { 
        type: 'success',
        title: '删除成功',
        confirmText: '确定'
      })
      
    } catch (err) {
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

  // 搜索处理函数
  const handleSearch = (results: Note[]) => {
    setFilteredNotes(results)
  }

  const handleTagClick = (tag: string) => {
    // 找到该标签对应的第一个笔记
    const notesWithTag = notes.filter((note: Note) => note.tags && note.tags.includes(tag))
    if (notesWithTag.length > 0) {
      // 进入第一个笔记的查看页面
      const first = notesWithTag[0]
      navigate(`/notes/${first.id}`, { state: { note: first } })
    }
  }

  // 获取所有标签
  const getAllTags = () => {
    const allTags = new Set<string>()
    notes.forEach((note: Note) => {
      if (note.tags) {
        note.tags.forEach((tag: string) => allTags.add(tag))
      }
    })
    const tagsArray = Array.from(allTags)
    
    // 如果有自定义排序，使用自定义排序；否则使用字母排序
    if (tagOrder.length > 0) {
      // 合并自定义排序和新增标签
      const orderedTags = [...tagOrder]
      const newTags = tagsArray.filter(tag => !tagOrder.includes(tag))
      return [...orderedTags, ...newTags.sort()]
    }
    
    return tagsArray.sort()
  }

  // 笔记拖拽排序处理
  const handleNoteDragStart = (e: React.DragEvent, noteId: string) => {
    setDraggedNoteId(noteId)
    e.currentTarget.style.opacity = '0.5'
  }

  const handleNoteDragEnd = (e: React.DragEvent) => {
    e.currentTarget.style.opacity = '1'
    setDraggedNoteId(null)
  }

  const handleNoteDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleNoteDrop = (e: React.DragEvent, targetNoteId: string) => {
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
    
    // 更新缓存
    try {
      sessionStorage.setItem('notes-cache', JSON.stringify(newNotes))
    } catch {}
  }

  // 标签拖拽排序处理
  const handleTagDragStart = (e: React.DragEvent, tag: string) => {
    setDraggedTag(tag)
    e.dataTransfer.setData('text/plain', tag)
    e.currentTarget.style.opacity = '0.5'
  }

  const handleTagDragEnd = (e: React.DragEvent) => {
    e.currentTarget.style.opacity = '1'
    setDraggedTag(null)
  }

  const handleTagDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleTagDrop = (e: React.DragEvent, targetTag: string) => {
    e.preventDefault()
    const draggedTagName = e.dataTransfer.getData('text/plain')
    if (!draggedTagName || draggedTagName === targetTag) return

    const currentTags = getAllTags()
    const draggedIndex = currentTags.findIndex(tag => tag === draggedTagName)
    const targetIndex = currentTags.findIndex(tag => tag === targetTag)
    
    if (draggedIndex === -1 || targetIndex === -1) return

    const newTagOrder = [...currentTags]
    const draggedTag = newTagOrder[draggedIndex]
    newTagOrder.splice(draggedIndex, 1)
    newTagOrder.splice(targetIndex, 0, draggedTag)

    setTagOrder(newTagOrder)
    
    // 保存标签排序到localStorage
    try {
      localStorage.setItem('tag-order', JSON.stringify(newTagOrder))
    } catch {}
  }

  // 不再整体早返回 Loading，改为页面内局部骨架占位，以保证即时渲染

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100/60 to-gray-200/60" style={{ backgroundImage: "var(--app-bg-image, url('/image/background.png'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      {/* Header */}
      <header className="bg-white/30 backdrop-blur-md shadow-sm border-b border-white/30">
        <div className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* 标题 */}
          <h1 className="font-semibold text-gray-900" style={{ fontSize: 'var(--global-font-size, 16px)' }}>{displayTitle || '科技刘笔记'}</h1>
          
          {/* 右侧操作区域 */}
          <div className="flex items-center gap-4">
            {/* 按钮 */}
            <div className="flex space-x-2">
              <Button
                onClick={handleCreateNote}
                variant="success"
              >
                <Plus className="h-4 w-4 mr-2" />
                新建笔记
              </Button>
              <Button
                onClick={handleSettings}
                variant="secondary"
              >
                <Settings className="h-4 w-4 mr-2" />
                设置
              </Button>
            </div>

            {/* 搜索框 */}
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

      {/* Main Content */}
      <main className="w-full">
        <div className="flex gap-6">
          {/* 左侧标签栏 */}
          <div className="w-80 flex-shrink-0 -ml-4 sm:-ml-6 lg:-ml-8">
            <div className="bg-white/40 backdrop-blur-lg rounded-lg shadow border border-white/30 p-4 ml-4 sm:ml-6 lg:ml-8">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center" style={{ fontSize: 'var(--global-font-size, 16px)' }}>
                <Tag className="h-5 w-5 mr-2" />
                标签
              </h3>
              <div className="space-y-2">
                {getAllTags().map((tag) => {
                  return (
                    <button
                      key={tag}
                      onClick={() => handleTagClick(tag)}
                      className="w-full text-left px-3 py-2 rounded-lg flex items-center"
                      style={{
                        backgroundColor: 'transparent',
                        color: '#FFFFFF',
                        fontWeight: 'normal',
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
                        e.currentTarget.style.fontWeight = '500'
                      }}
                      onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                        e.currentTarget.style.color = '#FFFFFF'
                        e.currentTarget.style.fontWeight = 'normal'
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


          {/* 右侧笔记列表 */}
          <div className="flex-1 px-4 py-4 sm:px-6 lg:px-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-600">{error}</div>
            </div>
          )}

          {/* 顶部已包含搜索框，此处移除旧搜索栏 */}

          {/* 笔记统计已移除 */}

          {/* 笔记卡片网格：优先渲染缓存；有数据时显示数据，无数据时显示空状态，不再显示骨架屏 */}
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

      {/* 设置弹窗 */}
      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </Suspense>

      {/* 提示弹窗 */}
      <AlertModal
        isOpen={modal.alertState.isOpen}
        onClose={modal.closeAlert}
        title={modal.alertState.title}
        message={modal.alertState.message}
        type={modal.alertState.type}
        confirmText={modal.alertState.confirmText}
        onConfirm={modal.alertState.onConfirm}
      />

      {/* 确认弹窗 */}
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

export default NotesListPage
