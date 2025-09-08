import React, { useState, useEffect } from 'react'
import { X, Palette, User, Shield, Database, Cloud, Eye, EyeOff } from 'lucide-react'
import { authApi, notesApi, cloudApi, logsApi } from '@/lib/api'
import { AlertModal, ConfirmModal, PromptModal, SelectModal } from './Modal'
import { useModal } from '../hooks/useModal'
import { loadAndApplyBackground } from '@/lib/background'
import type { 
  AppSettings, 
  FontSize, 
  FontFamily, 
  LockTimeout, 
  PasswordStrength,
  Note,
  ImportFormat,
  SettingsChangedEvent
} from '@/types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  // 默认设置
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
    username: '用户',
    emailNotification: false,
    shortcutHints: true,
    autoLock: true,
    lockTimeout: '15分钟',
    passwordStrength: '中'
  }

  // 设置状态管理
  const [settings, setSettings] = useState(defaultSettings)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changing, setChanging] = useState(false)
  const [passwordSource, setPasswordSource] = useState<'d1' | 'env' | 'unknown'>('unknown')
  const [showPassword, setShowPassword] = useState(false)

  // 弹窗管理
  const modal = useModal()


  // 从 localStorage 加载设置
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
    
    // 检查密码来源状态
    checkPasswordSource()
  }, [])

  // 每次打开弹窗时清空密码输入框
  useEffect(() => {
    if (isOpen) {
      setNewPassword('')
      setCurrentPassword('')
      setConfirmPassword('')
    }
  }, [isOpen])

  // 检查当前密码来源
  const checkPasswordSource = async () => {
    try {
      // 调用API获取密码状态
      const response = await authApi.getPasswordStatus()
      if (response.data?.usingD1) {
        setPasswordSource('d1')
      } else {
        setPasswordSource('env')
      }
    } catch (error) {
      console.error('检查密码来源失败:', error)
      setPasswordSource('unknown')
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
        { label: '用户名', value: 'username', type: 'input', default: '用户' },
        { label: 'logo图URL', value: 'logoUrl', type: 'input', default: '' }
      ]
    },
          {
        title: '笔记备份',
        icon: <Database className="h-5 w-5" />,
        options: [
          { label: '上传下载笔记', value: 'backupNotes', type: 'custom', default: null },
          { label: '云端笔记', value: 'cloudNotes', type: 'custom', default: null }
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

  // 处理设置变更
  const handleSettingChange = (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // 切换开关状态
  const toggleSetting = (key: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev]
    }))
  }

  const handleSave = () => {
    // 保存设置逻辑
    console.log('设置已保存:', settings)
    // 这里可以将设置保存到 localStorage 或发送到服务器
    localStorage.setItem('app-settings', JSON.stringify(settings))
    // 同步到全局 CSS 变量，便于各处样式生效
    try {
      const fontSizeMap: Record<string, string> = { '小': '14px', '中': '16px', '大': '18px', '特大': '20px', '超大': '22px' }
      const resolvedFontSize = fontSizeMap[settings.fontSize as keyof typeof fontSizeMap] || '14px'
      const resolvedLineHeight = '1.6'
      
      // 设置全局字体大小
      document.documentElement.style.setProperty('--global-font-size', resolvedFontSize)
      document.documentElement.style.setProperty('--global-line-height', resolvedLineHeight)
      
      // 保持编辑器字体大小设置（向后兼容）
      document.documentElement.style.setProperty('--editor-font-size', resolvedFontSize)
      document.documentElement.style.setProperty('--editor-line-height', resolvedLineHeight)
      
      console.log('全局字体大小已应用:', resolvedFontSize)
      // 使用统一的背景图管理工具
      loadAndApplyBackground(
        settings.backgroundImageUrl,
        () => console.log('背景图已设置:', settings.backgroundImageUrl),
        () => console.log('背景图加载失败，使用默认背景')
      )
      // 设置 favicon（浏览器标签logo）
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
      // 同步页面标题（浏览器标签）
      if (settings.username && typeof settings.username === 'string') {
        document.title = settings.username
      }
      // 通知应用内其他组件设置已变更
      window.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }))
      
      // 显示成功提示
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


  // 退出到登录页
  const handleLogout = () => {
    try {
      // 清理本地登录相关数据
      localStorage.removeItem('password')
      sessionStorage.clear()
    } catch {}
    // 跳转到登录页
    window.location.href = '/login'
  }


  // 上传笔记状态
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  // 云端同步状态
  const [cloudSyncing, setCloudSyncing] = useState(false)
  // 日志查看状态
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsText, setLogsText] = useState('')
  const [logsData, setLogsData] = useState<any>(null)
  const [logsView, setLogsView] = useState<'table' | 'json'>('table')

  // 日志中文映射
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
    const map: Record<string, string> = {
      'login.success': '登录成功',
      'login.invalid_password': '登录失败：密码不正确',
      'login.missing_password': '登录失败：缺少密码',
      'login.exception': '登录异常',
      'notes.list': '获取笔记列表',
      'notes.delete': '删除笔记',
      'notes.delete.not_found': '删除笔记失败：未找到',
      'notes.delete.exception': '删除笔记异常',
      'notes.create': '创建笔记',
      'notes.create.exception': '创建笔记异常',
      'notes.update': '更新笔记',
      'notes.update.exception': '更新笔记异常',
      'backup.upload.no_notes': '备份上传：没有可导出的笔记',
      'backup.upload.success': '备份上传成功',
      'backup.upload.failed': '备份上传失败',
      'backup.upload.exception': '备份上传异常',
      'backup.download.success': '备份下载并导入成功',
      'backup.download.failed': '备份下载失败',
      'backup.download.exception': '备份下载异常',
      'import.invalid_notes': '导入失败：数据无效',
      'import.note_failed': '单条笔记导入失败',
      'import.exception': '导入异常',
      'import.done': '导入完成',
      'password.change.missing_fields': '修改密码失败：缺少参数',
      'password.change.invalid_current': '修改密码失败：当前密码错误',
      'password.change.success': '修改密码成功',
      'password.change.exception': '修改密码异常',
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
  const formatMeta = (msg?: string, meta?: any) => {
    if (!meta) return '-'
    try {
      const obj = typeof meta === 'string' ? JSON.parse(meta) : meta
      // 优先：若包含标题字段，仅显示标题文本
      if (obj && typeof obj === 'object') {
        const directTitle = typeof obj.title === 'string' && obj.title.trim()
        const nestedTitle = typeof obj.note?.title === 'string' && obj.note.title.trim()
        if (directTitle) {
          return obj.title
        }
        if (nestedTitle) {
          return obj.note.title
        }
      }
      // 特例：notes.list 显示“笔记数量：x”
      if (msg === 'notes.list' && typeof obj.count === 'number') {
        return `笔记数量：${obj.count}`
      }
      // 特例：notes.delete 系列优先显示标题；若无标题再用ID
      if (msg === 'notes.delete' || msg === 'notes.delete.not_found') {
        if (typeof obj.title === 'string' && obj.title.trim()) return obj.title
        if (typeof obj.id === 'string') return `ID：${obj.id}`
      }
      if (msg === 'backup.upload.success' && typeof obj.totalNotes === 'number') {
        return `备份文件：${obj.fileName || '-'}，笔记数量：${obj.totalNotes}`
      }
      if (msg === 'import.done' && typeof obj.imported === 'number') {
        return `导入成功：${obj.imported} / ${obj.total}`
      }
      // 登录成功：显示地理位置（国家/城市，中文）与 IP
      if (msg === 'login.success' && (obj.country || obj.city || obj.ip)) {
        const loc = [translateCountry(obj.country), translateCity(obj.city)].filter(Boolean).join(' / ')
        const ipPart = obj.ip ? ` · IP：${obj.ip}` : ''
        return loc ? `位置：${loc}${ipPart}` : (obj.ip ? `IP：${obj.ip}` : '-')
      }
      return JSON.stringify(obj, null, 2)
    } catch {
      return typeof meta === 'string' ? meta : JSON.stringify(meta)
    }
  }

  // 打开上传弹窗
  const handleUploadNotes = () => {
    setIsUploadModalOpen(true)
  }

  // 获取日志
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
    } catch (error: any) {
      setLogsText(`获取日志失败：${error?.response?.data?.error || error?.message || '未知错误'}`)
    } finally {
      setLogsLoading(false)
    }
  }

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFile(file)
      // 显示文件预览
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        setUploadPreview(content.substring(0, 200) + (content.length > 200 ? '...' : ''))
      }
      reader.readAsText(file)
    }
  }

  // 执行上传
  const handleConfirmUpload = async () => {
    if (!uploadFile) return

    setUploading(true)
    try {
      const text = await uploadFile.text()
      const fileExtension = uploadFile.name.split('.').pop()?.toLowerCase()
      
      let notes = []
      
      if (fileExtension === 'json') {
        // JSON 格式
        notes = JSON.parse(text)
      } else if (['md', 'markdown', 'txt'].includes(fileExtension || '')) {
        // Markdown 或文本格式
        const note = {
          id: Date.now().toString(),
          title: uploadFile.name.replace(/\.[^/.]+$/, ''), // 去掉文件扩展名作为标题
          content: text,
          tags: ['导入'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        notes = [note]
      }
      
      // 调用API导入笔记到数据库
      const response = await notesApi.importNotes(notes, fileExtension)
      if (response.data.success) {
        // 成功提示
        const successMessage = document.createElement('div')
        successMessage.textContent = `成功导入 ${response.data.imported} 条笔记到数据库！`
        successMessage.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md text-center'
        document.body.appendChild(successMessage)
        setTimeout(() => {
          document.body.removeChild(successMessage)
        }, 3000)
        
        // 触发笔记列表更新事件
        window.dispatchEvent(new CustomEvent('notes-imported', { 
          detail: { count: response.data.imported } 
        }))
        
        // 关闭弹窗并重置状态
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

  // 关闭上传弹窗
  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false)
    setUploadFile(null)
    setUploadPreview('')
  }


  // 上传笔记到云端
  const handleUploadToCloud = async () => {
    setCloudSyncing(true)
    try {
      const response = await cloudApi.uploadToCloud()
      
      if (response.data.success) {
        console.log('上传响应数据:', response.data) // 调试信息
        modal.showAlert(`笔记已成功上传到云端\n文件: ${response.data.fileName || 'notes-latest.md'}\n笔记数量: ${response.data.totalNotes || '未知'}`, {
          type: 'success',
          title: '上传成功',
          confirmText: '确定'
        })
      } else {
        throw new Error(response.data.error || '上传失败')
      }
    } catch (error) {
      console.error('上传到云端失败:', error)
      modal.showAlert(`上传到云端失败: ${error.response?.data?.error || error.message}`, {
        type: 'error',
        title: '上传失败',
        confirmText: '确定'
      })
    } finally {
      setCloudSyncing(false)
    }
  }

  // 从云端下载笔记
  const handleDownloadFromCloud = async () => {
    setCloudSyncing(true)
    try {
      const response = await cloudApi.downloadFromCloud()
      
      if (response.data && response.data.success) {
        modal.showAlert(`笔记已成功从云端下载并导入\n文件: ${response.data.fileName || 'notes-latest.md'}\n导入: ${response.data.importedCount || 0} 条\n更新: ${response.data.updatedCount || 0} 条`, {
          type: 'success',
          title: '下载成功',
          confirmText: '确定'
        })
        // 触发笔记列表刷新
        window.dispatchEvent(new CustomEvent('notes-imported'))
      } else {
        throw new Error(response.data?.error || '下载失败')
      }
    } catch (error) {
      console.error('从云端下载失败:', error)
      modal.showAlert(`从云端下载失败: ${error.response?.data?.error || error.message}`, {
        type: 'error',
        title: '下载失败',
        confirmText: '确定'
      })
    } finally {
      setCloudSyncing(false)
    }
  }

  // 下载笔记到本地
  const handleDownloadNotes = async () => {
    try {
      // 获取所有笔记
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
      
      // 创建笔记选择对话框
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
      
      // 根据选择筛选笔记
      let selectedNotes = notes
      if (noteSelection !== 'all') {
        selectedNotes = notes.filter((note: Note) => note.id === noteSelection)
      }
      
      // 创建格式选择对话框
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
        // JSON 格式
        dataStr = JSON.stringify(selectedNotes, null, 2)
        const noteCount = selectedNotes.length
        const noteType = noteSelection === 'all' ? 'all' : 'single'
        fileName = `notes_${noteType}_${new Date().toISOString().slice(0, 10)}.json`
        mimeType = 'application/json'
      } else if (format === '2') {
        // Markdown 格式
        dataStr = selectedNotes.map((note: Note) => 
          `# ${note.title || '无标题'}\n\n${note.content}\n\n---\n\n`
        ).join('')
        const noteCount = selectedNotes.length
        const noteType = noteSelection === 'all' ? 'all' : 'single'
        fileName = `notes_${noteType}_${new Date().toISOString().slice(0, 10)}.md`
        mimeType = 'text/markdown'
      } else if (format === '3') {
        // TXT 格式
        dataStr = selectedNotes.map((note: Note) => 
          `${note.title || '无标题'}\n\n${note.content}\n\n${'='.repeat(50)}\n\n`
        ).join('')
        const noteCount = selectedNotes.length
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
      
      // 创建下载链接
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
      
      // 获取当前存储的密码作为 currentPassword
      const currentPassword = localStorage.getItem('password') || ''
      if (!currentPassword) {
        modal.showAlert('未找到当前密码，请重新登录', { 
          type: 'error',
          title: '登录错误',
          confirmText: '确定'
        })
        return
      }
      
      console.log('修改密码 - 当前密码长度:', currentPassword.length)
      console.log('修改密码 - 新密码长度:', newPassword.length)
      
      await authApi.changePassword({ currentPassword, newPassword })
      
      // 更新本地存储的密码
      localStorage.setItem('password', newPassword)
      
      // 清空输入
      setNewPassword('')
      // 更新密码状态
      setPasswordSource('d1')
      
      // 成功提示
      modal.showAlert('密码修改成功！系统将在3秒后退出重新登录。', { 
        type: 'success',
        title: '修改成功',
        confirmText: '确定'
      })
      
      // 延迟退出重新登录，让用户看到成功提示
      setTimeout(() => {
        // 清除本地存储的密码
        localStorage.removeItem('password')
        // 跳转到登录页面
        window.location.href = '/login'
      }, 3000)
    } catch (err: Note) {
      console.error('Change password error:', err)
      
      if (err.response?.status === 401) {
        modal.showAlert('当前密码错误，请检查后重试', { 
          type: 'error',
          title: '密码错误',
          confirmText: '确定'
        })
      } else if (err.response?.status === 400) {
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


  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white/60 backdrop-blur-xl rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-white/40">
        {/* 弹窗头部 */}
        <div className="bg-white/40 backdrop-blur-lg px-6 py-4 border-b border-white/40 flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">设置</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto bg-white/20 backdrop-blur-sm">
          {settingsCategories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="mb-6 last:mb-0">
              {/* 分类标题 */}
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-white/40">
                <div className="text-blue-600">
                  {category.icon}
                </div>
                <h3 className="font-medium text-gray-900">{category.title}</h3>
              </div>

              {/* 分类选项 */}
              <div className="space-y-4">
                {category.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center justify-between">
                    <label className="font-medium text-gray-700">
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

                                         {option.type === 'select' && (
                       <select 
                         value={settings[option.value as keyof typeof settings] as string}
                         onChange={(e) => handleSettingChange(option.value, e.target.value)}
                         className="border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                       >
                         {option.options?.map((opt, optIndex) => (
                           <option key={optIndex} value={opt}>
                             {opt}
                           </option>
                         ))}
                       </select>
                     )}

                                         {option.type === 'input' && (
                       <input
                         type="text"
                         value={settings[option.value as keyof typeof settings] as string}
                         onChange={(e) => handleSettingChange(option.value, e.target.value)}
                         className="border border-gray-300 rounded-md px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                       />
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
                  <div className="space-y-3 pt-2 border-t border-white/40">
                    {/* 密码状态显示 */}
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
                        {passwordSource === 'unknown' && (
                          <span>环境变量</span>
                        )}
                      </div>
                    </div>
                    
                    {/* 修改密码 */}
                    <div className="flex items-center justify-between">
                      <label className="font-medium text-gray-700">修改密码</label>
                      <div className="relative">
                        <input
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
                    
                    {/* 确定按钮 */}
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

        {/* 弹窗底部 */}
        <div className="bg-white/40 backdrop-blur-lg px-6 py-4 border-t border-white/40 flex justify-end gap-3">
          <button
            onClick={handleLogout}
            className="px-4 py-2 font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            退出
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            保存
          </button>
        </div>
      </div>

      {/* 上传笔记弹窗 */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white/90 backdrop-blur-xl rounded-lg shadow-xl w-full max-w-md mx-4 border border-white/40">
            {/* 弹窗头部 */}
            <div className="bg-white/40 backdrop-blur-lg px-6 py-4 border-b border-white/40 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">上传笔记</h3>
              <button
                onClick={handleCloseUploadModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="px-6 py-4">
              <div className="space-y-4">
                {/* 文件选择区域 */}
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

                {/* 文件信息 */}
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

                {/* 文件预览 */}
                {uploadPreview && (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                    <div className="font-medium text-gray-800 mb-2">文件预览：</div>
                    <div className="text-xs text-gray-600 bg-white p-2 rounded border max-h-32 overflow-y-auto">
                      <pre className="whitespace-pre-wrap">{uploadPreview}</pre>
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
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

      {/* 日志查看弹窗 */}
      {logsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white/95 backdrop-blur-xl rounded-lg shadow-xl w-full max-w-3xl mx-4 border border-white/40">
            <div className="bg-white/40 backdrop-blur-lg px-6 py-4 border-b border-white/40 flex justify-between items-center">
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
                    } as any)
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
                        (logsData?.items || []).map((it: any, idx: number) => {
                          let meta: any = null
                          try { meta = it.meta ? JSON.parse(it.meta) : null } catch {}
                          const levelColor = it.level === 'error' ? 'text-red-600' : (it.level === 'warn' || it.level === 'warning') ? 'text-yellow-700' : 'text-gray-800'
                          return (
                            <tr key={it.id || idx} className={idx % 2 ? 'bg-white' : 'bg-gray-50/50'}>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatLogTime(it.created_at)}</td>
                              <td className={`px-3 py-2 whitespace-nowrap font-medium ${levelColor}`}>{translateLevel(it.level)}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap text-gray-800">{translateMessage(it.message)}</td>
                              <td className="px-3 py-2 text-gray-700">
                                {meta ? (
                                  <pre className="text-xs bg-gray-50 rounded p-2 border border-gray-200 whitespace-pre-wrap break-words">{formatMeta(it.message, meta) as any}</pre>
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
            <div className="px-6 py-4 border-t border-white/40 flex justify-end gap-3 bg-white/40">
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


      {/* 弹窗组件 */}
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
