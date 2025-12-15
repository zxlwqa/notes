# 个人笔记系统

## 一个基于React的现代化风格笔记应用，支持Markdown编辑、笔记云同步，支持多平台部署

<p align="center">
  <img src="./logo.webp" alt="notes" />
</p>

<p align="center">
  </a>
  <a href="https://reactjs.org/">
    <img src="https://img.shields.io/badge/React-18.3.1-lightblue.svg?logo=react&logoColor=61DAFB" alt="React">
  </a>
  <a href="https://vitejs.dev/">
    <img src="https://img.shields.io/badge/Vite-5.4.8-violet.svg?logo=vite&logoColor=646CFF" alt="Vite">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-4.9.5-blue.svg?logo=typescript&logoColor=3178C6" alt="TypeScript">
  </a>
  <a href="https://github.com/zxlwq/notes">
    <img src="https://img.shields.io/badge/GitHub-Repo-black.svg?logo=github&logoColor=black" alt="GitHub Repo">
  </a>
  <a href="https://pages.edgeone.ai/">
    <img src="https://img.shields.io/badge/EdgeOne-Pages-blue.svg?logo=cloudflare&logoColor=blue" alt="EdgeOne Pages">
  </a>
  <a href="https://vercel.com/">
    <img src="https://img.shields.io/badge/Vercel-Deploy-black.svg?logo=vercel&logoColor=black" alt="Vercel">
  </a>
  <a href="https://pages.cloudflare.com/">
    <img src="https://img.shields.io/badge/Cloudflare-Pages-orange.svg?logo=cloudflare&logoColor=F38020" alt="Cloudflare Pages">
  </a>
</p>

![notes](./notes.webp)


---


# 🚀 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式框架**: Tailwind CSS + PostCSS
- **编辑器**: React Markdown

# ✨ 功能特性

- ✅ Markdown 编辑器
- ✅ 笔记云同步
- ✅ 标签管理
- ✅ 拖拽排序（标签和笔记）
- ✅ 高级搜索
- ✅ 密码保护
- ✅ 多平台部署




---




# 📦 多平台部署

本项目支持多平台部署：

| 部署平台 | 数据库 |
|---------|--------|
| Cloudflare Pages | D1数据库 |
| EdgeOne Pages | Neon数据库 |
| Vercel | Neon数据库 |
| Hugging Face Spaces | Neon数据库 |
| Koyeb | Neon数据库 |
| Render | Neon数据库 |
| Docker | Neon数据库 |


---


# Cloudflare Pages 部署 (推荐)

## 部署步骤：

1. **Fork该项目**

2. **创建数据库**
   - 在Cloudflare创建D1数据库，命名为 `notes`
   - 在D1控制台执行以下SQL初始化建表语句
   - 在Pages项目设置中绑定D1数据库，绑定名称为 `NOTESD`

3. **D1 数据库建表语句**
   ```sql
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

   CREATE TABLE IF NOT EXISTS logs (
     id INTEGER PRIMARY KEY,
     level TEXT,
     message TEXT NOT NULL,
     meta TEXT,
     created_at TEXT DEFAULT (datetime('now'))
   );

   CREATE TABLE IF NOT EXISTS order_data (
     key TEXT PRIMARY KEY,
     value TEXT,
     updated_at TEXT DEFAULT (datetime('now'))
   );
   ```

4. **部署到 Cloudflare Pages**
   - 访问 [Cloudflare Pages](https://pages.cloudflare.com/)
   - 连接 GitHub 仓库
   - 选择框架：React(Vite)
   - 添加环境变量
   - 部署完成后绑定D1数据库
   - 添加自定义名
   - 重试部署
   


---



# Vercel 部署


## 部署步骤：

1. **Fork该项目**

2. **创建数据库**
   - Storage选项栏点击 "Create Database" 创建Neon数据库并获取数据库连接字符串：DATABASE_URL=postgresql://username:password@host:port/database

3. **部署到 Vercel**
   - 访问 [Vercel](https://vercel.com/)
   - 点击 "Add new project" 连接你的 GitHub仓库
   - 添加环境变量
   - 部署完成添加自定义名
   

---



# EdgeOne Pages 部署

## 部署步骤：

1. **Fork该项目**

2. **创建数据库**
   - 创建[Neon数据库](https://neon.tech/)并获取数据库连接字符串：DATABASE_URL=postgresql://

3. **部署到 EdgeOne Pages**
   - 访问 [EdgeOne Pages](https://pages.edgeone.ai/)
   - 点击 "创建项目" 连接 GitHub仓库
   - 添加环境变量：
   - 部署完成添加自定义名


---

   
# Hugging Face Spaces部署

## 使用 [notes-api.yml](.github/workflows/notes-api.yml) 创建 Spaces

1. **创建[Neon数据库](https://neon.tech/)并获取数据库连接字符串：DATABASE_URL=postgresql://**

2. **创建Token（需要写权限）**

3. **运行GitHub Actions**

4. **自动创建 Spaces**
   - 脚本会自动创建 Hugging Face Spaces
   - 设置所有必要的环境变量


---



## 🔧 环境变量

所有平台都需要配置以下环境变量：

| 变量名 | 说明 | 示例 | 需否 |
|--------|------|------|------|
| `PASSWORD` | 登录密码 | `123456` |  ✅ |
| `DATABASE_URL` | 数据库连接字符串 | `postgresql://` | ✅ |
| `ACCOUNT_ID` | Cloudflare账户ID | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | ❌ |
| `ACCESS_KEY_ID` | R2访问密钥ID | 帐户 API 令牌 |  ❌ |
| `SECRET_ACCESS_KEY` | R2秘密访问密钥 | 帐户 API 令牌 | ❌ |
| `WEBDAV_URL` | WebDAV 服务器地址 | `https://notes.zxlwq.dav/` | ❌ |
| `WEBDAV_USER` | WebDAV 用户名 | `admin` | ❌ |
| `WEBDAV_PASS` | WebDAV 密码 | `admin` | ❌ |
| `GIT_TOKEN` | GitHub Token | `ghp_xxxxxxxxxxxx` | ❌ |

> Cloudflare Pages只需在设置中绑定 R2 存储桶
>    - 绑定名称设为 `NOTESR`
>    - R2 存储桶名称 `notes`

## 如果您喜欢这个项目，请给一个⭐星标！