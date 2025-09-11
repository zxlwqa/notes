import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Edit3, Settings, Trash2, Tag, Home, Share2 } from 'lucide-react'
import BackToTop from '@/components/BackToTop'
import Button from '@/components/ui/Button'
import Loading from '@/components/ui/Loading'
import { AlertModal, ConfirmModal } from '@/components/Modal'
import { useModal } from '@/hooks/useModal'
import { notesApi } from '@/lib/api'

const SettingsModal = lazy(() => import('@/components/SettingsModal'))
import ReactMarkdown from 'react-markdown'

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

const NoteViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  
  const [note, setNote] = useState<Note | null>(() => {
    const state = location.state as { note?: Note } | null
    if (state?.note) return state.note
    try {
      const cache = sessionStorage.getItem('note-cache:' + (window.location.pathname || ''))
      if (cache) return JSON.parse(cache) as Note
    } catch {}
    return null
  })
  
  const [highlightPosition, setHighlightPosition] = useState<{
    startIndex: number
    endIndex: number
    searchTerm: string
  } | null>(() => {
    const state = location.state as { highlightPosition?: any } | null
    return state?.highlightPosition || null
  })
  const [loading, setLoading] = useState<boolean>(() => {
    const hasState = Boolean((location.state as any)?.note)
    return !hasState
  })
  const [error, setError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const modal = useModal()
  
  const highlightAndScrollToText = useCallback(() => {
    if (!highlightPosition || !note?.content) return
    
    setTimeout(() => {
      const contentElement = document.querySelector('.prose')
      if (!contentElement) return
      
      const beforeText = note.content.substring(0, highlightPosition.startIndex)
      const highlightText = note.content.substring(highlightPosition.startIndex, highlightPosition.endIndex)
      const afterText = note.content.substring(highlightPosition.endIndex)
      
      const highlightedContent = `${beforeText}<mark class="highlight-search-result" style="background-color: #fef3c7; padding: 2px 4px; border-radius: 4px; font-weight: 600;">${highlightText}</mark>${afterText}`
      
      const markdownElement = contentElement.querySelector('div[data-highlight-content]')
      if (markdownElement) {
        markdownElement.innerHTML = highlightedContent
      }
      
      const highlightElement = contentElement.querySelector('.highlight-search-result')
      if (highlightElement) {
        highlightElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        })
        
        setTimeout(() => {
          if (highlightElement) {
            highlightElement.classList.remove('highlight-search-result')
            highlightElement.style.backgroundColor = 'transparent'
            highlightElement.style.padding = '0'
            highlightElement.style.borderRadius = '0'
            highlightElement.style.fontWeight = 'normal'
          }
        }, 3000)
      }
    }, 100)
  }, [highlightPosition, note?.content])
  
  useEffect(() => {
    if (highlightPosition && note?.content) {
      highlightAndScrollToText()
    }
  }, [highlightPosition, note?.content, highlightAndScrollToText])

  useEffect(() => {
    console.log('NoteViewPage mounted with id:', id)
    if (id && !note) {
      loadNote()
    } else {
      setLoading(false)
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
    
    return () => {
      window.removeEventListener('settings-changed' as any, settingsHandler)
    }
  }, [id])

  const loadNote = async () => {
    if (!id) return
    
    try {
      setLoading(true)
      setError('')
      const response = await notesApi.getNote(id)
      console.log('API Response:', response.data)
      setNote(response.data)
      try {
        sessionStorage.setItem('note-cache:' + window.location.pathname, JSON.stringify(response.data))
      } catch {}
    } catch (err: any) {
      console.error('Load note error:', err)
      if (err.response?.status === 404) {
        setError('笔记不存在')
      } else if (err.response?.status === 401) {
        setError('未授权访问')
      } else {
        setError('加载笔记失败: ' + (err.message || '未知错误'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    if (note) {
      try {
        sessionStorage.setItem('note-cache:' + `/notes/${note.id}` , JSON.stringify(note))
      } catch {}
      navigate(`/notes/${note.id}/edit`, { state: { note, isNew: false } })
    }
  }

  const handleDelete = async () => {
    if (!note) return
    
    console.log('开始删除笔记，ID:', note.id)
    
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
      setIsDeleting(true)
      console.log('开始调用删除API...')
      const response = await notesApi.deleteNote(note.id)
      console.log('删除API响应:', response)
      
      modal.showAlert('笔记删除成功！', { 
        type: 'success',
        title: '删除成功',
        confirmText: '确定'
      })
      
      setTimeout(() => {
        try {
          const cacheRaw = sessionStorage.getItem('notes-cache')
          if (cacheRaw) {
            const list = JSON.parse(cacheRaw) as any[]
            const filtered = list.filter(n => n.id !== note.id)
            sessionStorage.setItem('notes-cache', JSON.stringify(filtered))
          }
        } catch {}
        navigate('/notes')
      }, 1000)
      
    } catch (err) {
      console.error('删除笔记失败:', err)
      modal.showAlert('删除笔记失败，请检查网络连接', { 
        type: 'error',
        title: '删除失败',
        confirmText: '确定'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBack = () => {
    navigate('/notes')
  }

  const handleHome = () => {
    navigate('/notes')
  }

  const handleSettings = () => {
    setIsSettingsOpen(true)
  }

  const handleShare = () => {
    if (!note) return
    
    const shareUrl = window.location.origin + `/notes/${note.id}`
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      const successMessage = document.createElement('div')
      successMessage.textContent = '分享链接已复制'
      successMessage.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md text-center'
      document.body.appendChild(successMessage)
      setTimeout(() => {
        document.body.removeChild(successMessage)
      }, 2000)
    }).catch((error) => {
      console.error('复制失败:', error)
    })
  }

  useEffect(() => {
    if (note?.id) {
      try {
        sessionStorage.setItem('note-cache:' + `/notes/${note.id}` , JSON.stringify(note))
      } catch {}
    }
  }, [note])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100/60 to-gray-200/60 flex items-center justify-center" style={{ backgroundImage: "var(--app-bg-image, url('/image/background.png'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
        <Loading size="lg" text="加载笔记中..." />
      </div>
    )
  }

  if (!note && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100/60 to-gray-200/60 flex items-center justify-center" style={{ backgroundImage: "var(--app-bg-image, url('/image/background.png'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
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
            <div className="flex-1 flex justify-center">
              <h1 className="font-semibold text-gray-900 text-center max-w-md" style={{ fontSize: 'var(--global-font-size, 16px)' }}>
                {note?.title || '无标题'}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {note && (
                <>
                  <Button
                    onClick={handleEdit}
                    variant="success"
                  >
                    <Edit3 className="h-4 w-4 mr-2" />
                    编辑
                  </Button>
                  <Button
                    onClick={handleDelete}
                    variant="danger"
                    loading={isDeleting}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    删除
                  </Button>
                </>
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
              <div className="text-red-600">{error}</div>
              <div className="mt-2">
                <Button onClick={handleBack} variant="secondary" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  返回笔记列表
                </Button>
              </div>
            </div>
          )}

          {note ? (
            <div className="bg-white/60 backdrop-blur-md rounded-lg shadow border border-white/40">
              <div className="p-6">
                {/* 笔记标题 */}
                <div className="mb-6">
                  <div className="flex items-start justify-between mb-4">
                    <h1 className="font-bold text-gray-900 flex-1" style={{ fontSize: 'calc(var(--global-font-size, 16px) * 1.5)' }}>
                      {note.title || '无标题'}
                    </h1>
                    <button
                      onClick={handleShare}
                      className="ml-4 p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                      title="分享笔记"
                    >
                      <Share2 className="h-5 w-5" />
                    </button>
                  </div>
                
                  <div className="flex items-center space-x-6 text-gray-500 mb-4">
                  <div className="flex items-center">
                    <span className="font-medium">创建时间：</span>
                    <span>{formatDate(note.createdAt)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-medium">更新时间：</span>
                    <span>{formatDate(note.updatedAt)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-medium">字数：</span>
                    <span>{note.content?.length || 0}</span>
                  </div>
                </div>
                  
                  {/* 标签显示 */}
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {note.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full font-medium bg-blue-100 text-blue-800"
                        >
                          <Tag className="h-4 w-4 mr-1" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
              </div>

              {/* 笔记内容 */}
                  {note.content ? (
                    <div className="prose max-w-none" style={{ fontSize: 'var(--editor-font-size, 14px)', lineHeight: 'var(--editor-line-height, 1.6)', fontFamily: 'var(--editor-font-family)' }}>
                      <div data-highlight-content>
                    <style>{`
                      .prose pre {
                        background: rgba(255, 255, 255, 0.1) !important;
                        backdrop-filter: blur(6px) !important;
                        border: 1px solid rgba(255, 255, 255, 0.2) !important;
                        border-radius: 8px !important;
                        position: relative !important;
                        padding: 1rem !important;
                        margin: 1rem 0 !important;
                        overflow-x: auto !important;
                        white-space: pre-wrap !important;
                        word-wrap: break-word !important;
                        word-break: break-all !important;
                        overflow-wrap: break-word !important;
                      }
                      .prose pre:hover .copy-button {
                        opacity: 1 !important;
                      }
                      .copy-button {
                        background: rgba(255, 255, 255, 0.9) !important;
                        border: 1px solid rgba(255, 255, 255, 0.4) !important;
                        border-radius: 4px !important;
                        padding: 0.25rem 0.5rem !important;
                        font-size: 0.75rem !important;
                        color: #374151 !important;
                        cursor: pointer !important;
                        opacity: 0 !important;
                        transition: opacity 0.2s !important;
                        display: flex !important;
                        align-items: center !important;
                        gap: 0.25rem !important;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
                      }
                      .copy-button:hover {
                        background: rgba(255, 255, 255, 1) !important;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
                      }
                      .copy-button svg {
                        width: 12px !important;
                        height: 12px !important;
                      }
                    `}</style>
                      <ReactMarkdown
                        components={{
                          pre: ({ children, ...props }) => {
                            const codeContent = children?.props?.children || '';
                            const handleCopy = () => {
                              // 清理复制内容，移除首尾空白字符和多余的换行符
                              let cleanContent = codeContent.toString().trim();
                              // 移除末尾的换行符，但保留内容中的换行符
                              cleanContent = cleanContent.replace(/\n+$/, '');
                              navigator.clipboard.writeText(cleanContent);
                              // 居中显示复制成功提示
                              const successMessage = document.createElement('div')
                              successMessage.textContent = '已复制！'
                              successMessage.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50'
                              document.body.appendChild(successMessage)
                              setTimeout(() => {
                                document.body.removeChild(successMessage)
                              }, 2000)
                            };
                            
                            return (
                              <pre {...props} style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 10 }}>
                                  <button className="copy-button" onClick={handleCopy}>
                                    <svg viewBox="0 0 16 16" fill="currentColor">
                                      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5Z"/>
                                      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5Z"/>
                                    </svg>
                                  </button>
                                </div>
                                {children}
                              </pre>
                            );
                          }
                        }}
                      >
                        {note.content.replace(/\\\./g, "\\\\.")}
                      </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-gray-400 mb-4">
                        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h3 className="font-medium text-gray-900 mb-2" style={{ fontSize: 'var(--global-font-size, 16px)' }}>暂无内容</h3>
                      <p className="text-gray-500 mb-4">这个笔记还没有任何内容</p>
                      <Button onClick={handleEdit} variant="success">
                        <Edit3 className="h-4 w-4 mr-2" />
                        开始编辑
                      </Button>
                    </div>
                  )}
                </div>
              </div>
          ) : !error && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900 mb-2" style={{ fontSize: 'var(--global-font-size, 16px)' }}>加载中...</h3>
              <p className="text-gray-500">正在获取笔记内容</p>
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

export default NoteViewPage
