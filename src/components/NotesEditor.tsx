import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import SimpleMDE from 'react-simplemde-editor'
import 'easymde/dist/easymde.min.css'

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
  
  const getEditor = useCallback(() => {
    if (mdeRef.current && mdeRef.current.simpleMde) {
      return mdeRef.current.simpleMde
    }
    return null
  }, [])

  const handleChange = useCallback((newValue: string) => {
    onChange(newValue)
    
    const editor = getEditor()
    if (editor && editor.codemirror) {
      const cm = editor.codemirror
      setTimeout(() => {
        const cursor = cm.getCursor()
        cm.setCursor(cursor)
        cm.focus()
      }, 0)
    }
  }, [onChange, getEditor])

  const handlePaste = useCallback(async (cm: any) => {
    try {
      const clipboardData = await navigator.clipboard.readText()
      
      const processedText = clipboardData
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
      
      const cursor = cm.getCursor()
      const selection = cm.getSelection()
      
      if (selection) {
        cm.replaceSelection(processedText)
      } else {
        cm.replaceRange(processedText, cursor)
      }
      
      const newCursor = cm.getCursor()
      cm.setCursor(newCursor)
      cm.focus()
      
    } catch (error) {
      console.warn('粘贴处理失败，使用默认行为:', error)
      return false
    }
  }, [])

  const insertText = useCallback((before: string, after: string) => {
    let cm = null
    
    const editor = getEditor()
    if (editor && editor.codemirror) {
      cm = editor.codemirror
    }
    
    if (!cm && mdeRef.current && mdeRef.current.simpleMde && mdeRef.current.simpleMde.codemirror) {
      cm = mdeRef.current.simpleMde.codemirror
    }
    
    if (!cm) {
      const cmElement = document.querySelector('.CodeMirror')
      if (cmElement && (cmElement as any).CodeMirror) {
        cm = (cmElement as any).CodeMirror
      }
    }
    
    if (cm) {
      const selection = cm.getSelection()
      const cursor = cm.getCursor()
      
      if (selection) {
        cm.replaceSelection(before + selection + after)
      } else {
        cm.replaceRange(before + after, cursor)
        const newCursor = {
          line: cursor.line,
          ch: cursor.ch + before.length
        }
        cm.setCursor(newCursor)
      }
      
      setTimeout(() => {
        cm.focus()
        cm.triggerOnKeyDown()
      }, 0)
    } else {
      const textarea = document.querySelector('.CodeMirror textarea') as HTMLTextAreaElement
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = value.substring(0, start) + before + value.substring(start, end) + after + value.substring(end)
        onChange(newValue)
        
        setTimeout(() => {
          if (textarea) {
            textarea.focus()
            textarea.setSelectionRange(start + before.length, start + before.length)
          }
        }, 0)
      } else {
        const newValue = value + before + after
        onChange(newValue)
      }
    }
  }, [value, onChange, getEditor])

  const togglePreview = useCallback(() => {
    const editor = getEditor()
    if (editor) {
      try {
        if (editor.isPreviewActive()) {
          editor.togglePreview()
          setIsPreview(false)
        } else {
          editor.togglePreview()
          setIsPreview(true)
        }
      } catch (error) {
        setIsPreview(!isPreview)
        console.log('Preview mode:', !isPreview ? 'enabled' : 'disabled')
      }
    } else {
      setIsPreview(!isPreview)
      console.log('Editor not ready, preview mode:', !isPreview ? 'enabled' : 'disabled')
    }
  }, [isPreview, getEditor])

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

  const options = useMemo(() => {
    const extraKeys = {
      'Ctrl-V': function(cm: any) {
        handlePaste(cm)
      },
      'Cmd-V': function(cm: any) {
        handlePaste(cm)
      }
    }
    
    return {
      placeholder,
      spellChecker: false,
      status: false,
      autofocus: true,
      lineWrapping: true,
      autoDownloadFontAwesome: false,
      renderingConfig: {
        singleLineBreaks: true,
        codeSyntaxHighlighting: true,
      },
      autosave: {
        enabled: false,
      },
      toolbar: false,
      showIcons: false,
      cursorBlinkRate: 530,
      cursorHeight: 1.2,
      theme: 'default',
      lineNumbers: false,
      extraKeys,
      cursorScrollMargin: 0,
      inputStyle: 'contenteditable',
      direction: 'ltr',
      rtlMoveVisually: false,
      showCursorWhenSelecting: true,
      electricChars: false,
      smartIndent: false,
      indentUnit: 0,
    }
  }, [placeholder, handlePaste])

  useEffect(() => {
    const checkEditor = () => {
      if (mdeRef.current && mdeRef.current.simpleMde) {
        setEditorInstance(mdeRef.current.simpleMde)
        
        const cm = mdeRef.current.simpleMde.codemirror
        if (cm) {
          setTimeout(() => {
            const fixCursorPosition = () => {
              cm.refresh()
              
              const cursorElement = cm.getWrapperElement().querySelector('.CodeMirror-cursor')
              if (cursorElement) {
                cursorElement.style.cssText = `
                  border-left: 2px solid #3b82f6 !important;
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
            }
            
            fixCursorPosition()
            
            cm.focus()
            
            const handleCursorUpdate = () => {
              setTimeout(fixCursorPosition, 0)
            }
            
            cm.on('cursorActivity', handleCursorUpdate)
            cm.on('change', handleCursorUpdate)
            cm.on('focus', handleCursorUpdate)
            cm.on('blur', handleCursorUpdate)
            
            return () => {
              cm.off('cursorActivity', handleCursorUpdate)
              cm.off('change', handleCursorUpdate)
              cm.off('focus', handleCursorUpdate)
              cm.off('blur', handleCursorUpdate)
            }
          }, 100)
        }
      }
    }
    
    checkEditor()
    
    const timer = setInterval(checkEditor, 100)
    
    return () => {
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const editor = getEditor()
    if (editor && editor.codemirror) {
      const cm = editor.codemirror
      
      const handlePasteEvent = async (event: ClipboardEvent) => {
        event.preventDefault()
        
        try {
          const clipboardData = event.clipboardData?.getData('text/plain') || ''
          
          const processedText = clipboardData
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
          
          const cursor = cm.getCursor()
          const selection = cm.getSelection()
          
          if (selection) {
            cm.replaceSelection(processedText)
          } else {
            cm.replaceRange(processedText, cursor)
          }
          
          const newCursor = cm.getCursor()
          cm.setCursor(newCursor)
          cm.focus()
          
        } catch (error) {
          console.warn('粘贴处理失败:', error)
        }
      }
      
      cm.getWrapperElement().addEventListener('paste', handlePasteEvent)
      
      return () => {
        cm.getWrapperElement().removeEventListener('paste', handlePasteEvent)
      }
    }
  }, [editorInstance, getEditor])

  useEffect(() => {
    const timer = setTimeout(() => {
      const editor = getEditor()
      if (editor && editor.codemirror) {
        editor.codemirror.focus()
        editor.codemirror.refresh()
      }
    }, 200)
    
    return () => clearTimeout(timer)
  }, [getEditor])

  useEffect(() => {
    const applySettingsFromStorage = () => {
      try {
        const saved = localStorage.getItem('app-settings')
        if (saved) {
          const parsed = JSON.parse(saved)
          const fontSizeMap: Record<string, string> = { '小': '14px', '中': '16px', '大': '18px', '特大': '20px', '超大': '22px' }
          const resolvedFontSize = fontSizeMap[parsed.fontSize as keyof typeof fontSizeMap] || '14px'
          const resolvedLineHeight = '1.6'
          
          document.documentElement.style.setProperty('--global-font-size', resolvedFontSize)
          document.documentElement.style.setProperty('--global-line-height', resolvedLineHeight)
          
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
      {/* 顶部：仅保留标签展示与添加 */}
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderBottom: 'none',
        borderRadius: '8px 8px 0 0',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
          {tags && tags.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
          
          {onAddTag && onTagInputChange && onTagInputKeyPress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
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
                width: '120px',
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
              >
                +
              </button>
            </div>
          )}
      </div>

      {/* 主体：左侧垂直工具栏 + 右侧编辑器 */}
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: '420px' }}>
        {/* 左侧工具栏 */}
        <div style={{
          width: '56px',
          background: 'rgba(255,255,255,0.08)',
          borderRight: '1px solid rgba(255,255,255,0.2)',
          padding: '8px 6px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '6px',
          position: 'sticky',
          top: '50%',
          transform: 'translateY(-50%)',
          alignSelf: 'flex-start',
          zIndex: 5,
          borderRadius: '8px',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}>
          <button title="标题" onClick={() => insertText('# ', '')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>H1</button>
          <button title="二级标题" onClick={() => insertText('## ', '')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>H2</button>
          <button title="三级标题" onClick={() => insertText('### ', '')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>H3</button>
          <button title="代码块" onClick={() => insertText('```\n', '\n```')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>&lt;/&gt;</button>
          <button title="粗体" onClick={() => insertText('**', '**')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>B</button>
          <button title="斜体" onClick={() => insertText('*', '*')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>I</button>
          <button title="删除线" onClick={() => insertText('~~', '~~')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>S</button>
          <button title="引用" onClick={() => insertText('> ', '')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>&gt;</button>
          <button title="无序列表" onClick={() => insertText('- ', '')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>•</button>
          <button title="有序列表" onClick={() => insertText('1. ', '')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>1.</button>
          <button title="任务列表" onClick={() => insertText('- [ ] ', '')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>☐</button>
          <button title="链接" onClick={() => insertText('[', '](url)')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>🔗</button>
          <button title="图片" onClick={() => insertText('![', '](url)')} style={{ background: 'transparent', color: '#fff', border: '1px solid transparent', borderRadius: '6px', padding: '8px 0', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>🖼️</button>
      </div>

        {/* 右侧编辑器 */}
        <div style={{ flex: 1, minWidth: 0 }}>
      <SimpleMDE
        ref={mdeRef}
        value={value}
        onChange={handleChange}
        options={options}
        key="stable-editor"
      />
        </div>
      </div>

      {/* 简化的编辑器样式 */}
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
        .notes-editor-container .CodeMirror pre { 
          white-space: pre-wrap !important; 
          word-wrap: break-word !important; 
          word-break: break-all !important;
          overflow-wrap: break-word !important;
        }
        .notes-editor-container .CodeMirror, .notes-editor-container .editor-toolbar, .notes-editor-container .editor-statusbar { background: transparent !important; }
        .notes-editor-container .CodeMirror-gutters { background: transparent !important; border: none !important; }
        
        /* 简化的光标样式 */
        .notes-editor-container .CodeMirror .CodeMirror-cursor {
          border-left: 2px solid #3b82f6 !important;
          border-right: none !important;
          width: 0 !important;
          height: 1.2em !important;
          background: transparent !important;
          animation: cursor-blink 1s infinite !important;
          position: relative !important;
          vertical-align: baseline !important;
          display: inline-block !important;
          line-height: 1.6 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        
        .notes-editor-container .CodeMirror.CodeMirror-focused .CodeMirror-cursor {
          border-left-width: 3px !important;
          border-left-color: #2563eb !important;
        }
        
        @keyframes cursor-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0.3; }
        }
        
        /* 编辑器文本区域样式 */
        .notes-editor-container .CodeMirror {
          color: #1f2937 !important;
          background: transparent !important;
          height: auto !important;
        }
        
        .notes-editor-container .CodeMirror-lines {
          padding: 16px !important;
        }
        .notes-editor-container .CodeMirror-scroll {
          max-height: none !important;
          overflow-y: visible !important;
        }
        
        /* 文本行样式 */
        .notes-editor-container .CodeMirror .CodeMirror-line {
          line-height: 1.6 !important;
          height: auto !important;
          min-height: 1.6em !important;
          font-size: var(--editor-font-size, 14px) !important;
          font-family: var(--editor-font-family, 'Monaco', 'Menlo', 'Ubuntu Mono', monospace) !important;
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          word-break: break-all !important;
          overflow-wrap: break-word !important;
        }
        
        .notes-editor-container .CodeMirror .CodeMirror-line span {
          line-height: 1.6 !important;
          vertical-align: baseline !important;
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          word-break: break-all !important;
          overflow-wrap: break-word !important;
        }
      `}</style>


    </div>
  )
}

export default NotesEditor
