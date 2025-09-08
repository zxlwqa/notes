import React from 'react'
import { Trash2, Calendar, FileText, Tag, Share2 } from 'lucide-react'
import { cn, getTagClassName } from '@/lib/utils'

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface NoteCardProps {
  note: Note
  onView: (note: Note) => void
  onDelete: (noteId: string) => void
  onDragStart?: (e: React.DragEvent, noteId: string) => void
  onDragEnd?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent, noteId: string) => void
  className?: string
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onView, onDelete, onDragStart, onDragEnd, onDragOver, onDrop, className }) => {
  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 获取内容预览（去除 Markdown 标记）
  const getPreview = (content: string | undefined) => {
    if (!content) return '暂无内容'
    
    // 简单的 Markdown 清理
    const cleanContent = content
      .replace(/#{1,6}\s+/g, '') // 移除标题标记
      .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体标记
      .replace(/\*(.*?)\*/g, '$1') // 移除斜体标记
      .replace(/`(.*?)`/g, '$1') // 移除代码标记
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接，保留文本
      .trim()
    
    return cleanContent.length > 100 
      ? cleanContent.substring(0, 100) + '...'
      : cleanContent
  }

  const handleCardClick = () => {
    onView(note)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡
    onDelete(note.id)
  }

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡
    
    // 创建阅读页面链接
    const shareUrl = window.location.origin + `/notes/${note.id}`
    
    // 复制链接到剪贴板
    navigator.clipboard.writeText(shareUrl).then(() => {
      // 显示成功提示
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

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', note.id)
    e.dataTransfer.effectAllowed = 'move'
    onDragStart?.(e, note.id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragOver?.(e)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    onDrop?.(e, note.id)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.style.opacity = '1'
    onDragEnd?.(e)
  }

  return (
    <div
      className={cn(
        'bg-white/40 hover:bg-white/42 backdrop-blur-lg rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 cursor-pointer border border-white/30 hover:border-white/40 group p-6',
        className
      )}
      onClick={handleCardClick}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 卡片头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
            {note.title || '无标题'}
          </h3>
          <div className="flex items-center mt-1 text-sm text-gray-500">
            <Calendar className="h-4 w-4 mr-1" />
            <span>更新于 {formatDate(note.updatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100" style={{ transition: 'none' }}>
          <button
            onClick={handleShareClick}
            className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md"
            title="分享笔记"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleDeleteClick}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md"
            title="删除笔记"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 卡片内容预览 */}
      <div className="flex items-start mb-3">
        <FileText className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
        <p className="flex-1 min-w-0 text-sm text-gray-600 leading-relaxed break-words overflow-hidden">
          {getPreview(note.content)}
        </p>
      </div>

      {/* 标签显示 */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {note.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className={cn(
                "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border",
                getTagClassName(tag)
              )}
            >
              <Tag className="h-3 w-3 mr-1" />
              {tag}
            </span>
          ))}
          {note.tags.length > 3 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
              +{note.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 卡片底部统计 */}
      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-white/30">
        <span>字数: {note.content?.length || 0}</span>
        <span>创建于 {formatDate(note.createdAt)}</span>
      </div>
    </div>
  )
}

export default NoteCard
