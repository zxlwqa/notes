import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import SimpleMDE from 'react-simplemde-editor'
import 'easymde/dist/easymde.min.css'
import { usePerfMonitor } from '@/hooks/usePerfMonitor'

interface NotesEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  tags?: string[]
  onTagsChange?: (tags: string[]) => void
  tagInput?: string
  onTagInputChange?: (value: string) => void
  onAddTag?: () => void
  onRemoveTag?: (tag: string) => void
  onTagInputKeyPress?: (e: React.KeyboardEvent) => void
}

const NotesEditor: React.FC<NotesEditorProps> = ({ 
  value, 
  onChange, 
  placeholder = '开始编写您的笔记...',
  tags = [],
  onTagsChange,
  tagInput = '',
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onTagInputKeyPress
}) => {
  const mdeRef = useRef<any>(null)
  const [isPreview, setIsPreview] = useState(false)
  const [showScroll, setShowScroll] = useState(true)
  const [editorInstance, setEditorInstance] = useState<any>(null)
  
  // 性能监控
  const { startRender, endRender } = usePerfMonitor('NotesEditor')

  // 使用 useCallback 优化 onChange 函数
  const handleChange = useCallback((newValue: string) => {
    onChange(newValue)
  }, [onChange])

  // 获取编辑器实例
  const getEditor = useCallback(() => {
    if (mdeRef.current && mdeRef.current.simpleMde) {
      return mdeRef.current.simpleMde
    }
    return null
  }, [])

  // 在编辑器挂载后记录渲染完成
  useEffect(() => {
    if (editorInstance) {
      endRender()
    }
  }, [editorInstance, endRender])

  // 处理粘贴事件的函数
  const handlePaste = useCallback(async (cm: any) => {
    try {
      // 获取剪贴板内容
      const clipboardData = await navigator.clipboard.readText()
      
      // 处理粘贴的文本，确保换行符正确处理
      const processedText = clipboardData
        .replace(/\r\n/g, '\n')  // 统一换行符
        .replace(/\r/g, '\n')    // 处理Mac风格的换行符
      
      // 获取当前光标位置
      const cursor = cm.getCursor()
      const selection = cm.getSelection()
      
      // 如果有选中文本，替换选中内容；否则在光标位置插入
      if (selection) {
        cm.replaceSelection(processedText)
      } else {
        cm.replaceRange(processedText, cursor)
      }
      
      // 确保光标位置正确，避免换行问题
      const newCursor = cm.getCursor()
      cm.setCursor(newCursor)
      cm.focus()
      
    } catch (error) {
      console.warn('粘贴处理失败，使用默认行为:', error)
      // 如果处理失败，让编辑器使用默认的粘贴行为
      return false
    }
  }, [])

  // 插入文本的辅助函数
  const insertText = useCallback((before: string, after: string) => {
    const editor = getEditor()
    if (editor && editor.codemirror) {
      const cm = editor.codemirror
      const selection = cm.getSelection()
      cm.replaceSelection(before + selection + after)
      cm.focus()
    } else {
      // 如果编辑器还没准备好，直接在当前光标位置插入文本
      const textarea = document.querySelector('.CodeMirror textarea') as HTMLTextAreaElement
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = value.substring(0, start) + before + value.substring(start, end) + after + value.substring(end)
        onChange(newValue)
        
        // 设置新的光标位置
        setTimeout(() => {
          if (textarea) {
            textarea.focus()
            textarea.setSelectionRange(start + before.length, start + before.length)
          }
        }, 0)
      }
    }
  }, [value, onChange, getEditor])

  // 切换预览模式
  const togglePreview = useCallback(() => {
    const editor = getEditor()
    if (editor) {
      try {
        // 尝试使用 EasyMDE 的预览功能
        if (editor.isPreviewActive()) {
          editor.togglePreview()
          setIsPreview(false)
        } else {
          editor.togglePreview()
          setIsPreview(true)
        }
      } catch (error) {
        // 如果 EasyMDE 预览功能不可用，手动切换状态
        setIsPreview(!isPreview)
        console.log('Preview mode:', !isPreview ? 'enabled' : 'disabled')
      }
    } else {
      // 如果编辑器还没准备好，手动切换状态
      setIsPreview(!isPreview)
      console.log('Editor not ready, preview mode:', !isPreview ? 'enabled' : 'disabled')
    }
  }, [isPreview, getEditor])

  // 切换到编辑模式
  const switchToEdit = useCallback(() => {
    const editor = getEditor()
    if (editor) {
      try {
        if (editor.isPreviewActive()) {
          editor.togglePreview()
        }
        setIsPreview(false)
      } catch (error) {
        setIsPreview(false)
        console.log('Switched to edit mode')
      }
    } else {
      setIsPreview(false)
      console.log('Editor not ready, switched to edit mode')
    }
  }, [getEditor])

  // 切换到预览模式
  const switchToPreview = useCallback(() => {
    const editor = getEditor()
    if (editor) {
      try {
        if (!editor.isPreviewActive()) {
          editor.togglePreview()
        }
        setIsPreview(true)
      } catch (error) {
        setIsPreview(true)
        console.log('Switched to preview mode')
      }
    } else {
      setIsPreview(true)
      console.log('Editor not ready, switched to preview mode')
    }
  }, [getEditor])

  // 编辑器配置选项 - 使用 useMemo 稳定对象引用，关闭自动聚焦避免抢占输入焦点
  const options = useMemo(() => ({
    placeholder,
    spellChecker: false,
    status: false,
    autofocus: false,
    lineWrapping: true,
    autoDownloadFontAwesome: false,
    renderingConfig: {
      singleLineBreaks: false,
      codeSyntaxHighlighting: true,
    },
    autosave: {
      enabled: false,
    },
    // 完全禁用默认工具栏
    toolbar: false,
    showIcons: false,
    // 光标配置 - 修复光标位置问题
    cursorBlinkRate: 1000,
    cursorHeight: 1,
    // 确保光标可见
    theme: 'default',
    // CodeMirror 特定配置
    lineNumbers: false,
    foldGutter: false,
    gutters: [],
    // 修复光标定位
    lineWiseCopyCut: true,
    // 添加粘贴事件处理
    extraKeys: {
      'Ctrl-V': function(cm: any) {
        handlePaste(cm)
      },
      'Cmd-V': function(cm: any) {
        handlePaste(cm)
      },
      'Enter': function(cm: any) {
        // 确保回车后光标位置正确
        cm.replaceSelection('\n')
        const cursor = cm.getCursor()
        cm.setCursor(cursor)
        cm.focus()
      }
    }
  }), [placeholder, handlePaste])

  // 监听编辑器实例变化
  useEffect(() => {
    if (mdeRef.current && mdeRef.current.simpleMde) {
      setEditorInstance(mdeRef.current.simpleMde)
    }
  }, [mdeRef.current])

  // 添加粘贴事件监听器和光标修复
  useEffect(() => {
    const editor = getEditor()
    if (editor && editor.codemirror) {
      const cm = editor.codemirror
      
      // 修复光标位置和样式
      const fixCursorPosition = () => {
        // 强制设置光标样式
        const cursorElement = cm.getWrapperElement().querySelector('.CodeMirror-cursor')
        if (cursorElement) {
          cursorElement.style.height = '1.2em'
          cursorElement.style.verticalAlign = 'baseline'
          cursorElement.style.position = 'relative'
          cursorElement.style.display = 'inline-block'
          cursorElement.style.lineHeight = '1.6'
          cursorElement.style.margin = '0'
          cursorElement.style.padding = '0'
          cursorElement.style.top = '0'
          cursorElement.style.bottom = 'auto'
        }
        
        // 确保文本行正确对齐
        const lines = cm.getWrapperElement().querySelectorAll('.CodeMirror-line')
        lines.forEach((line: any) => {
          line.style.lineHeight = '1.6'
          line.style.height = '1.6em'
          line.style.display = 'block'
          line.style.verticalAlign = 'baseline'
          line.style.position = 'relative'
        })
        
        // 确保文本内容与光标对齐
        const textElements = cm.getWrapperElement().querySelectorAll('.CodeMirror-line span')
        textElements.forEach((span: any) => {
          span.style.verticalAlign = 'baseline'
          span.style.lineHeight = '1.6'
          span.style.display = 'inline'
        })
      }
      
      // 添加粘贴事件监听器
      const handlePasteEvent = async (event: ClipboardEvent) => {
        event.preventDefault()
        
        try {
          const clipboardData = event.clipboardData?.getData('text/plain') || ''
          
          // 处理粘贴的文本，确保换行符正确处理
          const processedText = clipboardData
            .replace(/\r\n/g, '\n')  // 统一换行符
            .replace(/\r/g, '\n')    // 处理Mac风格的换行符
          
          // 获取当前光标位置
          const cursor = cm.getCursor()
          const selection = cm.getSelection()
          
          // 如果有选中文本，替换选中内容；否则在光标位置插入
          if (selection) {
            cm.replaceSelection(processedText)
          } else {
            cm.replaceRange(processedText, cursor)
          }
          
          // 确保光标位置正确，避免换行问题
          const newCursor = cm.getCursor()
          cm.setCursor(newCursor)
          cm.focus()
          
        } catch (error) {
          console.warn('粘贴处理失败:', error)
          // 如果处理失败，让浏览器使用默认的粘贴行为
        }
      }
      
      // 添加光标位置修复事件
      const handleCursorActivity = () => {
        setTimeout(fixCursorPosition, 0)
      }
      
      // 添加输入事件监听器
      const handleInput = () => {
        setTimeout(fixCursorPosition, 0)
      }
      
      // 绑定事件
      cm.getWrapperElement().addEventListener('paste', handlePasteEvent)
      cm.on('cursorActivity', handleCursorActivity)
      cm.on('change', handleInput)
      
      // 立即修复光标位置
      setTimeout(fixCursorPosition, 100)
      
      // 添加更强制性的光标修复
      const forceFixCursor = () => {
        const cursorElement = cm.getWrapperElement().querySelector('.CodeMirror-cursor')
        if (cursorElement) {
          // 强制重置所有样式
          cursorElement.style.cssText = `
            border-left: 2px solid #ef4444 !important;
            border-right: none !important;
            width: 0 !important;
            height: 1.2em !important;
            background: transparent !important;
            position: relative !important;
            vertical-align: baseline !important;
            display: inline-block !important;
            line-height: 1.6 !important;
            margin: 0 !important;
            padding: 0 !important;
            top: 0 !important;
            bottom: auto !important;
          `
        }
        
        // 强制修复文本行对齐
        const lines = cm.getWrapperElement().querySelectorAll('.CodeMirror-line')
        lines.forEach((line: any) => {
          line.style.cssText = `
            line-height: 1.6 !important;
            height: 1.6em !important;
            display: block !important;
            vertical-align: baseline !important;
            position: relative !important;
            margin: 0 !important;
            padding: 0 !important;
          `
        })
        
        // 强制修复文本内容对齐
        const textElements = cm.getWrapperElement().querySelectorAll('.CodeMirror-line span')
        textElements.forEach((span: any) => {
          span.style.cssText = `
            vertical-align: baseline !important;
            line-height: 1.6 !important;
            display: inline !important;
            margin: 0 !important;
            padding: 0 !important;
          `
        })
      }
      
      // 立即强制修复
      forceFixCursor()
      
      // 定期强制修复光标位置
      const interval = setInterval(forceFixCursor, 500)
      
      // 在组件卸载时清理定时器
      return () => {
        clearInterval(interval)
        // 清理事件监听器
        cm.getWrapperElement().removeEventListener('paste', handlePasteEvent)
        cm.off('cursorActivity', handleCursorActivity)
        cm.off('change', handleInput)
      }
    }
  }, [editorInstance, getEditor])

  // 将用户设置应用到编辑器根容器（通过 CSS 变量）
  useEffect(() => {
    const applySettingsFromStorage = () => {
      try {
        const saved = localStorage.getItem('app-settings')
        if (saved) {
          const parsed = JSON.parse(saved)
          const fontSizeMap: Record<string, string> = { '小': '12px', '中': '14px', '大': '16px', '特大': '18px', '超大': '20px' }
          const resolvedFontSize = fontSizeMap[parsed.fontSize as keyof typeof fontSizeMap] || '14px'
          const resolvedLineHeight = '1.6'
          
          // 设置全局字体大小
          document.documentElement.style.setProperty('--global-font-size', resolvedFontSize)
          document.documentElement.style.setProperty('--global-line-height', resolvedLineHeight)
          
          // 保持编辑器字体大小设置（向后兼容）
          document.documentElement.style.setProperty('--editor-font-size', resolvedFontSize)
          document.documentElement.style.setProperty('--editor-line-height', resolvedLineHeight)
          const bg = parsed.backgroundImageUrl?.trim()
          if (bg) {
            document.documentElement.style.setProperty('--app-bg-image', `url('${bg}')`)
          } else {
            document.documentElement.style.removeProperty('--app-bg-image')
          }
          const familyMap: Record<string, string> = {
            '默认': "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
            '宋体': "'SimSun', 'Songti SC', 'Noto Serif SC', serif",
            '楷体': "'KaiTi', 'Kaiti SC', 'STKaiti', 'Noto Serif SC', serif",
            '黑体': "'Heiti SC', 'SimHei', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
            '微软雅黑': "'Microsoft YaHei', 'Noto Sans SC', sans-serif",
            '思源黑体': "'Noto Sans SC', 'Source Han Sans SC', sans-serif",
            '思源宋体': "'Noto Serif SC', 'Source Han Serif SC', serif",
            '苹方': "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif",
            '仿宋': "'FangSong', 'FZSongYi-Z13', 'Songti SC', 'Noto Serif SC', serif",
            '隶书': "'LiSu', 'STLiti', 'KaiTi', 'Noto Serif SC', serif"
          }
          const resolvedFamily = familyMap[parsed.fontFamily as keyof typeof familyMap] || familyMap['默认']
          document.documentElement.style.setProperty('--editor-font-family', resolvedFamily)
        }
      } catch {}
    }

    applySettingsFromStorage()

    const handler = () => applySettingsFromStorage()
    window.addEventListener('settings-changed' as any, handler)
    return () => {
      window.removeEventListener('settings-changed' as any, handler)
    }
  }, [])

  return (
    <div className="notes-editor-container" style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)' }}>
      {/* 自定义工具栏 */}
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderBottom: 'none',
        borderRadius: '8px 8px 0 0',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        color: '#111827'
      }}>
        {/* 标签页 */}
        <div style={{ display: 'flex', gap: '2px', marginRight: '16px' }}>
          <button
            onClick={switchToEdit}
            style={{
              background: isPreview ? '#374151' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            编辑
          </button>
          <button
            onClick={switchToPreview}
            style={{
              background: isPreview ? '#3b82f6' : '#374151',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            预览
          </button>
        </div>

        {/* 工具栏按钮 */}
        <button
          onClick={() => insertText('# ', '')}
          title="标题"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          H
        </button>

        <button
          onClick={() => insertText('**', '**')}
          title="粗体"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          B
        </button>

        <button
          onClick={() => insertText('*', '*')}
          title="斜体"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          I
        </button>

        <button
          onClick={() => insertText('~~', '~~')}
          title="删除线"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          S
        </button>

        <button
          onClick={() => insertText('\n---\n', '')}
          title="水平线"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          —
        </button>

        <button
          onClick={() => insertText('> ', '')}
          title="引用"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          66
        </button>

        <button
          onClick={() => insertText('- ', '')}
          title="无序列表"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          •
        </button>

        <button
          onClick={() => insertText('1. ', '')}
          title="有序列表"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          1.
        </button>

        <button
          onClick={() => insertText('- [ ] ', '')}
          title="任务列表"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          ☐
        </button>

        <button
          onClick={() => insertText('![', '](url)')}
          title="图片"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          🖼️
        </button>

        <button
          onClick={() => insertText('[', '](url)')}
          title="链接"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          🔗
        </button>

        <button
          onClick={() => insertText('```\n', '\n```')}
          title="代码块"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '8px 12px',
            margin: '2px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            minWidth: '32px',
            textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4b5563'
            e.currentTarget.style.borderColor = '#6b7280'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          &lt;/&gt; CB
        </button>

        {/* Scroll开关 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {/* 标签管理 */}
          {tags && tags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '16px' }}>
              {tags.map((tag, index) => (
                <span
                  key={index}
                  style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#3b82f6',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: '12px',
                    padding: '2px 8px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  🏷️ {tag}
                  {onRemoveTag && (
                    <button
                      onClick={() => onRemoveTag(tag)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#3b82f6',
                        cursor: 'pointer',
                        padding: '0',
                        marginLeft: '4px',
                        fontSize: '12px'
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          
          {/* 标签输入 */}
          {onAddTag && onTagInputChange && onTagInputKeyPress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '16px' }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => onTagInputChange(e.target.value)}
                onKeyPress={onTagInputKeyPress}
                placeholder="添加标签..."
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '2px solid rgba(255, 255, 255, 0.4)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: '#ffffff',
                  outline: 'none',
                  width: '90px',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
                onFocus={(e) => {
                  e.target.style.border = '2px solid rgba(59, 130, 246, 0.8)'
                  e.target.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)'
                }}
                onBlur={(e) => {
                  e.target.style.border = '2px solid rgba(255, 255, 255, 0.4)'
                  e.target.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
              />
              <button
                onClick={onAddTag}
                style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '2px solid rgba(59, 130, 246, 0.6)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease',
                  minWidth: '32px',
                  textAlign: 'center',
                  boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)'
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.8)'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.6)'
                  e.currentTarget.style.boxShadow = '0 0 0 1px rgba(59, 130, 246, 0.1)'
                }}
              >
                +
              </button>
            </div>
          )}
          
          <span style={{ color: '#ffffff', fontSize: '14px' }}>Scroll</span>
          <button
            onClick={() => setShowScroll(!showScroll)}
            style={{
              background: showScroll ? '#3b82f6' : '#374151',
              border: 'none',
              borderRadius: '12px',
              width: '40px',
              height: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          />
        </div>
      </div>

      <SimpleMDE
        ref={mdeRef}
        value={value}
        onChange={handleChange}
        options={options}
        key="stable-editor"
      />

      {/* 隐藏横向滚动条并启用自动换行的兜底样式 */}
      <style>{`
        .notes-editor-container { overflow-x: hidden !important; }
        .notes-editor-container .CodeMirror,
        .notes-editor-container .CodeMirror-scroll,
        .notes-editor-container .CodeMirror-wrap,
        .notes-editor-container .CodeMirror-wrap .CodeMirror-scroll { overflow-x: hidden !important; }
        .notes-editor-container .CodeMirror-hscrollbar,
        .notes-editor-container .CodeMirror-hscrollbar > div { display: none !important; height: 0 !important; }
        .notes-editor-container .CodeMirror-sizer { min-width: 0 !important; }
        .notes-editor-container .editor-preview,
        .notes-editor-container .editor-preview-side { overflow-x: hidden !important; }
        .notes-editor-container .CodeMirror pre { white-space: pre-wrap; word-wrap: break-word; }
        .notes-editor-container .CodeMirror, .notes-editor-container .editor-toolbar, .notes-editor-container .editor-statusbar { background: transparent !important; }
        .notes-editor-container .CodeMirror-gutters { background: transparent !important; border: none !important; }
        
        /* 编辑器光标样式 - 简化版本 */
        .notes-editor-container .CodeMirror-cursor {
          border-left: 2px solid #ef4444 !important;
          border-right: none !important;
          width: 0 !important;
          height: 1.2em !important;
          background: transparent !important;
          animation: cursor-blink 1s infinite !important;
          position: relative !important;
          vertical-align: baseline !important;
          display: inline-block !important;
          line-height: 1.6 !important;
        }
        
        .notes-editor-container .CodeMirror.CodeMirror-focused .CodeMirror-cursor {
          border-left-width: 3px !important;
          border-left-color: #dc2626 !important;
          animation: cursor-blink 0.8s infinite !important;
        }
        
        @keyframes cursor-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0.3; }
        }
        
        /* 保持编辑器文本区域原有的透明背景 */
        .notes-editor-container .CodeMirror {
          color: #1f2937 !important;
          background: transparent !important;
        }
        
        .notes-editor-container .CodeMirror-lines {
          padding: 16px !important;
        }
        
        /* 粘贴文本格式优化 */
        .notes-editor-container .CodeMirror pre {
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
        }
        
        /* 确保粘贴后的文本保持正确的换行 */
        .notes-editor-container .CodeMirror .CodeMirror-line {
          white-space: pre-wrap !important;
        }
        
        /* 确保文本行与光标对齐 */
        .notes-editor-container .CodeMirror .CodeMirror-line {
          line-height: 1.6 !important;
          height: 1.6em !important;
          font-size: var(--editor-font-size, 14px) !important;
          font-family: var(--editor-font-family, 'Monaco', 'Menlo', 'Ubuntu Mono', monospace) !important;
          display: block !important;
          vertical-align: baseline !important;
          position: relative !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        
        .notes-editor-container .CodeMirror .CodeMirror-line span {
          line-height: 1.6 !important;
          vertical-align: baseline !important;
          display: inline !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        
        /* 确保光标与文本在同一行 */
        .notes-editor-container .CodeMirror .CodeMirror-line .CodeMirror-cursor {
          vertical-align: baseline !important;
          position: relative !important;
          top: 0 !important;
          bottom: auto !important;
          height: 1.2em !important;
          line-height: 1.6 !important;
        }
      `}</style>


    </div>
  )
}

export default NotesEditor
