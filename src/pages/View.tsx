import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Edit3, Settings, Trash2, Tag, Home, Share2 } from 'lucide-react'
import BackToTop from '@/components/BackTop'
import Button from '@/components/ui/Button'
import Loading from '@/components/ui/Loading'
import { AlertModal, ConfirmModal } from '@/components/Modal'
import { useModal } from '@/hooks/Modal'
import { notesApi } from '@/lib/api'

const SettingsModal = lazy(() => import('@/components/Settings'))
import ReactMarkdown from 'react-markdown'
import { slugify } from '@/lib/utils'

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

const View: React.FC = () => {
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
  
  const [highlightPosition] = useState<{
    startIndex: number
    endIndex: number
    searchTerm: string
  } | null>(() => {
    const state = location.state as { highlightPosition?: { startIndex: number; endIndex: number; searchTerm: string } } | null
    return state?.highlightPosition || null
  })
  const [loading, setLoading] = useState<boolean>(() => {
    const hasState = Boolean((location.state as { note?: unknown } | null)?.note)
    return !hasState
  })
  const [error, setError] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const modal = useModal()

  const headingIdCountsRef = React.useRef<Record<string, number>>({})
  const extractText = useCallback((node: React.ReactNode): string => {
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(extractText).join('')
    if (React.isValidElement(node)) return extractText(node.props.children)
    return ''
  }, [])

  const scrollToTag = useCallback((tag: string) => {
    const id = slugify(tag)
    const target = document.getElementById(id)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const el = target as HTMLElement
      const originalBg = el.style.backgroundColor
      el.style.backgroundColor = 'rgba(187, 247, 208, 0.8)'
      setTimeout(() => { el.style.backgroundColor = originalBg || '' }, 1500)
      return
    }
    const container = document.querySelector('.prose')
    if (!container) return
    const blocks = container.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote')
    for (const block of Array.from(blocks)) {
      const text = (block.textContent || '').trim()
      if (text && text.includes(tag)) {
        block.scrollIntoView({ behavior: 'smooth', block: 'start' })
        const el = block as HTMLElement
        const originalBg = el.style.backgroundColor
        el.style.backgroundColor = 'rgba(187, 247, 208, 0.8)'
        setTimeout(() => { el.style.backgroundColor = originalBg || '' }, 1500)
        break
      }
    }
  }, [])
  
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
            const el = highlightElement as HTMLElement
            el.style.backgroundColor = 'transparent'
            el.style.padding = '0'
            el.style.borderRadius = '0'
            el.style.fontWeight = 'normal'
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
    if (id && !note) {
      loadNote()
    } else {
      setLoading(false)
    }
    
    const settingsHandler = (event: CustomEvent) => {
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
    
    return () => {
      window.removeEventListener('settings-changed', settingsHandler as EventListener)
    }
  }, [id])

  const loadNote = async () => {
    if (!id) return
    
    try {
      setLoading(true)
      setError('')
      const response = await notesApi.getNote(id)
      setNote(response.data)
      try {
        sessionStorage.setItem('note-cache:' + window.location.pathname, JSON.stringify(response.data))
      } catch {}
    } catch (err: unknown) {
      console.error('Load note error:', err)
      if (err && typeof err === 'object' && 'response' in err) {
        const errorWithResponse = err as { response?: { status?: number } }
        if (errorWithResponse.response?.status === 404) {
          setError('笔记不存在')
        } else if (errorWithResponse.response?.status === 401) {
          setError('未授权访问')
        } else {
          setError('加载笔记失败')
        }
      } else {
        const errorMessage = err instanceof Error ? err.message : '未知错误'
        setError('加载笔记失败: ' + errorMessage)
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
      setIsDeleting(true)
      await notesApi.deleteNote(note.id)
      
      modal.showAlert('笔记删除成功！', { 
        type: 'success',
        title: '删除成功',
        confirmText: '确定'
      })
      
      setTimeout(() => {
        try {
          const cacheRaw = sessionStorage.getItem('notes-cache')
          if (cacheRaw) {
            const list = JSON.parse(cacheRaw) as Array<{ id: string; [key: string]: unknown }>
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
      <div className="min-h-screen bg-gradient-to-br from-gray-100/60 to-gray-200/60 flex items-center justify-center" style={{ backgroundImage: "var(--app-bg-image, url('/background.webp'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
        <Loading size="lg" text="加载笔记中..." />
      </div>
    )
  }

  if (!note && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100/60 to-gray-200/60 flex items-center justify-center" style={{ backgroundImage: "var(--app-bg-image, url('/background.webp'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
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
    <div className="min-h-screen bg-gradient-to-br from-gray-100/60 to-gray-200/60" style={{ backgroundImage: "var(--app-bg-image, url('/background.webp'))", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
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

      <main className="w-full">
        <div className="max-w-7xl mx-auto px-8 py-6">
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
            <div className="bg-white/60 backdrop-blur-md rounded-lg shadow border border-white/40" style={{ overflowX: 'hidden', wordBreak: 'break-word' }}>
              <div className="p-6" style={{ overflowX: 'hidden', wordBreak: 'break-word' }}>
                <div className="mb-6">
                  <div className="flex items-start justify-between mb-4">
                    <h1 className="font-bold text-gray-900 flex-1" style={{ fontSize: 'calc(var(--global-font-size, 16px) * 1.5)' }}>
                      {note.title || '无标题'}
                    </h1>
                    <button
                      onClick={handleShare}
                      className="ml-4 p-2 text-gray-400 hover:text-blue-500 rounded-md transition-colors"
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
                  
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {note.tags.map((tag, index) => (
                        <button
                          key={index}
                          onClick={() => scrollToTag(tag)}
                          className="inline-flex items-center px-3 py-1 rounded-full font-medium bg-blue-100 text-blue-800"
                        >
                          <Tag className="h-4 w-4 mr-1" />
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
              </div>

                  {note.content ? (
                    <div className="prose max-w-none" style={{ fontSize: 'var(--editor-font-size, 14px)', lineHeight: 'var(--editor-line-height, 1.6)', fontFamily: 'var(--editor-font-family)', wordBreak: 'break-all', overflowWrap: 'break-word', whiteSpace: 'normal', overflowX: 'hidden' }}>
                      <div data-highlight-content style={{ wordBreak: 'break-all', overflowWrap: 'break-word', whiteSpace: 'normal', overflowX: 'hidden' }}>
                    <style>{`
                      [data-highlight-content] {
                        word-wrap: break-word !important;
                        word-break: break-word !important;
                        overflow-wrap: break-word !important;
                        overflow-x: hidden !important;
                        white-space: normal !important;
                        max-width: 100% !important;
                      }
                      .prose {
                        word-wrap: break-word !important;
                        word-break: break-word !important;
                        overflow-wrap: break-word !important;
                        overflow-x: hidden !important;
                        white-space: normal !important;
                        max-width: 100% !important;
                      }
                      .prose * {
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                        max-width: 100% !important;
                        white-space: normal !important;
                      }
                      .prose p,
                      .prose div,
                      .prose span,
                      .prose li,
                      .prose td,
                      .prose th,
                      .prose h1,
                      .prose h2,
                      .prose h3,
                      .prose h4,
                      .prose h5,
                      .prose h6,
                      .prose blockquote,
                      .prose strong,
                      .prose em {
                        word-wrap: break-word !important;
                        word-break: break-all !important;
                        overflow-wrap: break-word !important;
                        white-space: normal !important;
                      }
                      .prose a {
                        word-wrap: break-word !important;
                        word-break: break-all !important;
                        overflow-wrap: break-word !important;
                        max-width: 100% !important;
                        display: inline !important;
                        white-space: normal !important;
                      }
                      .prose p a,
                      .prose div a,
                      .prose span a,
                      .prose li a,
                      .prose h1 a,
                      .prose h2 a,
                      .prose h3 a {
                        word-break: break-all !important;
                        white-space: normal !important;
                      }
                      .prose p,
                      .prose li,
                      .prose div,
                      .prose span {
                        word-break: break-all !important;
                        white-space: normal !important;
                      }
                      .prose *:not(pre) {
                        white-space: normal !important;
                        word-break: break-all !important;
                      }
                      .prose p {
                        white-space: pre-wrap !important;
                        word-break: break-all !important;
                        overflow-wrap: break-word !important;
                      }
                      .prose a {
                        display: inline-block !important;
                        word-break: break-all !important;
                        max-width: 100% !important;
                      }
                      .prose p::after {
                        content: '' !important;
                      }
                      .prose p {
                        display: flex !important;
                        flex-direction: column !important;
                        flex-wrap: wrap !important;
                      }
                      .prose p {
                        display: block !important;
                        white-space: pre-wrap !important;
                      }
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
                        word-break: normal !important;
                        overflow-wrap: break-word !important;
                        text-align: left !important;
                      }
                      .prose code {
                        white-space: pre-wrap !important;
                        word-wrap: break-word !important;
                        word-break: normal !important;
                        overflow-wrap: break-word !important;
                        display: block !important;
                        text-align: left !important;
                      }
                      .prose pre code {
                        white-space: pre-wrap !important;
                        word-wrap: break-word !important;
                        word-break: normal !important;
                        overflow-wrap: break-word !important;
                        display: block !important;
                        text-align: left !important;
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
                          h1: ({ children, ...props }) => {
                            const text = extractText(children)
                            let id = slugify(text)
                            const counts = headingIdCountsRef.current
                            if (counts[id] !== undefined) {
                              counts[id] += 1
                              id = `${id}-${counts[id]}`
                            } else {
                              counts[id] = 0
                            }
                            return (
                              <h1 id={id} {...props}>{children}</h1>
                            )
                          },
                          h2: ({ children, ...props }) => {
                            const text = extractText(children)
                            let id = slugify(text)
                            const counts = headingIdCountsRef.current
                            if (counts[id] !== undefined) {
                              counts[id] += 1
                              id = `${id}-${counts[id]}`
                            } else {
                              counts[id] = 0
                            }
                            return (
                              <h2 id={id} {...props}>{children}</h2>
                            )
                          },
                          h3: ({ children, ...props }) => {
                            const text = extractText(children)
                            let id = slugify(text)
                            const counts = headingIdCountsRef.current
                            if (counts[id] !== undefined) {
                              counts[id] += 1
                              id = `${id}-${counts[id]}`
                            } else {
                              counts[id] = 0
                            }
                            return (
                              <h3 id={id} {...props}>{children}</h3>
                            )
                          },
                          h4: ({ children, ...props }) => {
                            const text = extractText(children)
                            let id = slugify(text)
                            const counts = headingIdCountsRef.current
                            if (counts[id] !== undefined) {
                              counts[id] += 1
                              id = `${id}-${counts[id]}`
                            } else {
                              counts[id] = 0
                            }
                            return (
                              <h4 id={id} {...props}>{children}</h4>
                            )
                          },
                          h5: ({ children, ...props }) => {
                            const text = extractText(children)
                            let id = slugify(text)
                            const counts = headingIdCountsRef.current
                            if (counts[id] !== undefined) {
                              counts[id] += 1
                              id = `${id}-${counts[id]}`
                            } else {
                              counts[id] = 0
                            }
                            return (
                              <h5 id={id} {...props}>{children}</h5>
                            )
                          },
                          h6: ({ children, ...props }) => {
                            const text = extractText(children)
                            let id = slugify(text)
                            const counts = headingIdCountsRef.current
                            if (counts[id] !== undefined) {
                              counts[id] += 1
                              id = `${id}-${counts[id]}`
                            } else {
                              counts[id] = 0
                            }
                            return (
                              <h6 id={id} {...props}>{children}</h6>
                            )
                          },
                          p: ({ children, ...props }) => {
                            return (
                              <p {...props} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'break-word', lineHeight: '1.8', display: 'block' }}>
                                {children}
                              </p>
                            );
                          },
                          a: ({ children, href, ...props }) => {
                            return (
                              <a 
                                {...props} 
                                href={href}
                                style={{ 
                                  display: 'inline-block', 
                                  wordBreak: 'break-all', 
                                  overflowWrap: 'break-word',
                                  whiteSpace: 'normal',
                                  maxWidth: '100%',
                                  marginRight: '0.5rem'
                                }}
                              >
                                {children}
                              </a>
                            );
                          },
                          pre: ({ children, ...props }) => {
                            const codeContent = (children && typeof children === 'object' && 'props' in children && children.props && 'children' in children.props) ? children.props.children : '';
                            const handleCopy = (e: React.MouseEvent) => {
                              // 从原始内容中提取代码块，避免处理逻辑的影响
                              let cleanContent = '';
                              
                              if (note?.content) {
                                // 找到当前点击的 pre 元素（按钮的父元素）
                                const button = e.currentTarget as HTMLElement;
                                const target = button.closest('pre') as HTMLElement | null;
                                
                                if (target) {
                                  // 获取所有代码块（包括语言标识）
                                  const codeBlockRegex = /```[\w]*\n?([\s\S]*?)\n?```/g;
                                  const codeBlocks: string[] = [];
                                  let match;
                                  const originalContent = note.content;
                                  
                                  while ((match = codeBlockRegex.exec(originalContent)) !== null) {
                                    codeBlocks.push(match[1] || '');
                                  }
                                  
                                  // 找到当前代码块在所有代码块中的索引
                                  const allPreElements = document.querySelectorAll('.prose pre');
                                  const currentIndex = Array.from(allPreElements).indexOf(target);
                                  
                                  if (currentIndex >= 0 && currentIndex < codeBlocks.length) {
                                    // 使用原始代码块内容，保留所有空格
                                    cleanContent = codeBlocks[currentIndex];
                                  } else if (codeBlocks.length > 0) {
                                    // 如果索引不匹配，使用第一个
                                    cleanContent = codeBlocks[0];
                                  } else {
                                    // 如果没有找到代码块，从 DOM 获取文本内容（移除复制按钮的文本）
                                    const codeElement = target.querySelector('code');
                                    cleanContent = codeElement ? (codeElement.textContent || '').trim() : (target.textContent || '').trim();
                                  }
                                } else {
                                  // 如果找不到 pre 元素，从原始内容提取第一个代码块
                                  const codeBlockRegex = /```[\w]*\n?([\s\S]*?)\n?```/;
                                  const match = note.content.match(codeBlockRegex);
                                  cleanContent = match ? (match[1] || '') : codeContent.toString();
                                }
                              } else {
                                // 如果没有原始内容，使用渲染后的内容
                                cleanContent = codeContent.toString();
                              }
                              
                              // 只清理末尾的空白，保留代码块内的所有空格和换行
                              cleanContent = cleanContent.replace(/\n+$/, '');
                              navigator.clipboard.writeText(cleanContent);

                              const successMessage = document.createElement('div')
                              successMessage.textContent = '已复制！'
                              successMessage.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50'
                              document.body.appendChild(successMessage)
                              setTimeout(() => {
                                document.body.removeChild(successMessage)
                              }, 2000)
                            };
                            
                            return (
                              <pre {...props} style={{ position: 'relative', whiteSpace: 'pre-wrap', wordBreak: 'normal', overflowWrap: 'break-word', textAlign: 'left' }}>
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
                          },
                          code: ({ children, ...props }) => {
                            return (
                              <code {...props} style={{ whiteSpace: 'pre-wrap', wordBreak: 'normal', overflowWrap: 'break-word', display: 'block', textAlign: 'left' }}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {(() => {
                          let content = note.content;
                          
                          // 先提取代码块，避免处理逻辑影响代码块内容
                          const codeBlocks: { start: number; end: number; content: string }[] = [];
                          const codeBlockRegex = /```[\w]*\n?[\s\S]*?\n?```/g;
                          let match;
                          while ((match = codeBlockRegex.exec(content)) !== null) {
                            codeBlocks.push({
                              start: match.index,
                              end: match.index + match[0].length,
                              content: match[0]
                            });
                          }
                          
                          // 替换非代码块区域的内容
                          let processedContent = '';
                          let lastIndex = 0;
                          
                          for (const block of codeBlocks) {
                            // 处理代码块之前的内容
                            const beforeBlock = content.substring(lastIndex, block.start);
                            const processedBefore = beforeBlock
                              .replace(/([^\n\r])\n([^\n\r])/g, '$1  \n$2')
                              .replace(/([\u4e00-\u9fa5]+[：:])\s*(https?:\/\/[^\s]+)/g, '$1\n$2')
                              .replace(/\n{3,}/g, '\n\n');
                            
                            processedContent += processedBefore + block.content;
                            lastIndex = block.end;
                          }
                          
                          // 处理最后一个代码块之后的内容
                          if (lastIndex < content.length) {
                            const afterBlocks = content.substring(lastIndex);
                            const processedAfter = afterBlocks
                              .replace(/([^\n\r])\n([^\n\r])/g, '$1  \n$2')
                              .replace(/([\u4e00-\u9fa5]+[：:])\s*(https?:\/\/[^\s]+)/g, '$1\n$2')
                              .replace(/\n{3,}/g, '\n\n');
                            processedContent += processedAfter;
                          }
                          
                          // 如果没有代码块，使用原来的处理方式
                          if (codeBlocks.length === 0) {
                            content = content.replace(/([^\n\r])\n([^\n\r])/g, '$1  \n$2');
                            content = content.replace(/([\u4e00-\u9fa5]+[：:])\s*(https?:\/\/[^\s]+)/g, '$1\n$2');
                            content = content.replace(/\n{3,}/g, '\n\n');
                            processedContent = content;
                          }
                          
                          processedContent = processedContent.replace(/^\n+|\n+$/g, '').trim();
                          
                          return processedContent;
                        })()}
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

export default View
