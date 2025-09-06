import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, FileText, Hash } from 'lucide-react'
import { debounce } from '@/lib/utils'
import type { Note } from '@/types'


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
      if (!searchComponent && showSuggestions) {
        setShowSuggestions(false)
      }
    }

    if (showSuggestions) {
      document.addEventListener('mousedown', handleGlobalClick)
      return () => document.removeEventListener('mousedown', handleGlobalClick)
    }
  }, [showSuggestions])

  // 生成搜索建议
  const getSuggestions = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) return []
    
    const suggestions = new Set<string>()
    const searchText = searchTerm.toLowerCase()
    
    notes.forEach(note => {
      // 标题建议
      if (note.title && note.title.toLowerCase().includes(searchText)) {
        suggestions.add(note.title)
      }
      
      // 标签建议
      if (note.tags) {
        note.tags.forEach(tag => {
          if (tag.toLowerCase().includes(searchText)) {
            suggestions.add(tag)
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
            suggestions.add(trimmed)
          }
        })
        
        // 2. 提取包含搜索词的短语（3-20个字符）
        const words = note.content.split(/\s+/)
        for (let i = 0; i < words.length - 1; i++) {
          const phrase = words.slice(i, i + 3).join(' ')
          if (phrase.toLowerCase().includes(searchText) && phrase.length >= 3 && phrase.length <= 50) {
            suggestions.add(phrase)
          }
        }
        
        // 3. 提取包含搜索词的关键词（长度大于2的词）
        const keywords = words.filter(word => 
          word.length > 2 && word.toLowerCase().includes(searchText)
        )
        keywords.slice(0, 5).forEach(keyword => suggestions.add(keyword))
      }
    })
    
    // 按相关性和长度排序
    const sortedSuggestions = Array.from(suggestions).sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      
      // 优先显示以搜索词开头的建议
      const aStartsWith = aLower.startsWith(searchText)
      const bStartsWith = bLower.startsWith(searchText)
      
      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1
      
      // 其次按长度排序（较短的优先）
      return a.length - b.length
    })
    
    return sortedSuggestions.slice(0, 10) // 增加到10个建议
  }, [searchTerm, notes])

  // 处理建议点击
  const handleSuggestionClick = (suggestion: string) => {
    setSearchTerm(suggestion)
    setShowSuggestions(false)
  }

  // 获取建议图标
  const getSuggestionIcon = (suggestion: string) => {
    // 简单判断建议类型（可以根据需要进一步优化）
    if (suggestion.length > 50) return <FileText className="h-3 w-3 mr-2 text-blue-400" />
    if (suggestion.includes(' ')) return <Hash className="h-3 w-3 mr-2 text-green-400" />
    return <Search className="h-3 w-3 mr-2 text-gray-400" />
  }

  return (
    <div className={`relative ${className}`} data-search-component>
      {/* 搜索输入框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          className="w-full pl-10 pr-4 py-2 border border-white/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/50 backdrop-blur-sm"
        />
      </div>


              {/* 搜索建议面板 */}
        {showSuggestions && getSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white/90 backdrop-blur-md border border-white/40 rounded-lg shadow-lg z-[9999]">
          <div className="p-2">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {getSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-900"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {getSuggestionIcon(suggestion)}
                  <span className="truncate">{suggestion}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 使用全局点击事件处理外部点击关闭 */}
      {showSuggestions && (
        <div
          className="fixed inset-0 z-[950]"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </div>
  )
}

export default AdvancedSearch
