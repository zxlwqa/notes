/* eslint-disable no-unused-vars -- type-only parameters */
import type { MouseEvent } from 'react'

export type MarkdownInserter = (before: string, after: string) => void

let inserter: MarkdownInserter | null = null

export function setMarkdownInserter(fn: MarkdownInserter | null) {
  inserter = fn
}

export function insertMarkdown(before: string, after: string) {
  if (!inserter) {
    console.warn('[toolbar] 编辑器尚未就绪，无法插入 Markdown')
    return
  }
  inserter(before, after)
}

/** 供 Toolbar 使用：保持 CodeMirror 焦点并在当前光标处插入 */
export function toolbarInsert(e: MouseEvent, before: string, after: string) {
  e.preventDefault()
  const cmEl = document.querySelector('.notes-editor-container .CodeMirror') as
    | (HTMLElement & { CodeMirror?: { focus: () => void } })
    | null
  cmEl?.CodeMirror?.focus()
  insertMarkdown(before, after)
}
