import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, History, Regex, Filter, X, Clock, Tag } from 'lucide-react'
import { debounce } from '@/lib/utils'
import type { Note } from '@/types'

interface SearchHistory {
  id: string
  query: string
  timestamp: number
  resultCount: number
}

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
  const [showHistory, setShowHistory] = useState(false)
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([])
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    useRegex: false,
    caseSensitive: false,
    searchInTitle: true,
    searchInContent: true,
    searchInTags: true
  })

  // 从本地存储加载搜索历史
  useEffect(() => {
    const savedHistory = localStorage.getItem('search-history')
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory))
      } catch (error) {
        console.error('Failed to load search history:', error)
      }
    }
  }, [])

  // 保存搜索历史到本地存储
  const saveSearchHistory = useCallback((query: string, resultCount: number) => {
    if (!query.trim()) return

    const newHistoryItem: SearchHistory = {
      id: Date.now().toString(),
      query: query.trim(),
      timestamp: Date.now(),
      resultCount
    }

    setSearchHistory(prev => {
      // 移除重复的查询
      const filtered = prev.filter(item => item.query !== query.trim())
      // 添加新查询到开头，最多保留20条
      const updated = [newHistoryItem, ...filtered].slice(0, 20)
      
      localStorage.setItem('search-history', JSON.stringify(updated))
      return updated
    })
  }, [])

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
      
      if (query.trim()) {
        saveSearchHistory(query, results.length)
      }
    }, 300),
    [performSearch, onSearch, saveSearchHistory]
  )

  // 搜索输入变化处理
  useEffect(() => {
    debouncedSearch(searchTerm, searchOptions)
  }, [searchTerm, searchOptions, debouncedSearch])

  // 处理搜索历史点击
  const handleHistoryClick = (historyItem: SearchHistory) => {
    setSearchTerm(historyItem.query)
    setShowHistory(false)
  }

  // 清除搜索历史
  const clearHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('search-history')
  }

  // 删除单个历史记录
  const removeHistoryItem = (id: string) => {
    setSearchHistory(prev => {
      const updated = prev.filter(item => item.id !== id)
      localStorage.setItem('search-history', JSON.stringify(updated))
      return updated
    })
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return new Date(timestamp).toLocaleDateString('zh-CN')
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
          onFocus={() => setShowHistory(true)}
          className="w-full pl-10 pr-20 py-2 border border-white/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/50 backdrop-blur-sm"
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
          
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1 rounded transition-colors ${
              showHistory ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="搜索历史"
          >
            <History className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 搜索选项面板 */}
      {showOptions && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/90 backdrop-blur-md border border-white/40 rounded-lg shadow-lg p-4 z-50">
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

      {/* 搜索历史面板 */}
      {showHistory && searchHistory.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/90 backdrop-blur-md border border-white/40 rounded-lg shadow-lg z-50">
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-900 flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                搜索历史
              </h3>
              <button
                onClick={clearHistory}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                清空
              </button>
            </div>
            
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer group"
                  onClick={() => handleHistoryClick(item)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{item.query}</div>
                    <div className="text-xs text-gray-500">
                      {formatTime(item.timestamp)} • {item.resultCount} 个结果
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeHistoryItem(item.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 ml-2"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 点击外部关闭面板 */}
      {(showOptions || showHistory) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowOptions(false)
            setShowHistory(false)
          }}
        />
      )}
    </div>
  )
}

export default AdvancedSearch
