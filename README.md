# 科技刘笔记 - 项目结构总览

一个基于React + TypeScript + Cloudflare的现代化笔记应用，支持Markdown编辑、云同步和响应式设计。

## 🚀 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式框架**: Tailwind CSS + PostCSS
- **路由管理**: React Router DOM
- **Markdown**: React SimpleMDE Editor + React Markdown
- **部署平台**: Cloudflare Pages
- **数据库**:  D1 SQL数据库
- **UI组件**: Lucide React图标库


## 新建D1 SQL数据库建表SQL 语句

- `DB`: D1数据库绑定名称
  
```
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  tags TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('password_set', 'false', datetime('now'));
```

## 环境变量

- `PASSWORD`: 登录密码

## 📁 项目结构

```
notes/
├── 📄 配置文件
│   ├── package.json          # 项目依赖和脚本配置
│   ├── vite.config.ts        # Vite构建配置
│   ├── tailwind.config.js    # Tailwind CSS配置
│   ├── tsconfig.json         # TypeScript配置
│   ├── tsconfig.node.json    # Node环境TS配置
│   ├── postcss.config.js     # PostCSS配置
│   ├── index.html            # 应用入口HTML
│   └── README.md             # 项目说明文档
│
├── 📁 src/                   # 源代码目录
│   ├── 🚀 main.tsx          # React应用入口
│   ├── 📱 App.tsx           # 主应用组件
│   ├── 🎨 index.css         # 全局样式
│   │
│   ├── 🧩 components/        # 组件目录
│   │   ├── ErrorBoundary.tsx     # 错误边界组件
│   │   ├── NoteCard.tsx          # 笔记卡片组件
│   │   ├── NotesEditor.tsx       # 笔记编辑器组件
│   │   ├── NotesEditor.css       # 编辑器样式
│   │   ├── ProtectedRoute.tsx    # 路由保护组件
│   │   ├── SettingsModal.tsx     # 设置模态框
│   │   └── 📁 ui/               # UI基础组件
│   │       ├── Button.tsx        # 按钮组件
│   │       ├── Input.tsx         # 输入框组件
│   │       ├── Loading.tsx       # 加载组件
│   │       ├── PageLoading.tsx   # 页面加载组件
│   │       ├── PreloadLink.tsx   # 预加载链接组件
│   │       └── index.ts          # UI组件导出
│   │
│   ├── 📁 pages/            # 页面组件目录
│   │   ├── LoginPage.tsx         # 登录页面
│   │   ├── NotesListPage.tsx     # 笔记列表页面
│   │   ├── NotesPage.tsx         # 笔记主页面
│   │   ├── NoteEditPage.tsx      # 笔记编辑页面
│   │   └── NoteViewPage.tsx      # 笔记查看页面
│   │
│   ├── 📁 hooks/            # 自定义Hooks
│   │   ├── useLocalStorage.ts     # 本地存储Hook
│   │   └── usePerfMonitor.ts     # 性能监控Hook
│   │
│   ├── 📁 contexts/         # React Context
│   │   └── AuthContext.tsx       # 认证上下文
│   │
│   ├── 📁 lib/              # 工具库
│   │   ├── api.ts                # API接口封装
│   │   └── utils.ts              # 工具函数
│   │
│   └── 📁 types/            # 类型定义
│       └── index.ts              # 类型声明文件
│
├── 📁 functions/            # 云函数目录
│   └── 📁 api/              # API函数
│       ├── backup.ts             # 备份功能
│       ├── login.ts              # 登录认证
│       ├── notes.ts              # 笔记CRUD操作
│       └── 📁 notes/            # 笔记相关API
│           └── [id].ts           # 单个笔记操作
│
└── 📁 public/               # 静态资源
    └── 📁 image/            # 图片资源
        ├── background.png        # 背景图片
        └── logo.png             # 应用Logo
```
