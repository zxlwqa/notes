import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Hash } from 'lucide-react'
import { debounce, getTagClassName, cn } from '@/lib/utils'
import type { Note } from '@/types'

interface SuggestionItem {
  text: string
  note: Note
  type: 'title' | 'tag' | 'content'
  position?: {
    startIndex: number
    endIndex: number
    searchTerm: string
  }
}

interface AdvancedSearchProps {
  notes: Note[]
  onSearch: (filteredNotes: Note[]) => void
  placeholder?: string
  className?: string
}

const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  notes,
  onSearch,
  placeholder = "搜索笔记...",
  className = ""
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionPosition, setSuggestionPosition] = useState({ top: 0, left: 0, width: 0 })
  const searchRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // 更新建议面板位置
  const updateSuggestionPosition = useCallback(() => {
    if (searchRef.current) {
      const rect = searchRef.current.getBoundingClientRect()
      setSuggestionPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      })
    }
  }, [])

  // 简单搜索逻辑
  const performSearch = useCallback((query: string): Note[] => {
    if (!query.trim()) return notes

    const searchText = query.toLowerCase()
    
    return notes.filter(note => {
      let matches = false

      // 搜索标题
      if (note.title && note.title.toLowerCase().includes(searchText)) {
        matches = true
      }
      
      // 搜索内容
      if (note.content && note.content.toLowerCase().includes(searchText)) {
        matches = true
      }
      
      // 搜索标签
      if (note.tags && note.tags.some(tag => tag.toLowerCase().includes(searchText))) {
        matches = true
      }
      
      return matches
    })
  }, [notes])

  // 防抖搜索
  const debouncedSearch = useMemo(
    () => debounce((query: string) => {
      const results = performSearch(query)
      onSearch(results)
    }, 300),
    [performSearch, onSearch]
  )

  // 搜索输入变化处理
  useEffect(() => {
    debouncedSearch(searchTerm)
  }, [searchTerm, debouncedSearch])

  // 全局点击事件处理外部点击关闭
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const searchComponent = target.closest('[data-search-component]')
      const suggestionPanel = target.closest('[data-suggestion-panel]')
      if (!searchComponent && !suggestionPanel && showSuggestions) {
        setShowSuggestions(false)
      }
    }

    if (showSuggestions) {
      // 使用 setTimeout 确保在 onClick 事件之后执行
      const timer = setTimeout(() => {
        document.addEventListener('click', handleGlobalClick)
      }, 0)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('click', handleGlobalClick)
      }
    }
  }, [showSuggestions])

  // 生成搜索建议
  const getSuggestions = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) return []
    
    const suggestions: SuggestionItem[] = []
    const searchText = searchTerm.toLowerCase()
    
    notes.forEach(note => {
      // 标题建议
      if (note.title && note.title.toLowerCase().includes(searchText)) {
        suggestions.push({
          text: note.title,
          note: note,
          type: 'title'
        })
      }
      
      // 标签建议
      if (note.tags) {
        note.tags.forEach(tag => {
          if (tag.toLowerCase().includes(searchText)) {
            suggestions.push({
              text: tag,
              note: note,
              type: 'tag'
            })
          }
        })
      }
      
      // 内容全文联想 - 改进版本
      if (note.content) {
        // 1. 提取包含搜索词的完整句子
        const sentences = note.content.split(/[。！？\n]/).filter(sentence => 
          sentence.trim().length > 0 && sentence.toLowerCase().includes(searchText)
        )
        
        sentences.forEach(sentence => {
          const trimmed = sentence.trim()
          if (trimmed.length > 0 && trimmed.length <= 100) {
            // 找到句子在原文中的位置
            const startIndex = note.content.indexOf(trimmed)
            const searchIndex = trimmed.toLowerCase().indexOf(searchText)
            
            suggestions.push({
              text: trimmed,
              note: note,
              type: 'content',
              position: {
                startIndex: startIndex + searchIndex,
                endIndex: startIndex + searchIndex + searchText.length,
                searchTerm: searchText
              }
            })
          }
        })
        
        // 2. 提取包含搜索词的短语（3-20个字符）
        const words = note.content.split(/\s+/)
        for (let i = 0; i < words.length - 1; i++) {
          const phrase = words.slice(i, i + 3).join(' ')
          if (phrase.toLowerCase().includes(searchText) && phrase.length >= 3 && phrase.length <= 50) {
            // 找到短语在原文中的位置
            const startIndex = note.content.indexOf(phrase)
            const searchIndex = phrase.toLowerCase().indexOf(searchText)
            
            suggestions.push({
              text: phrase,
              note: note,
              type: 'content',
              position: {
                startIndex: startIndex + searchIndex,
                endIndex: startIndex + searchIndex + searchText.length,
                searchTerm: searchText
              }
            })
          }
        }
        
        // 3. 提取包含搜索词的关键词（长度大于2的词）
        const keywords = words.filter(word => 
          word.length > 2 && word.toLowerCase().includes(searchText)
        )
        keywords.slice(0, 5).forEach(keyword => {
          // 找到关键词在原文中的位置
          const startIndex = note.content.indexOf(keyword)
          const searchIndex = keyword.toLowerCase().indexOf(searchText)
          
          suggestions.push({
            text: keyword,
            note: note,
            type: 'content',
            position: {
              startIndex: startIndex + searchIndex,
              endIndex: startIndex + searchIndex + searchText.length,
              searchTerm: searchText
            }
          })
        })
      }
    })
    
    // 去重并排序
    const uniqueSuggestions = suggestions.filter((item, index, self) => 
      index === self.findIndex(t => t.text === item.text && t.note.id === item.note.id)
    )
    
    // 按相关性和长度排序
    const sortedSuggestions = uniqueSuggestions.sort((a, b) => {
      const aLower = a.text.toLowerCase()
      const bLower = b.text.toLowerCase()
      
      // 优先显示以搜索词开头的建议
      const aStartsWith = aLower.startsWith(searchText)
      const bStartsWith = bLower.startsWith(searchText)
      
      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1
      
      // 其次按类型排序（标题 > 标签 > 内容）
      const typeOrder = { title: 0, tag: 1, content: 2 }
      const typeDiff = typeOrder[a.type] - typeOrder[b.type]
      if (typeDiff !== 0) return typeDiff
      
      // 最后按长度排序（较短的优先）
      return a.text.length - b.text.length
    })
    
    return sortedSuggestions.slice(0, 10) // 增加到10个建议
  }, [searchTerm, notes])

  // 处理建议点击
  const handleSuggestionClick = (suggestion: SuggestionItem) => {
    setSearchTerm(suggestion.text)
    setShowSuggestions(false)
    // 跳转到对应的笔记阅读页面，传递位置信息
    navigate(`/notes/${suggestion.note.id}`, { 
      state: { 
        note: suggestion.note,
        highlightPosition: suggestion.position
      } 
    })
  }

  // 获取建议图标
  const getSuggestionIcon = (suggestion: SuggestionItem) => {
    switch (suggestion.type) {
      case 'title':
        return <FileText className="h-3 w-3 mr-2 text-blue-500" />
      case 'tag':
        return <Hash className="h-3 w-3 mr-2 text-green-500" />
      case 'content':
        return <Search className="h-3 w-3 mr-2 text-gray-500" />
      default:
        return <Search className="h-3 w-3 mr-2 text-gray-400" />
    }
  }

  return (
    <div className={`relative ${className}`} data-search-component ref={searchRef}>
      {/* 搜索输入框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => {
            updateSuggestionPosition()
            setShowSuggestions(true)
          }}
          className="w-full pl-10 pr-4 py-2 border border-white/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/50 backdrop-blur-sm"
        />
      </div>


      {/* 使用Portal渲染搜索建议面板到body */}
      {showSuggestions && getSuggestions.length > 0 && createPortal(
        <div 
          className="fixed bg-white/95 backdrop-blur-md border border-white/40 rounded-lg shadow-xl z-[99999]"
          data-suggestion-panel
          style={{ 
            top: suggestionPosition.top,
            left: suggestionPosition.left,
            width: suggestionPosition.width,
            maxWidth: '90vw'
          }}
        >
          <div className="p-2">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {getSuggestions.map((suggestion, index) => (
                <div
                  key={`${suggestion.note.id}-${index}`}
                  className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-900"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSuggestionClick(suggestion)
                  }}
                >
                  {getSuggestionIcon(suggestion)}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">
                      {suggestion.type === 'tag' ? (
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border mr-2",
                          getTagClassName(suggestion.text)
                        )}>
                          <Hash className="h-3 w-3 mr-1" />
                          {suggestion.text}
                        </span>
                      ) : (
                        suggestion.text
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {suggestion.type === 'title' ? '标题' : 
                       suggestion.type === 'tag' ? '标签' : '内容'} · {suggestion.note.title}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 使用Portal渲染全局点击处理层 */}
      {showSuggestions && createPortal(
        <div
          className="fixed inset-0 z-[99998]"
          style={{ pointerEvents: 'none' }}
        />,
        document.body
      )}
    </div>
  )
}

export default AdvancedSearch
