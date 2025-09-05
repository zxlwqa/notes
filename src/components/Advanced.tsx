import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Regex, Filter, X, Tag } from 'lucide-react'
import { debounce } from '@/lib/utils'
import type { Note } from '@/types'

interface SearchOptions {
  useRegex: boolean
  caseSensitive: boolean
  searchInTitle: boolean
  searchInContent: boolean
  searchInTags: boolean
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
  const [showOptions, setShowOptions] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    useRegex: false,
    caseSensitive: false,
    searchInTitle: true,
    searchInContent: true,
    searchInTags: true
  })

  // 高级搜索逻辑
  const performSearch = useCallback((query: string, options: SearchOptions): Note[] => {
    if (!query.trim()) return notes

    const searchText = options.caseSensitive ? query : query.toLowerCase()
    
    return notes.filter(note => {
      let matches = false

      try {
        if (options.useRegex) {
          // 正则表达式搜索
          const flags = options.caseSensitive ? 'g' : 'gi'
          const regex = new RegExp(query, flags)
          
          if (options.searchInTitle && note.title) {
            matches = matches || regex.test(note.title)
          }
          
          if (options.searchInContent && note.content) {
            matches = matches || regex.test(note.content)
          }
          
          if (options.searchInTags && note.tags) {
            matches = matches || note.tags.some(tag => regex.test(tag))
          }
        } else {
          // 普通文本搜索
          if (options.searchInTitle && note.title) {
            const title = options.caseSensitive ? note.title : note.title.toLowerCase()
            matches = matches || title.includes(searchText)
          }
          
          if (options.searchInContent && note.content) {
            const content = options.caseSensitive ? note.content : note.content.toLowerCase()
            matches = matches || content.includes(searchText)
          }
          
          if (options.searchInTags && note.tags) {
            matches = matches || note.tags.some(tag => {
              const tagText = options.caseSensitive ? tag : tag.toLowerCase()
              return tagText.includes(searchText)
            })
            }
          }
        } catch (error) {
          // 正则表达式错误处理
          console.error('Regex error:', error)
          return false
        }

        return matches
      })
    }, [notes, searchOptions])

  // 防抖搜索
  const debouncedSearch = useMemo(
    () => debounce((query: string, options: SearchOptions) => {
      const results = performSearch(query, options)
      onSearch(results)
    }, 300),
    [performSearch, onSearch]
  )

  // 搜索输入变化处理
  useEffect(() => {
    debouncedSearch(searchTerm, searchOptions)
  }, [searchTerm, searchOptions, debouncedSearch])

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
      
      // 内容关键词建议（提取前几个词）
      if (note.content) {
        const words = note.content.split(/\s+/).filter(word => 
          word.length > 2 && word.toLowerCase().includes(searchText)
        )
        words.slice(0, 3).forEach(word => suggestions.add(word))
      }
    })
    
    return Array.from(suggestions).slice(0, 8) // 最多显示8个建议
  }, [searchTerm, notes])

  // 处理建议点击
  const handleSuggestionClick = (suggestion: string) => {
    setSearchTerm(suggestion)
    setShowSuggestions(false)
  }

  return (
    <div className={`relative ${className}`}>
      {/* 搜索输入框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          className="w-full pl-10 pr-12 py-2 border border-white/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/50 backdrop-blur-sm"
        />
        
        {/* 搜索选项按钮 */}
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          <button
            onClick={() => setShowOptions(!showOptions)}
            className={`p-1 rounded transition-colors ${
              showOptions ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="搜索选项"
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 搜索选项面板 */}
      {showOptions && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/90 backdrop-blur-md border border-white/40 rounded-lg shadow-lg p-4 z-[100]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">搜索选项</h3>
              <button
                onClick={() => setShowOptions(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={searchOptions.useRegex}
                  onChange={(e) => setSearchOptions(prev => ({ ...prev, useRegex: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 flex items-center">
                  <Regex className="h-3 w-3 mr-1" />
                  正则表达式
                </span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={searchOptions.caseSensitive}
                  onChange={(e) => setSearchOptions(prev => ({ ...prev, caseSensitive: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">区分大小写</span>
              </label>
            </div>
            
            <div className="border-t border-gray-200 pt-2">
              <div className="text-xs text-gray-500 mb-2">搜索范围：</div>
              <div className="space-y-1">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={searchOptions.searchInTitle}
                    onChange={(e) => setSearchOptions(prev => ({ ...prev, searchInTitle: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">标题</span>
                </label>
                
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={searchOptions.searchInContent}
                    onChange={(e) => setSearchOptions(prev => ({ ...prev, searchInContent: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">内容</span>
                </label>
                
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={searchOptions.searchInTags}
                    onChange={(e) => setSearchOptions(prev => ({ ...prev, searchInTags: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 flex items-center">
                    <Tag className="h-3 w-3 mr-1" />
                    标签
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 搜索建议面板 */}
      {showSuggestions && getSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/90 backdrop-blur-md border border-white/40 rounded-lg shadow-lg z-[100]">
          <div className="p-2">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {getSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-900"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <Search className="h-3 w-3 mr-2 text-gray-400" />
                  <span className="truncate">{suggestion}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 点击外部关闭面板 */}
      {(showOptions || showSuggestions) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowOptions(false)
            setShowSuggestions(false)
          }}
        />
      )}
    </div>
  )
}

export default AdvancedSearch
