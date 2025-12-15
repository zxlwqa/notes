import React, { useState, useEffect } from 'react'
import { X, Palette, User, Shield, Database, Cloud, Eye, EyeOff, Upload } from 'lucide-react'
import { authApi, notesApi, cloudApi, gistApi, r2Api, logsApi } from '@/lib/api'
import { AlertModal, ConfirmModal, PromptModal, SelectModal } from './Modal'
import { useModal } from '../hooks/Modal'
import { loadAndApplyBackground } from '@/lib/webp'
import type { 
  AppSettings, 
  Note,
  ImportFormat
} from '@/types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  const defaultSettings: AppSettings = {
    fontSize: '中',
    backgroundImageUrl: '',
    logoUrl: '',
    fontFamily: '默认',
    theme: 'light',
    autoSave: true,
    spellCheck: false,
    syntaxHighlight: true,
    lineNumbers: false,
    username: '',
    emailNotification: false,
    shortcutHints: true,
    autoLock: true,
    lockTimeout: '15分钟',
    passwordStrength: '中'
  }

  const [settings, setSettings] = useState(defaultSettings)
  const [_currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [_confirmPassword, setConfirmPassword] = useState('')
  const [changing, setChanging] = useState(false)
  const [passwordSource, setPasswordSource] = useState<'d1' | 'env' | 'postgresql' | 'unknown'>('unknown')
  const [showPassword, setShowPassword] = useState(false)

  const modal = useModal()


  useEffect(() => {
    const savedSettings = localStorage.getItem('app-settings')
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings)
        setSettings({ ...defaultSettings, ...parsedSettings })
      } catch (error) {
        console.error('加载设置失败:', error)
      }
    }
    
    checkPasswordSource()
  }, [])

  useEffect(() => {
    if (isOpen) {
      setNewPassword('')
      setCurrentPassword('')
      setConfirmPassword('')
    }
  }, [isOpen])

  const checkPasswordSource = async () => {
    try {
      const response = await authApi.getPasswordStatus()
      
      if (response.data?.usingD1) {
        setPasswordSource('d1')
      } else if (response.data?.usingPostgreSQL) {
        setPasswordSource('postgresql')
      } else if (response.data?.passwordSource) {
        setPasswordSource(response.data.passwordSource)
      } else {
        setPasswordSource('env')
      }
    } catch {
      setPasswordSource('env')
    }
  }

  const settingsCategories = [
    {
      title: '外观设置',
      icon: <Palette className="h-5 w-5" />,
      options: [
        { label: '字体大小', value: 'fontSize', type: 'select', options: ['小', '中', '大', '特大', '超大'], default: '中' }
        ,{ label: '字体', value: 'fontFamily', type: 'select', options: ['默认', '宋体', '楷体', '黑体', '微软雅黑', '思源黑体', '思源宋体', '苹方', '仿宋', '隶书'], default: '默认' }
        ,{ label: '背景图URL', value: 'backgroundImageUrl', type: 'input', default: '' }
      ]
    },
    {
      title: '用户设置',
      icon: <User className="h-5 w-5" />,
      options: [
        { label: '用户名', value: 'username', type: 'input', default: '' },
        { label: 'logo图URL', value: 'logoUrl', type: 'input', default: '' }
      ]
    },
          {
        title: '笔记备份',
        icon: <Database className="h-5 w-5" />,
        options: [
          { label: '上传下载笔记', value: 'backupNotes', type: 'custom', default: null },
          { label: '云端笔记', value: 'cloudNotes', type: 'custom', default: null },
          { label: 'GitHub Gist', value: 'gistNotes', type: 'custom', default: null },
          { label: 'Cloudflare R2', value: 'r2Notes', type: 'custom', default: null }
        ]
      }
      ,{
        title: '日志功能',
        icon: <Cloud className="h-5 w-5" />,
        options: [
          { label: '查看后端调用日志', value: 'viewLogs', type: 'custom', default: null }
        ]
      }
  ]

  const handleSettingChange = (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const toggleSetting = (key: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev]
    }))
  }

  const handleSave = () => {
    localStorage.setItem('app-settings', JSON.stringify(settings))
    try {
      const fontSizeMap: Record<string, string> = { '小': '14px', '中': '16px', '大': '18px', '特大': '20px', '超大': '22px' }
      const resolvedFontSize = fontSizeMap[settings.fontSize as keyof typeof fontSizeMap] || '14px'
      const resolvedLineHeight = '1.6'
      
      document.documentElement.style.setProperty('--global-font-size', resolvedFontSize)
      document.documentElement.style.setProperty('--global-line-height', resolvedLineHeight)
      
      document.documentElement.style.setProperty('--editor-font-size', resolvedFontSize)
      document.documentElement.style.setProperty('--editor-line-height', resolvedLineHeight)
      
      loadAndApplyBackground(
        settings.backgroundImageUrl,
        () => {},
        () => {}
      )
      if (typeof settings.logoUrl === 'string') {
        const href = settings.logoUrl.trim()
        let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        if (href) {
          link.href = href
        }
      }
      const family = settings.fontFamily
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
      const resolvedFamily = familyMap[family] || familyMap['默认']
      document.documentElement.style.setProperty('--editor-font-family', resolvedFamily)
      if (settings.username && typeof settings.username === 'string') {
        document.title = settings.username
      }
      window.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }))
      
      modal.showAlert('外观设置已保存并生效！', { 
        type: 'success',
        title: '设置成功',
        confirmText: '确定'
      })
    } catch (e) {
      console.warn('应用外观设置到 CSS 变量时出错:', e)
      modal.showAlert('设置保存失败，请重试', { 
        type: 'error',
        title: '保存失败',
        confirmText: '确定'
      })
    }
    onClose()
  }


  const handleLogout = () => {
    try {
      localStorage.removeItem('password')
      sessionStorage.clear()
    } catch {}
    window.location.href = '/login'
  }


  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  const [cloudSyncing, setCloudSyncing] = useState(false)

  const [gistSyncing, setGistSyncing] = useState(false)

  const [r2Syncing, setR2Syncing] = useState(false)

  const [logsOpen, setLogsOpen] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsText, setLogsText] = useState('')
  const [logsData, setLogsData] = useState<{ success?: boolean; source?: string; count?: number; items?: Array<{ id?: number; level?: string; message?: string; meta?: string; created_at?: string; [key: string]: unknown }> } | null>(null)
  const [logsView, setLogsView] = useState<'table' | 'json'>('table')

  const [uploadingImage, setUploadingImage] = useState(false)

  const translateLevel = (level?: string) => {
    if (!level) return '信息'
    const map: Record<string, string> = { info: '信息', warn: '警告', warning: '警告', error: '错误', debug: '调试' }
    return map[level] || level
  }
  const translateCountry = (codeOrName?: string) => {
    if (!codeOrName) return ''
    const code = codeOrName.toUpperCase()
    const map: Record<string, string> = {
      CN: '中国', HK: '中国香港', MO: '中国澳门', TW: '中国台湾',
      US: '美国', JP: '日本', KR: '韩国', SG: '新加坡', DE: '德国', FR: '法国',
      GB: '英国', RU: '俄罗斯', AU: '澳大利亚', CA: '加拿大', IN: '印度'
    }
    return map[code] || codeOrName
  }
  const translateCity = (city?: string) => {
    if (!city) return ''
    const map: Record<string, string> = {
      Beijing: '北京', Shanghai: '上海', Shenzhen: '深圳', Guangzhou: '广州',
      Tokyo: '东京', Osaka: '大阪', Kyoto: '京都',
      Singapore: '新加坡',
      Seoul: '首尔', Busan: '釜山',
      NewYork: '纽约', 'New York': '纽约', LosAngeles: '洛杉矶', 'Los Angeles': '洛杉矶',
      London: '伦敦', Paris: '巴黎', Berlin: '柏林', Sydney: '悉尼', Toronto: '多伦多',
    }
    return map[city] || city
  }
  const translateMessage = (msg?: string) => {
    if (!msg) return ''
    
    if (msg.includes('Order data saved:')) {
      const keyMatch = msg.match(/Order data saved:\s*([\w-]+)/)
      if (keyMatch) {
        const key = keyMatch[1]
        if (key === 'note-order') return '笔记顺序已保存'
        if (key === 'tag-order') return '标签顺序已保存'
        if (key === 'note') return '笔记顺序已保存'
        if (key === 'tag') return '标签顺序已保存'
        return `位置信息已保存：${key}`
      }
      return '位置信息已保存'
    }
    
    const map: Record<string, string> = {
      'login.success': '登录成功',
      'login.invalid_password': '登录失败：密码不正确',
      'login.missing_password': '登录失败：缺少密码',
      'login.exception': '登录异常',
      'login:request': '登录请求',
      'login:success': '登录成功',
      'login:failure': '登录失败',
      'login:unhandled': '登录异常',
      'login:log:error': '登录日志写入失败',
      'notes.list': '获取笔记列表',
      'notes.delete': '删除笔记',
      'notes.delete.not_found': '删除笔记失败：未找到',
      'notes.delete.exception': '删除笔记异常',
      'notes.create': '创建笔记',
      'notes.create.exception': '创建笔记异常',
      'notes.update': '更新笔记',
      'notes.update.exception': '更新笔记异常',
      'notes:request': '笔记请求',
      'notes:get:start': '获取笔记列表',
      'notes:get:success': '获取笔记列表成功',
      'notes:get:error': '获取笔记列表失败',
      'notes:post:start': '创建笔记',
      'notes:post:success': '创建笔记成功',
      'notes:post:error': '创建笔记失败',
      'note:request': '单条笔记请求',
      'note:get:start': '获取笔记',
      'note:get:success': '获取笔记成功',
      'note:get:error': '获取笔记失败',
      'note:put:start': '更新笔记',
      'note:put:success': '更新笔记成功',
      'note:put:error': '更新笔记失败',
      'note:delete:start': '删除笔记',
      'note:delete:success': '删除笔记成功',
      'note:delete:error': '删除笔记失败',
      'backup.upload.no_notes': '备份上传：没有可导出的笔记',
      'backup.upload.success': '备份上传成功',
      'backup.upload.failed': '备份上传失败',
      'backup.upload.exception': '备份上传异常',
      'backup.download.success': '备份下载并导入成功',
      'backup.download.failed': '备份下载失败',
      'backup.download.exception': '备份下载异常',
      'backup:get:start': '获取备份',
      'backup:get:success': '获取备份成功',
      'backup:get:error': '获取备份失败',
      'backup:post:start': '创建备份',
      'backup:post:success': '创建备份成功',
      'backup:post:error': '创建备份失败',
      'backup:download:success': '从云端下载笔记成功',
      'backup:download:error': '从云端下载笔记失败',
      'backup:clear:success': '清理笔记成功',
      'backup:clear:error': '清理笔记失败',
      'backup:unhandled': '备份异常',
      'gist:post:no_notes': 'Gist上传：没有可导出的笔记',
      'gist:post:no_token': 'Gist上传：GitHub Token未配置',
      'gist:post:success': 'Gist上传成功',
      'gist:post:error': 'Gist上传失败',
      'gist:get:no_token': 'Gist下载：GitHub Token未配置',
      'gist:get:no_id': 'Gist下载：未找到Gist ID',
      'gist:get:no_content': 'Gist下载：Gist中没有找到笔记内容',
      'gist:get:no_notes': 'Gist下载：Gist文件中没有找到有效的笔记',
      'gist:get:success': 'Gist下载成功',
      'gist:get:error': 'Gist下载失败',
      'gist:unhandled': 'Gist操作异常',
      'gist.upload.no_notes': 'Gist上传：没有可导出的笔记',
      'gist.upload.db_error': 'Gist上传：数据库读取失败',
      'gist.upload.no_token': 'Gist上传：GitHub Token未配置',
      'gist.upload.success': 'Gist上传成功',
      'gist.upload.exception': 'Gist上传异常',
      'gist.download.no_token': 'Gist下载：GitHub Token未配置',
      'gist.download.no_id': 'Gist下载：未找到Gist ID',
      'gist.download.success': 'Gist下载成功',
      'gist.download.exception': 'Gist下载异常',
      'import.invalid_notes': '导入失败：数据无效',
      'Order data saved: note-order': '笔记顺序已保存',
      'Order data saved: tag-order': '标签顺序已保存',
      'Order data saved:': '位置信息已保存',
      'import.note_failed': '单条笔记导入失败',
      'import.exception': '导入异常',
      'import.done': '导入完成',
      'import:request': '导入请求',
      'import:start': '开始导入',
      'import:complete': '导入完成',
      'import:note:error': '单条笔记导入失败',
      'import:error': '导入失败',
      'import:unhandled': '导入异常',
      'password.change.missing_fields': '修改密码失败：缺少参数',
      'password.change.invalid_current': '修改密码失败：当前密码错误',
      'password.change.success': '修改密码成功',
      'password.change.exception': '修改密码异常',
      'password:request': '密码状态请求',
      'password:get:success': '密码状态查询成功',
      'password:get:error': '密码状态查询失败',
      'password:unhandled': '密码状态异常',
      'order.saved': '顺序数据已保存',
      'order.get_error': '获取顺序失败',
      'order.post_error': '保存顺序失败',
      'order:unhandled': '顺序操作异常',
      'cleared old notes from postgres': '清理旧笔记',
      '笔记已创建/更新': '笔记已创建/更新',
      '笔记已更新': '笔记已更新',
      '笔记已删除': '笔记已删除',
      '笔记已导入': '笔记已导入',
      '笔记已上传到云端': '笔记已上传到云端',
      '笔记已保存到本地': '笔记已保存到本地',
      '笔记已从云端下载并导入': '笔记已从云端下载并导入',
      'GitHub Token未配置': 'GitHub Token未配置',
      'Gist中没有找到笔记内容': 'Gist中没有找到笔记内容',
      'Gist文件中没有找到有效的笔记': 'Gist文件中没有找到有效的笔记',
      'GitHub Gist 上传失败': 'GitHub Gist 上传失败',
      'GitHub Gist 上传异常': 'GitHub Gist 上传异常',
      'GitHub Gist 下载失败': 'GitHub Gist 下载失败',
      '成功上传到Gist': '成功上传到Gist',
      '成功从Gist导入': '成功从Gist导入',
      '没有可导出的笔记': '没有可导出的笔记',
      '备份失败': '备份失败',
      '下载失败': '下载失败',
      '导入失败': '导入失败',
      '后台导入失败': '后台导入失败',
      '保存顺序失败': '保存顺序失败',
      '获取笔记失败': '获取笔记失败',
      '创建笔记失败': '创建笔记失败',
      '更新笔记失败': '更新笔记失败',
      '删除笔记失败': '删除笔记失败',
      '用户登录成功': '用户登录成功',
      '用户登录失败': '用户登录失败',
      '服务器已启动': '服务器已启动',
      '测试日志条目': '测试日志条目',
      'r2.upload.success': 'R2上传成功',
      'r2.upload.failed': 'R2上传失败',
      'r2.upload.exception': 'R2上传异常',
      'r2.download.success': 'R2下载成功',
      'r2.download.failed': 'R2下载失败',
      'r2.download.exception': 'R2下载异常',
      'r2:post:success': 'R2上传成功',
      'r2:post:error': 'R2上传失败',
      'r2:get:success': 'R2下载成功',
      'r2:get:error': 'R2下载失败',
      '成功上传到R2': '成功上传到R2',
      '成功从R2导入': '成功从R2导入',
      'R2 上传失败': 'R2上传失败',
      'R2 上传异常': 'R2上传异常',
      'R2 下载失败': 'R2下载失败',
      'R2未配置': 'R2未配置',
      '笔记已成功上传到R2': '笔记已成功上传到R2',
      '笔记已成功从R2下载并导入': '笔记已成功从R2下载并导入',
      'R2文件中没有找到有效的笔记': 'R2文件中没有找到有效的笔记',
    }
    return map[msg] || msg
  }
  const formatLogTime = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    if (isNaN(date.getTime())) return String(value)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Shanghai'
    }).replace(/\//g, '-')
  }
  const formatMeta = (msg?: string, meta?: unknown) => {
    if (!meta) return '-'
    
    // Handle string meta first
    if (typeof meta === 'string') {
      // Check if it's a simple string with IP: pattern
      if (msg === '用户登录成功' || msg === '用户登录失败') {
        if (meta.includes('IP:')) {
          return msg === '用户登录失败' ? `登录失败 · ${meta}` : meta
        }
      }
      
      try {
        const parsed = JSON.parse(meta)
        if (typeof parsed === 'object' && parsed !== null) {
          meta = parsed
        } else {
          return meta
        }
      } catch {
        return meta
      }
    }
    
    // At this point, meta is either an object or was already returned as string
    if (typeof meta !== 'object' || meta === null) {
      return typeof meta === 'string' ? meta : JSON.stringify(meta)
    }
    
    try {
      const obj = meta as Record<string, unknown>
      
      if (msg && /:request$/.test(msg)) {
        const method = (typeof obj.method === 'string' ? obj.method : null) || (obj.req && typeof obj.req === 'object' && 'method' in obj.req ? String(obj.req.method) : null)
        let path = ''
        if (typeof obj.url === 'string' && obj.url) {
          try {
            const u = new URL(obj.url)
            path = u.pathname || obj.url
          } catch {
            path = obj.url
          }
        }
        const parts: string[] = []
        if (method) parts.push(`方法：${method}`)
        if (path) parts.push(`路径：${path}`)
        return parts.join(' · ') || JSON.stringify(obj, null, 2)
      }
      
      const directTitle = typeof obj.title === 'string' && obj.title.trim()
      const noteObj = obj.note && typeof obj.note === 'object' ? obj.note as Record<string, unknown> : null
      const nestedTitle = noteObj && typeof noteObj.title === 'string' ? noteObj.title.trim() : ''
      if (directTitle) {
        return obj.title as string
      }
      if (nestedTitle) {
        return nestedTitle
      }

      if (msg === 'notes.list' && typeof obj.count === 'number') {
        return `笔记数量：${obj.count}`
      }
      if (msg === 'notes.delete' || msg === 'notes.delete.not_found') {
        if (typeof obj.title === 'string' && obj.title.trim()) return obj.title
        if (typeof obj.id === 'string') return `ID：${obj.id}`
      }
      if (msg === 'backup.upload.success' && typeof obj.totalNotes === 'number') {
        return `备份文件：${(typeof obj.fileName === 'string' ? obj.fileName : '-')} 笔记数量：${obj.totalNotes}`
      }
      if (msg === 'backup.download.success' && typeof obj.importedCount === 'number') {
        return `备份文件：${(typeof obj.fileName === 'string' ? obj.fileName : 'notes.md')} 笔记数量：${obj.importedCount}`
      }
      if (msg === 'backup:download:success' && typeof obj.importedCount === 'number') {
        return `文件：${(typeof obj.fileName === 'string' ? obj.fileName : 'notes.md')} · 导入：${obj.importedCount} 条 · 更新：${(typeof obj.updatedCount === 'number' ? obj.updatedCount : 0)} 条`
      }
      if (msg === '从云端下载笔记成功' && typeof obj.importedCount === 'number') {
        return `文件：${(typeof obj.fileName === 'string' ? obj.fileName : 'notes.md')} · 导入：${obj.importedCount} 条 · 更新：${(typeof obj.updatedCount === 'number' ? obj.updatedCount : 0)} 条`
      }
      
      if (msg === 'gist:post:success' || msg === 'gist.upload.success') {
        const parts: string[] = []
        if (obj.gistId) {
          parts.push(`Gist ID：${String(obj.gistId)}`)
        }
        if (typeof obj.count === 'number') {
          parts.push(`笔记数量：${obj.count}`)
        }
        if (typeof obj.totalNotes === 'number') {
          parts.push(`笔记数量：${obj.totalNotes}`)
        }
        if (typeof obj.fileName === 'string') {
          parts.push(`文件：${obj.fileName}`)
        }
        return parts.length > 0 ? parts.join(' · ') : JSON.stringify(obj, null, 2)
      }
      
      if (msg === 'gist:get:success' || msg === 'gist.download.success') {
        const parts: string[] = []
        if (obj.gistId) {
          parts.push(`Gist ID：${String(obj.gistId)}`)
        }
        if (typeof obj.importedCount === 'number') {
          parts.push(`导入：${obj.importedCount} 条`)
        }
        if (typeof obj.fileName === 'string') {
          parts.push(`文件：${obj.fileName}`)
        }
        return parts.length > 0 ? parts.join(' · ') : JSON.stringify(obj, null, 2)
      }
      
      if (msg === 'gist:post:error' || msg === 'gist:get:error' || msg === 'gist.upload.exception' || msg === 'gist.download.exception') {
        if (typeof obj.message === 'string') {
          return `错误：${obj.message}`
        }
        return JSON.stringify(obj, null, 2)
      }
      if (msg === '成功上传到Gist' || msg === '成功从Gist导入' || msg === '笔记已成功从GitHub Gist下载并导入') {
        const parts: string[] = []
        if (obj.gistId) {
          parts.push(`Gist ID：${String(obj.gistId)}`)
        }
        if (typeof obj.count === 'number') {
          parts.push(`笔记数量：${obj.count}`)
        }
        if (typeof obj.importedCount === 'number') {
          parts.push(`导入：${obj.importedCount} 条`)
        }
        if (typeof obj.fileName === 'string') {
          parts.push(`文件：${obj.fileName}`)
        }
        return parts.length > 0 ? parts.join(' · ') : JSON.stringify(obj, null, 2)
      }
      
      if (msg === 'r2.upload.success' || msg === 'r2:post:success' || msg === '成功上传到R2' || msg === '笔记已成功上传到R2') {
        const parts: string[] = []
        if (typeof obj.fileName === 'string') {
          parts.push(`文件：${obj.fileName}`)
        }
        if (typeof obj.totalNotes === 'number') {
          parts.push(`笔记数量：${obj.totalNotes}`)
        }
        if (typeof obj.count === 'number') {
          parts.push(`笔记数量：${obj.count}`)
        }
        return parts.length > 0 ? parts.join(' · ') : JSON.stringify(obj, null, 2)
      }
      
      if (msg === 'r2.download.success' || msg === 'r2:get:success' || msg === '成功从R2导入' || msg === '笔记已成功从R2下载并导入') {
        const parts: string[] = []
        if (typeof obj.fileName === 'string') {
          parts.push(`文件：${obj.fileName}`)
        }
        if (typeof obj.importedCount === 'number') {
          parts.push(`导入：${obj.importedCount} 条`)
        }
        if (typeof obj.updatedCount === 'number') {
          parts.push(`更新：${obj.updatedCount} 条`)
        }
        if (typeof obj.totalNotes === 'number') {
          parts.push(`总计：${obj.totalNotes} 条`)
        }
        return parts.length > 0 ? parts.join(' · ') : JSON.stringify(obj, null, 2)
      }
      
      if (msg === 'r2.upload.failed' || msg === 'r2.upload.exception' || msg === 'r2:post:error' || 
          msg === 'r2.download.failed' || msg === 'r2.download.exception' || msg === 'r2:get:error' ||
          msg === 'R2 上传失败' || msg === 'R2 上传异常' || msg === 'R2 下载失败') {
        const errorMsg = typeof obj.error === 'string' ? obj.error : (typeof obj.message === 'string' ? obj.message : null)
        if (errorMsg) {
          return `错误：${errorMsg}`
        }
        return JSON.stringify(obj, null, 2)
      }
      
      if (msg === '笔记已创建/更新' && typeof obj.id === 'string') {
        return `笔记 ID：${obj.id}`
      }
      
      if (msg === '笔记已更新' && typeof obj.id === 'string') {
        return `笔记 ID：${obj.id}`
      }
      
      if (msg === '笔记已删除' && typeof obj.id === 'string') {
        return `笔记 ID：${obj.id}`
      }
      
      if ((msg === '导入失败' || msg === '备份失败' || msg === '下载失败' || msg === '后台导入失败' || 
           msg === '获取笔记失败' || msg === '创建笔记失败' || msg === '更新笔记失败' || 
           msg === '删除笔记失败' || msg === 'GitHub Gist 上传失败' || msg === 'GitHub Gist 上传异常' ||
           msg === 'GitHub Gist 下载失败') && typeof obj.error === 'string') {
        return `错误：${obj.error}`
      }
      
      if (msg === 'backup:post:success' && typeof obj.count === 'number') {
        return `备份创建成功 · 笔记数量：${obj.count}`
      }
      if (msg === '创建备份成功' && typeof obj.count === 'number') {
        return `备份创建成功 · 笔记数量：${obj.count}`
      }
      if (msg === 'backup:clear:success' && typeof obj.clearedCount === 'number') {
        return `已清理 ${obj.clearedCount} 条笔记`
      }
      if (msg === 'import.done' && typeof obj.imported === 'number') {
        const total = typeof obj.total === 'number' ? obj.total : '?'
        return `导入成功：${obj.imported} / ${total}`
      }
      if (msg === 'backup.upload.failed' && typeof obj.status === 'number') {
        return `上传失败：状态码 ${obj.status}`
      }
      if (msg === 'backup.download.failed' && typeof obj.status === 'number') {
        return `下载失败：状态码 ${obj.status}`
      }
      if (msg === 'backup.upload.exception' && typeof obj.message === 'string') {
        return `上传异常：${obj.message}`
      }
      if (msg === 'backup.download.exception' && typeof obj.message === 'string') {
        return `下载异常：${obj.message}`
      }
      if (msg === 'notes.create' && typeof obj.id === 'string') {
        return `创建笔记：${obj.id}`
      }
      if (msg === 'notes.update' && typeof obj.id === 'string') {
        return `更新笔记：${obj.id}`
      }
      if (msg === 'notes.delete' && typeof obj.id === 'string') {
        return `删除笔记：${obj.id}`
      }
      if (msg === 'notes:get:success' && typeof obj.count === 'number') {
        return `笔记数量：${obj.count}`
      }
      if (msg === 'notes:post:success' && typeof obj.id === 'string') {
        return `创建笔记：${obj.id}`
      }
      if (msg === 'note:get:success' && typeof obj.id === 'string') {
        return `获取笔记：${obj.id}`
      }
      if (msg === 'note:put:success' && typeof obj.id === 'string') {
        return `更新笔记：${obj.id}`
      }
      if (msg === 'note:delete:success' && typeof obj.id === 'string') {
        return `删除笔记：${obj.id}`
      }
      if (msg === 'notes.create.exception' && typeof obj.error === 'string') {
        return `创建异常：${obj.error}`
      }
      if (msg === 'notes.update.exception' && typeof obj.error === 'string') {
        return `更新异常：${obj.error}`
      }
      if (msg === 'notes.delete.exception' && typeof obj.error === 'string') {
        return `删除异常：${obj.error}`
      }
      if (msg === 'import.note_failed' && typeof obj.title === 'string') {
        return `导入失败：${obj.title}`
      }
      if (msg === 'import.exception' && typeof obj.message === 'string') {
        return `导入异常：${obj.message}`
      }
      if (msg === 'import:complete') {
        const imported = obj.importedCount ?? obj.imported
        const errors = typeof obj.errorCount === 'number' ? obj.errorCount : 0
        const importedNum = typeof imported === 'number' ? imported : 0
        const total = typeof obj.totalNotes === 'number' ? obj.totalNotes : (typeof obj.total === 'number' ? obj.total : (importedNum + errors))
        const parts: string[] = []
        if (typeof imported === 'number') parts.push(`导入成功：${imported}`)
        if (typeof errors === 'number') parts.push(`失败：${errors}`)
        if (typeof total === 'number') parts.push(`总数：${total}`)
        return parts.length ? parts.join(' / ') : JSON.stringify(obj, null, 2)
      }
      if (msg === 'import:note:error') {
        const title = typeof obj.title === 'string' ? obj.title : null
        const id = typeof obj.id === 'string' ? obj.id : null
        if (title || id) {
          return `导入失败：${title || id}`
        }
      }
      if (msg === 'login.success' && (typeof obj.country === 'string' || typeof obj.city === 'string' || typeof obj.ip === 'string')) {
        const country = typeof obj.country === 'string' ? obj.country : undefined
        const city = typeof obj.city === 'string' ? obj.city : undefined
        const ip = typeof obj.ip === 'string' ? obj.ip : undefined
        const loc = [translateCountry(country), translateCity(city)].filter(Boolean).join(' / ')
        const ipPart = ip ? ` · IP：${ip}` : ''
        return loc ? `位置：${loc}${ipPart}` : (ip ? `IP：${ip}` : '-')
      }
      if (msg === 'login:success' && (typeof obj.country === 'string' || typeof obj.city === 'string' || typeof obj.ip === 'string')) {
        const country = typeof obj.country === 'string' ? obj.country : undefined
        const city = typeof obj.city === 'string' ? obj.city : undefined
        const ip = typeof obj.ip === 'string' ? obj.ip : undefined
        const loc = [translateCountry(country), translateCity(city)].filter(Boolean).join(' / ')
        const ipPart = ip ? ` · IP：${ip}` : ' · IP：未知'
        return loc ? `位置：${loc}${ipPart}` : 'IP：未知'
      }
      if (msg === 'login:failure' && typeof obj.ip === 'string') {
        return `登录失败 · IP：${obj.ip}`
      }
      if (msg === '用户登录成功') {
        if (typeof obj.ip === 'string') {
          return `IP：${obj.ip}`
        }
        return 'IP：未知'
      }
      if (msg === '用户登录失败') {
        if (typeof obj.ip === 'string') {
          return `登录失败 · IP：${obj.ip}`
        }
        return '登录失败 · IP：未知'
      }
      if (msg === 'password:get:success') {
        const dbHasPassword = typeof obj.dbHasPassword === 'boolean' ? obj.dbHasPassword : false
        const effectivePassword = typeof obj.effectivePassword === 'boolean' ? obj.effectivePassword : false
        const source = dbHasPassword ? '数据库' : '环境变量'
        const setStr = effectivePassword ? '是' : '否'
        return `来源：${source} / 已设置：${setStr}`
      }
      if (msg === 'cleared old notes from postgres') {
        if (typeof obj.count === 'number') {
          return `已清理 ${obj.count} 条笔记`
        }
        return '已清理旧笔记'
      }
      if (msg && msg.includes('Order data saved:')) {
        const key = typeof obj.key === 'string' ? obj.key : null
        if (key) {
          if (key === 'note-order') return '笔记顺序'
          if (key === 'tag-order') return '标签顺序'
          return key
        }
        return '位置信息'
      }
      if (msg === 'order.saved' && typeof obj.key === 'string') {
        const type = obj.key === 'note-order' ? '笔记顺序' : (obj.key === 'tag-order' ? '标签顺序' : obj.key)
        return type
      }
      if (msg && msg.includes('Order')) {
        const keyValue = typeof obj.key === 'string' ? obj.key : (typeof obj.id === 'string' ? obj.id : (typeof obj.type === 'string' ? obj.type : null))
        if (keyValue) {
          const type = keyValue === 'note-order' ? '笔记顺序' : (keyValue === 'tag-order' ? '标签顺序' : keyValue)
          return type
        }
      }
      if (typeof obj.key === 'string') {
        const type = obj.key === 'note-order' ? '笔记顺序' : (obj.key === 'tag-order' ? '标签顺序' : obj.key)
        return type
      }
      return JSON.stringify(obj, null, 2)
    } catch {
      return typeof meta === 'string' ? meta : JSON.stringify(meta)
    }
  }

  const handleUploadNotes = () => {
    setIsUploadModalOpen(true)
  }

  const handleViewLogs = async () => {
    setLogsOpen(true)
    setLogsLoading(true)
    setLogsText('')
    setLogsData(null)
    try {
      const resp = await logsApi.getLogs()
      const data = resp.data
      const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      setLogsText(text)
      setLogsData(typeof data === 'object' ? data : null)
    } catch (error: unknown) {
      let errorMessage = '未知错误'
      if (error && typeof error === 'object') {
        if ('response' in error) {
          const errorWithResponse = error as { response?: { data?: { error?: string } } }
          errorMessage = errorWithResponse.response?.data?.error || '未知错误'
        } else if ('message' in error) {
          errorMessage = String(error.message)
        }
      }
      setLogsText(`获取日志失败：${errorMessage}`)
    } finally {
      setLogsLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFile(file)

      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        setUploadPreview(content.substring(0, 200) + (content.length > 200 ? '...' : ''))
      }
      reader.readAsText(file)
    }
  }

  const handleConfirmUpload = async () => {
    if (!uploadFile) return

    setUploading(true)
    try {
      const text = await uploadFile.text()
      const fileExtension = uploadFile.name.split('.').pop()?.toLowerCase()
      
      let notes = []
      
      if (fileExtension === 'json') {

        notes = JSON.parse(text)
      } else if (['md', 'markdown', 'txt'].includes(fileExtension || '')) {

        const note = {
          id: Date.now().toString(),
          title: uploadFile.name.replace(/\.[^/.]+$/, ''),
          content: text,
          tags: ['导入'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        notes = [note]
      }
      
      const response = await notesApi.importNotes({ 
        content: JSON.stringify(notes), 
        format: (fileExtension === 'json' ? 'json' : 'markdown') as ImportFormat 
      })
      if (response.data.success) {

        const successMessage = document.createElement('div')
        successMessage.textContent = `成功导入 ${response.data.imported} 条笔记到数据库！`
        successMessage.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md text-center'
        document.body.appendChild(successMessage)
        setTimeout(() => {
          document.body.removeChild(successMessage)
        }, 3000)
        
        window.dispatchEvent(new CustomEvent('notes-imported', { 
          detail: { count: response.data.imported } 
        }))
        
        setIsUploadModalOpen(false)
        setUploadFile(null)
        setUploadPreview('')
      } else {
        modal.showAlert(`导入失败：${response.data.error}`, { 
          type: 'error',
          title: '导入失败',
          confirmText: '确定'
        })
      }
    } catch (error) {
      modal.showAlert('文件读取失败，请检查文件格式', { 
        type: 'error',
        title: '文件错误',
        confirmText: '确定'
      })
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false)
    setUploadFile(null)
    setUploadPreview('')
  }


  const handleUploadToCloud = async () => {
    setCloudSyncing(true)
    try {
      const response = await cloudApi.uploadToCloud()
      
      if (response.data.success) {
        modal.showAlert(`笔记已成功上传到云端\n文件: ${response.data.fileName || 'notes.md'}\n笔记数量: ${response.data.totalNotes || '未知'}`, {
          type: 'success',
          title: '上传成功',
          confirmText: '确定'
        })
      } else {
        throw new Error(response.data.error || '上传失败')
      }
    } catch (error: unknown) {
      console.error('上传到云端失败:', error)
      const axiosError = error as { response?: { data?: { error?: string } }; message?: string }
      modal.showAlert(`上传到云端失败: ${axiosError.response?.data?.error || axiosError.message || '未知错误'}`, {
        type: 'error',
        title: '上传失败',
        confirmText: '确定'
      })
    } finally {
      setCloudSyncing(false)
    }
  }

  const handleDownloadFromCloud = async () => {
    setCloudSyncing(true)
    try {
      const response = await cloudApi.downloadFromCloud()
      
      if (response.data && response.data.success) {
        modal.showAlert(`笔记已成功从云端下载并导入\n文件: ${response.data.fileName || 'notes.md'}\n导入: ${response.data.importedCount || 0} 条\n更新: ${response.data.updatedCount || 0} 条`, {
          type: 'success',
          title: '下载成功',
          confirmText: '确定'
        })

        window.dispatchEvent(new CustomEvent('notes-imported'))
      } else {
        throw new Error(response.data?.error || '下载失败')
      }
    } catch (error: unknown) {
      console.error('从云端下载失败:', error)
      const axiosError = error as { response?: { data?: { error?: string } }; message?: string }
      modal.showAlert(`从云端下载失败: ${axiosError.response?.data?.error || axiosError.message || '未知错误'}`, {
        type: 'error',
        title: '下载失败',
        confirmText: '确定'
      })
    } finally {
      setCloudSyncing(false)
    }
  }

  const handleUploadToGist = async () => {
    setGistSyncing(true)
    try {
      const response = await gistApi.uploadToGist()
      
      if (response.data.success) {
        modal.showAlert(`成功上传到Gist\n文件: ${response.data.fileName || 'notes.md'}\n笔记数量: ${response.data.totalNotes || '未知'}`, {
          type: 'success',
          title: '上传成功',
          confirmText: '确定'
        })
      } else {
        throw new Error(response.data.error || '上传失败')
      }
    } catch (error: unknown) {
      console.error('上传到GitHub Gist失败:', error)
      const axiosError = error as { response?: { data?: { error?: string } }; message?: string }
      modal.showAlert(`上传到GitHub Gist失败: ${axiosError.response?.data?.error || axiosError.message || '未知错误'}`, {
        type: 'error',
        title: '上传失败',
        confirmText: '确定'
      })
    } finally {
      setGistSyncing(false)
    }
  }

  const handleDownloadFromGist = async () => {
    setGistSyncing(true)
    try {
      const response = await gistApi.downloadFromGist()
      
      if (response.data && response.data.success) {
        modal.showAlert(`成功从Gist导入\n文件: ${response.data.fileName || 'notes.md'}\n导入: ${response.data.importedCount || 0} 条\n更新: ${response.data.updatedCount || 0} 条`, {
          type: 'success',
          title: '下载成功',
          confirmText: '确定'
        })

        window.dispatchEvent(new CustomEvent('notes-imported'))
      } else {
        throw new Error(response.data?.error || '下载失败')
      }
    } catch (error: unknown) {
      console.error('从GitHub Gist下载失败:', error)
      const axiosError = error as { response?: { data?: { error?: string } }; message?: string }
      modal.showAlert(`从GitHub Gist下载失败: ${axiosError.response?.data?.error || axiosError.message || '未知错误'}`, {
        type: 'error',
        title: '下载失败',
        confirmText: '确定'
      })
    } finally {
      setGistSyncing(false)
    }
  }

  const handleUploadToR2 = async () => {
    setR2Syncing(true)
    try {
      const response = await r2Api.uploadToR2()
      
      if (response.data.success) {
        modal.showAlert(`成功上传到R2\n文件: ${response.data.fileName || 'notes.md'}\n笔记数量: ${response.data.totalNotes || '未知'}`, {
          type: 'success',
          title: '上传成功',
          confirmText: '确定'
        })
      } else {
        throw new Error(response.data.error || '上传失败')
      }
    } catch (error: unknown) {
      console.error('上传到Cloudflare R2失败:', error)
      const axiosError = error as { response?: { data?: { error?: string } }; message?: string }
      modal.showAlert(`上传到Cloudflare R2失败: ${axiosError.response?.data?.error || axiosError.message || '未知错误'}`, {
        type: 'error',
        title: '上传失败',
        confirmText: '确定'
      })
    } finally {
      setR2Syncing(false)
    }
  }

  const handleDownloadFromR2 = async () => {
    setR2Syncing(true)
    try {
      const response = await r2Api.downloadFromR2()
      
      if (response.data && response.data.success) {
        modal.showAlert(`成功从R2导入\n文件: ${response.data.fileName || 'notes.md'}\n导入: ${response.data.importedCount || 0} 条\n更新: ${response.data.updatedCount || 0} 条`, {
          type: 'success',
          title: '下载成功',
          confirmText: '确定'
        })

        window.dispatchEvent(new CustomEvent('notes-imported'))
      } else {
        throw new Error(response.data?.error || '下载失败')
      }
    } catch (error: unknown) {
      console.error('从Cloudflare R2下载失败:', error)
      const axiosError = error as { response?: { data?: { error?: string } }; message?: string }
      modal.showAlert(`从Cloudflare R2下载失败: ${axiosError.response?.data?.error || axiosError.message || '未知错误'}`, {
        type: 'error',
        title: '下载失败',
        confirmText: '确定'
      })
    } finally {
      setR2Syncing(false)
    }
  }

  const handleDownloadNotes = async () => {
    try {

      const response = await notesApi.getNotes()
      const notes = response.data
      
      if (!notes || notes.length === 0) {
        modal.showAlert('没有可下载的笔记', { 
          type: 'warning',
          title: '无笔记',
          confirmText: '确定'
        })
        return
      }
      
      const noteSelection = await modal.showSelect(
        '请选择要下载的笔记：',
        {
          title: '选择笔记',
          options: [
            {
              value: 'all',
              label: '全部笔记',
              description: `下载所有 ${notes.length} 条笔记`
            },
            ...notes.map((note: Note, index: number) => ({
              value: note.id,
              label: note.title || `无标题笔记 ${index + 1}`,
              description: note.content ? note.content.substring(0, 50) + '...' : '无内容'
            }))
          ],
          defaultValue: 'all'
        }
      )
      
      if (!noteSelection) return
      
      let selectedNotes = notes
      if (noteSelection !== 'all') {
        selectedNotes = notes.filter((note: Note) => note.id === noteSelection)
      }
      
      const format = await modal.showSelect(
        '请选择导出格式：',
        {
          title: '选择导出格式',
          options: [
            {
              value: '1',
              label: 'JSON 格式',
              description: '完整数据，包含所有字段和元数据'
            },
            {
              value: '2',
              label: 'Markdown 格式',
              description: '纯文本格式，适合阅读和编辑'
            },
            {
              value: '3',
              label: 'TXT 格式',
              description: '纯文本格式，简单易用'
            }
          ],
          defaultValue: '1'
        }
      )
      
      if (!format) return
      
      let dataStr = ''
      let fileName = ''
      let mimeType = ''
      
      if (format === '1') {

        dataStr = JSON.stringify(selectedNotes, null, 2)
        const noteType = noteSelection === 'all' ? 'all' : 'single'
        fileName = `notes_${noteType}_${new Date().toISOString().slice(0, 10)}.json`
        mimeType = 'application/json'
      } else if (format === '2') {

        dataStr = selectedNotes.map((note: Note) => 
          `# ${note.title || '无标题'}\n\n${note.content}\n\n---\n\n`
        ).join('')
        const noteType = noteSelection === 'all' ? 'all' : 'single'
        fileName = `notes_${noteType}_${new Date().toISOString().slice(0, 10)}.md`
        mimeType = 'text/markdown'
      } else if (format === '3') {

        dataStr = selectedNotes.map((note: Note) => 
          `${note.title || '无标题'}\n\n${note.content}\n\n${'='.repeat(50)}\n\n`
        ).join('')
        const noteType = noteSelection === 'all' ? 'all' : 'single'
        fileName = `notes_${noteType}_${new Date().toISOString().slice(0, 10)}.txt`
        mimeType = 'text/plain'
      } else {
        modal.showAlert('格式选择无效，请重新选择', { 
          type: 'error',
          title: '选择错误',
          confirmText: '确定'
        })
        return
      }
      
      const dataBlob = new Blob([dataStr], { type: mimeType })
      const url = URL.createObjectURL(dataBlob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      const formatName = format === '1' ? 'JSON' : format === '2' ? 'Markdown' : 'TXT'
      const noteCount = selectedNotes.length
      const noteType = noteSelection === 'all' ? '全部' : '单个'
      
      modal.showAlert(`成功下载 ${noteCount} 条笔记（${noteType}），格式：${formatName}`, { 
        type: 'success',
        title: '下载成功',
        confirmText: '确定'
      })
    } catch (error) {
      modal.showAlert('下载失败，请检查网络连接', { 
        type: 'error',
        title: '下载失败',
        confirmText: '确定'
      })
      console.error('Download error:', error)
    }
  }

  const handleChangePassword = async () => {
    if (!newPassword) {
      modal.showAlert('请输入新密码', { 
        type: 'warning',
        title: '输入错误',
        confirmText: '确定'
      })
      return
    }
    if (newPassword.length < 6) {
      modal.showAlert('新密码长度不能小于6位', { 
        type: 'warning',
        title: '密码太短',
        confirmText: '确定'
      })
      return
    }
    try {
      setChanging(true)
      
      const currentPassword = localStorage.getItem('password') || ''
      if (!currentPassword) {
        modal.showAlert('未找到当前密码，请重新登录', { 
          type: 'error',
          title: '登录错误',
          confirmText: '确定'
        })
        return
      }
      
      
      await authApi.changePassword({ currentPassword, newPassword })
      
      localStorage.setItem('password', newPassword)
      
      setNewPassword('')
      setPasswordSource('d1')
      
      modal.showAlert('密码修改成功！系统将在3秒后退出重新登录。', { 
        type: 'success',
        title: '修改成功',
        confirmText: '确定'
      })
      
      setTimeout(() => {
        localStorage.removeItem('password')
        window.location.href = '/login'
      }, 3000)
    } catch (err: unknown) {
      console.error('Change password error:', err)
      const axiosError = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
      
      if (axiosError.response?.status === 401) {
        modal.showAlert('当前密码错误，请检查后重试', { 
          type: 'error',
          title: '密码错误',
          confirmText: '确定'
        })
      } else if (axiosError.response?.status === 400) {
        modal.showAlert('请求参数错误，请检查输入', { 
          type: 'error',
          title: '参数错误',
          confirmText: '确定'
        })
      } else {
        modal.showAlert('密码修改失败，请检查网络连接', { 
          type: 'error',
          title: '修改失败',
          confirmText: '确定'
        })
      }
    } finally {
      setChanging(false)
    }
  }

  const handleImageFileSelect = (type: 'background' | 'logo', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        modal.showAlert('请选择图片文件', { 
          type: 'error',
          title: '文件类型错误',
          confirmText: '确定'
        })
        return
      }
      
      if (file.size > 5 * 1024 * 1024) {
        modal.showAlert('图片文件大小不能超过5MB', { 
          type: 'error',
          title: '文件过大',
          confirmText: '确定'
        })
        return
      }
      
      setUploadingImage(true)
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        const imageUrl = base64
        
        const savedSettings = localStorage.getItem('app-settings')
        
        let currentSettings = {}
        if (savedSettings) {
          try {
            currentSettings = JSON.parse(savedSettings)
          } catch (error) {
            console.error('解析localStorage设置失败:', error)
            currentSettings = {}
          }
        }
        
        const defaultSettings = {
          fontSize: '中',
          backgroundImageUrl: '',
          logoUrl: '',
          fontFamily: '默认',
          theme: 'light',
          autoSave: true,
          spellCheck: false,
          syntaxHighlight: true,
          lineNumbers: false,
          username: '',
          emailNotification: false,
          shortcutHints: true,
          autoLock: true,
          lockTimeout: '15分钟',
          passwordStrength: '中'
        }
        
        const updatedSettings = { ...defaultSettings, ...currentSettings }
        
        if (type === 'background') {
          updatedSettings.backgroundImageUrl = imageUrl
          loadAndApplyBackground(
            imageUrl,
            () => {
              window.dispatchEvent(new CustomEvent('settings-changed', { detail: updatedSettings }))
            },
            () => {
              window.dispatchEvent(new CustomEvent('settings-changed', { detail: updatedSettings }))
            }
          )
        } else if (type === 'logo') {
          updatedSettings.logoUrl = imageUrl
          let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
          if (!link) {
            link = document.createElement('link')
          link.rel = 'icon'
          link.type = 'image/x-icon'
          document.head.appendChild(link)
        }
        
        const timestamp = new Date().getTime()
        const faviconWithTimestamp = `${imageUrl}?t=${timestamp}`
        link.href = faviconWithTimestamp
        link.type = 'image/x-icon'
        
        window.dispatchEvent(new CustomEvent('settings-changed', { detail: updatedSettings }))
        }
        
        localStorage.setItem('app-settings', JSON.stringify(updatedSettings))
        
        setSettings(updatedSettings)
        
        modal.showAlert('图片上传成功并已应用！', { 
          type: 'success',
          title: '上传成功',
          confirmText: '确定'
        })
        setUploadingImage(false)
      }
      reader.readAsDataURL(file)
    }
  }


  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-white/50 backdrop-blur-xl rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-white/50">
        <div className="bg-white/50 backdrop-blur-lg px-6 py-4 border-b border-white/50 flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">设置</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto bg-white/50 backdrop-blur-sm">
          {settingsCategories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="mb-6 last:mb-0">
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-white/50">
                <div className="text-blue-600">
                  {category.icon}
                </div>
                <h3 className="font-medium text-gray-900">{category.title}</h3>
              </div>

              <div className="space-y-4">
                {category.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center justify-between">
                    <label htmlFor={option.type === 'input' ? `settings-input-${option.value}` : option.type === 'select' ? `settings-select-${option.value}` : undefined} className="font-medium text-gray-700">
                      {option.label}
                    </label>
                    
                                         {option.type === 'toggle' && (
                       <button
                         onClick={() => toggleSetting(option.value)}
                         className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                           settings[option.value as keyof typeof settings] ? 'bg-blue-600' : 'bg-gray-200'
                         }`}
                       >
                         <span
                           className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                             settings[option.value as keyof typeof settings] ? 'translate-x-6' : 'translate-x-1'
                           }`}
                         />
                       </button>
                     )}

                                         {option.type === 'select' && 'options' in option && (
                       <select 
                         id={`settings-select-${option.value}`}
                         value={settings[option.value as keyof typeof settings] as string}
                         onChange={(e) => handleSettingChange(option.value as keyof AppSettings, e.target.value)}
                         className="border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                       >
                         {(option.options || []).map((opt: string, optIndex: number) => (
                           <option key={optIndex} value={opt}>
                             {opt}
                           </option>
                         ))}
                       </select>
                     )}

                                         {option.type === 'input' && (
                       <div className="flex items-center gap-2">
                         <input
                           id={`settings-input-${option.value}`}
                           type="text"
                           value={settings[option.value as keyof typeof settings] as string}
                           onChange={(e) => handleSettingChange(option.value as keyof AppSettings, e.target.value)}
                           placeholder={
                             option.value === 'username' ? '输入用户名' :
                             option.value === 'backgroundImageUrl' ? '输入背景图URL' :
                             option.value === 'logoUrl' ? '输入logo图URL' : ''
                           }
                           className="border border-gray-300 rounded-md px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                         />
                         {(option.value === 'backgroundImageUrl' || option.value === 'logoUrl') && (
                           <div className="relative">
                             <input
                               type="file"
                               accept="image/*"
                               onChange={(e) => handleImageFileSelect(option.value as 'background' | 'logo', e)}
                               className="hidden"
                               id={`image-upload-${option.value}`}
                               disabled={uploadingImage}
                             />
                             <label
                               htmlFor={`image-upload-${option.value}`}
                               className={`px-2 py-1 text-xs font-medium text-white border border-transparent rounded-md flex items-center gap-1 cursor-pointer ${
                                 uploadingImage 
                                   ? 'bg-gray-400 cursor-not-allowed' 
                                   : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
                               }`}
                               title={`上传${option.value === 'backgroundImageUrl' ? '背景图' : 'logo图'}`}
                             >
                               <Upload className="h-3 w-3" />
                               {uploadingImage ? '上传中...' : '上传'}
                             </label>
                           </div>
                         )}
                       </div>
                     )}

                     {option.type === 'custom' && option.value === 'backupNotes' && (
                       <div className="flex gap-2">
                         <button
                           onClick={handleUploadNotes}
                           className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                         >
                           上传笔记
                         </button>
                         <button
                           onClick={handleDownloadNotes}
                           className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                         >
                           下载笔记
                         </button>
                       </div>
                     )}

                    {option.type === 'custom' && option.value === 'cloudNotes' && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleUploadToCloud}
                          disabled={cloudSyncing}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cloudSyncing ? '上传中...' : '上传到云端'}
                        </button>
                        <button
                          onClick={handleDownloadFromCloud}
                          disabled={cloudSyncing}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cloudSyncing ? '下载中...' : '从云端下载'}
                        </button>
                      </div>
                    )}

                    {option.type === 'custom' && option.value === 'gistNotes' && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleUploadToGist}
                          disabled={gistSyncing}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {gistSyncing ? '上传中...' : '上传到Gist'}
                        </button>
                        <button
                          onClick={handleDownloadFromGist}
                          disabled={gistSyncing}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {gistSyncing ? '下载中...' : '从Gist下载'}
                        </button>
                      </div>
                    )}

                    {option.type === 'custom' && option.value === 'r2Notes' && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleUploadToR2}
                          disabled={r2Syncing}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {r2Syncing ? '上传中...' : '上传到R2'}
                        </button>
                        <button
                          onClick={handleDownloadFromR2}
                          disabled={r2Syncing}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {r2Syncing ? '下载中...' : '从R2下载'}
                        </button>
                      </div>
                    )}

                    {option.type === 'custom' && option.value === 'viewLogs' && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleViewLogs}
                          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          查看日志
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {category.title === '用户设置' && (
                  <div className="space-y-3 pt-2 border-t border-white/50">
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-800">当前密码：</span>
                      </div>
                      <div className="text-xs text-green-700 ml-6">
                        {passwordSource === 'env' && (
                          <span>环境变量</span>
                        )}
                        {passwordSource === 'd1' && (
                          <span>D1数据库</span>
                        )}
                        {passwordSource === 'postgresql' && (
                          <span>PostgreSQL数据库</span>
                        )}
                        {passwordSource === 'unknown' && (
                          <span>环境变量</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <label htmlFor="new-password" className="font-medium text-gray-700">修改密码</label>
                      <div className="relative">
                        <input
                          id="new-password"
                          type={showPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !changing && newPassword) {
                              handleChangePassword()
                            }
                          }}
                          className="border border-gray-300 rounded-md px-3 py-1 pr-10 w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="输入新密码"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex justify-end">
                      <button
                        onClick={handleChangePassword}
                        disabled={changing || !newPassword}
                        className="px-3 py-1.5 font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {changing ? '修改中...' : '确定'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white/50 backdrop-blur-lg px-6 py-4 border-t border-white/50 flex justify-center gap-4">
          <button
            onClick={handleLogout}
            className="px-8 py-3 font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 min-w-[100px]"
          >
            退出
          </button>
          <button
            onClick={handleSave}
            className="px-8 py-3 font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
          >
            保存
          </button>
        </div>
      </div>

      {isUploadModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]">
          <div className="bg-white/50 backdrop-blur-xl rounded-lg shadow-xl w-full max-w-md mx-4 border border-white/50">
            <div className="bg-white/50 backdrop-blur-lg px-6 py-4 border-b border-white/50 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">上传笔记</h3>
              <button
                onClick={handleCloseUploadModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept=".json,.md,.txt,.markdown"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Database className="h-8 w-8 text-gray-400 mb-2" />
                    <span className="text-gray-600">
                      {uploadFile ? '重新选择文件' : '点击选择文件'}
                    </span>
                    <span className="text-xs text-gray-500 mt-1">
                      支持 JSON、MD、TXT 格式
                    </span>
                  </label>
                </div>

                {uploadFile && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-blue-800">已选择文件</span>
                    </div>
                    <div className="text-blue-700">
                      <div>文件名：{uploadFile.name}</div>
                      <div>大小：{(uploadFile.size / 1024).toFixed(1)} KB</div>
                      <div>类型：{uploadFile.name.split('.').pop()?.toUpperCase()}</div>
                    </div>
                  </div>
                )}

                {uploadPreview && (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                    <div className="font-medium text-gray-800 mb-2">文件预览：</div>
                    <div className="text-xs text-gray-600 bg-white p-2 rounded border max-h-32 overflow-y-auto">
                      <pre className="whitespace-pre-wrap">{uploadPreview}</pre>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={handleCloseUploadModal}
                    disabled={uploading}
                    className="px-4 py-2 font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmUpload}
                    disabled={!uploadFile || uploading}
                    className="px-4 py-2 font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {uploading ? '导入中...' : '确认导入'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {logsOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]">
          <div className="bg-white/50 backdrop-blur-xl rounded-lg shadow-xl w-full max-w-3xl mx-4 border border-white/50">
            <div className="bg-white/50 backdrop-blur-lg px-6 py-4 border-b border-white/50 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">后端调用日志</h3>
              <button
                onClick={() => setLogsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLogsView(v => v === 'table' ? 'json' : 'table')}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {logsView === 'table' ? '切换JSON视图' : '切换表格视图'}
                </button>
                <button
                  onClick={handleViewLogs}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  刷新
                </button>
                <button
                  onClick={async () => {
                    const ok = await modal.showConfirm('确定要清空所有日志吗？该操作不可恢复。', {
                      title: '清空日志确认',
                      type: 'warning',
                      confirmText: '清空',
                      cancelText: '取消'
                    } as { type: 'warning'; confirmText: string; cancelText: string })
                    if (!ok) return
                    try {
                      setLogsLoading(true)
                      await logsApi.clearLogs()
                      await handleViewLogs()
                    } finally {
                      setLogsLoading(false)
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  清空日志
                </button>
              </div>
            </div>
            <div className="px-6 pb-4 max-h-[65vh] overflow-y-auto">
              {logsLoading ? (
                <div className="text-gray-600">加载中...</div>
              ) : logsView === 'json' ? (
                <pre className="text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-md p-3 whitespace-pre-wrap break-words">
                  {logsText || '暂无日志'}
                </pre>
              ) : (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-gray-600">时间</th>
                        <th className="px-3 py-2 text-gray-600">级别</th>
                        <th className="px-3 py-2 text-gray-600">事件</th>
                        <th className="px-3 py-2 text-gray-600">详情</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(logsData?.items || []).length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-gray-500" colSpan={4}>暂无日志</td>
                        </tr>
                      ) : (
                        (logsData?.items || []).map((it: { id?: number; level?: string; message?: string; meta?: string; created_at?: string; [key: string]: unknown }, idx: number) => {
                          let meta: unknown = null
                          try { meta = it.meta ? JSON.parse(it.meta) : null } catch {
                            meta = it.meta || null
                          }
                          const levelColor = it.level === 'error' ? 'text-red-600' : (it.level === 'warn' || it.level === 'warning') ? 'text-yellow-700' : 'text-gray-800'
                          return (
                            <tr key={it.id || idx} className={idx % 2 ? 'bg-white' : 'bg-gray-50/50'}>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatLogTime(it.created_at)}</td>
                              <td className={`px-3 py-2 whitespace-nowrap font-medium ${levelColor}`}>{translateLevel(it.level)}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap text-gray-800">{translateMessage(it.message)}</td>
                              <td className="px-3 py-2 text-gray-700">
                                {meta ? (
                                  <pre className="text-xs bg-gray-50 rounded p-2 border border-gray-200 whitespace-pre-wrap break-words">
                                    {typeof meta === 'string' ? meta : String(formatMeta(it.message, meta))}
                                  </pre>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-white/50 flex justify-end gap-3 bg-white/50">
              <button
                onClick={() => setLogsOpen(false)}
                className="px-4 py-2 font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

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

      <PromptModal
        isOpen={modal.promptState.isOpen}
        onClose={modal.closePrompt}
        title={modal.promptState.title}
        message={modal.promptState.message}
        placeholder={modal.promptState.placeholder}
        defaultValue={modal.promptState.defaultValue}
        confirmText={modal.promptState.confirmText}
        cancelText={modal.promptState.cancelText}
        onConfirm={modal.promptState.onConfirm || (() => {})}
        onCancel={modal.promptState.onCancel}
      />

      <SelectModal
        isOpen={modal.selectState.isOpen}
        onClose={modal.closeSelect}
        title={modal.selectState.title}
        message={modal.selectState.message}
        options={modal.selectState.options}
        defaultValue={modal.selectState.defaultValue}
        confirmText={modal.selectState.confirmText}
        cancelText={modal.selectState.cancelText}
        onConfirm={modal.selectState.onConfirm || (() => {})}
        onCancel={modal.selectState.onCancel}
      />

    </div>
  )
}

export default SettingsModal
