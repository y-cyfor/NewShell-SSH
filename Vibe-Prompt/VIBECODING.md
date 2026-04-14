---

# NewShell - 跨平台 SSH 管理工具 Vibecoding 文档

> 版本: v0.1.0 | 日期: 2026-03-27 | 状态: 已确认

---

## 1. 项目愿景

NewShell 是一款免费、开源、跨平台的 SSH 管理工具，解决市面上 SSH 工具同步收费、窗口数量限制等痛点。

**核心价值主张:**
- 永久免费，无窗口数量限制
- 本地优先，数据自控
- 自建同步，不依赖第三方云服务
- AI 辅助运维，提升效率

**竞品参考:**

| 工具 | 痛点 | NewShell 解决方案 |
|------|------|-------------------|
| Termius | 同步功能收费 $10/月 | 自建后端免费同步 |
| Tabby | 无移动端，无文件管理集成 | Tauri 2 支持 Android，内置文件树 |
| MobaXterm | 仅 Windows，免费版 12 窗口限制 | 跨平台，无窗口限制 |
| WindTerm | 停更，无 AI 集成 | 活跃开发，内置 AI 助手 |
| FinalShell | Java 占用高，广告 | Go + Rust，轻量无广告 |

---

## 2. 技术架构

### 2.1 整体架构

```
+---------------------------------------------------+
|                  Tauri 2 前端                       |
|  +----------+  +----------------+  +-------------+ |
|  | 文件树面板 |  |   终端面板      |  | 系统信息面板 | |
|  | (React)   |  | (xterm.js)     |  | (React)     | |
|  +----------+  +----------------+  +-------------+ |
|                                    |  AI 对话面板  | |
|                                    | (React)      | |
|                                    +-------------+ |
+---------------------+------------------------------+
                      | HTTP / WebSocket
                      v
+---------------------------------------------------+
|                  Go 后端服务                        |
|  +----------+  +------------+  +-----------------+ |
|  | SSH 连接  |  | 文件管理    |  | 用户/同步管理   | |
|  | 管理器    |  | (SFTP)     |  |                 | |
|  +----------+  +------------+  +-----------------+ |
|  +----------+  +------------+  +-----------------+ |
|  | 系统信息  |  | AI 代理     |  | SQLite + AES   | |
|  | 采集器    |  | (OpenAI)   |  | 加密存储        | |
|  +----------+  +------------+  +-----------------+ |
+---------------------------------------------------+
```

### 2.2 技术栈选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 桌面外壳 | Tauri 2.0 | 体积小 (~10MB)，支持 Windows + Android |
| 前端框架 | React 18 + TypeScript | 生态成熟，xterm.js 集成好 |
| 构建工具 | Vite 5 | 快速 HMR，Tauri 官方推荐 |
| 终端模拟 | xterm.js 5 | 行业标准，支持语法高亮、WebGL 渲染 |
| UI 组件 | Tailwind CSS + Radix UI | 轻量、可定制、无障碍 |
| 状态管理 | Zustand | 轻量，适合中等复杂度应用 |
| 面板布局 | react-resizable-panels | 可拖拽分隔面板 |
| 后端语言 | Go 1.22+ | 单文件部署，并发优秀 |
| SSH 库 | golang.org/x/crypto/ssh | 官方标准库，支持密码/密钥/交互式认证 |
| SFTP | github.com/pkg/sftp | 配合 crypto/ssh 使用 |
| 数据库 | SQLite (modernc.org/sqlite) | 纯 Go 实现，无需 CGO |
| 加密 | AES-256-GCM | 对敏感字段加密存储 |
| AI 接口 | OpenAI 兼容 API | 支持 OpenAI / DeepSeek / Ollama 等 |
| 通信协议 | REST API + WebSocket | REST 用于 CRUD，WS 用于终端实时传输 |
| HTTP 框架 | Gin | Go 高性能 HTTP 框架 |
| JWT | golang-jwt/jwt v5 | 用户鉴权 |

---

## 3. 项目目录结构

```
NewShell/
├── src-tauri/                  # Tauri 2 桌面/移动端配置
│   ├── src/main.rs             # Tauri 入口，管理 Go 后端进程
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── capabilities/
│
├── src/                        # React 前端
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── MainLayout.tsx       # 三栏布局主容器
│   │   │   ├── ResizablePanel.tsx   # 可拖拽分隔面板
│   │   │   └── ThemeProvider.tsx    # 明暗主题切换
│   │   ├── sidebar/
│   │   │   ├── ConnectionList.tsx   # 连接列表
│   │   │   ├── GroupTree.tsx        # 分组树
│   │   │   ├── AddConnectionModal.tsx
│   │   │   └── ConnectionCard.tsx
│   │   ├── terminal/
│   │   │   ├── TerminalPanel.tsx    # xterm.js 封装
│   │   │   ├── TerminalTab.tsx      # 多标签页
│   │   │   └── useTerminal.ts
│   │   ├── filetree/
│   │   │   ├── FileTreePanel.tsx    # SFTP 文件树
│   │   │   ├── FileTreeNode.tsx
│   │   │   └── useFileTree.ts
│   │   ├── sysinfo/
│   │   │   ├── SysInfoPanel.tsx     # 系统信息
│   │   │   ├── CpuChart.tsx
│   │   │   ├── MemoryChart.tsx
│   │   │   └── DiskUsage.tsx
│   │   ├── ai/
│   │   │   ├── AiChatPanel.tsx      # AI 对话
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   └── useAiChat.ts
│   │   ├── auth/
│   │   │   ├── LoginModal.tsx
│   │   │   └── ServerConfig.tsx
│   │   └── settings/
│   │       ├── SettingsPanel.tsx
│   │       ├── ThemeToggle.tsx
│   │       └── AiSettings.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useConnections.ts
│   │   └── useSync.ts
│   ├── stores/
│   │   ├── connectionStore.ts
│   │   ├── terminalStore.ts
│   │   ├── authStore.ts
│   │   └── themeStore.ts
│   ├── services/
│   │   ├── api.ts              # axios HTTP 客户端
│   │   ├── wsService.ts        # WebSocket 管理
│   │   └── crypto.ts
│   ├── types/
│   ├── styles/globals.css
│   └── utils/
│
├── server/                     # Go 后端
│   ├── main.go
│   ├── go.mod / go.sum
│   ├── config/config.go
│   ├── handlers/
│   │   ├── auth.go / connection.go / terminal.go
│   │   ├── file.go / sysinfo.go / ai.go / sync.go
│   ├── models/
│   │   ├── user.go / connection.go / database.go
│   ├── services/
│   │   ├── ssh_service.go / sftp_service.go
│   │   ├── ai_service.go / sync_service.go / crypto_service.go
│   ├── middleware/
│   │   ├── auth.go / cors.go
│   └── database/
│       ├── db.go
│       └── migrations/001_init.sql, 002_sync.sql
│
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 4. 数据库设计

### 4.1 SQLite Schema

```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,           -- bcrypt
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE connections (
    id            TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    user_id       TEXT,                    -- NULL = 本地连接(未登录)
    name          TEXT NOT NULL,           -- 服务器名称
    host          TEXT NOT NULL,
    port          INTEGER DEFAULT 22,
    username      TEXT NOT NULL,
    auth_type     TEXT NOT NULL DEFAULT 'password', -- password|key|agent
    password_enc  TEXT,                    -- AES-256-GCM 加密
    private_key   TEXT,                    -- AES-256-GCM 加密
    passphrase    TEXT,                    -- AES-256-GCM 加密
    group_name    TEXT DEFAULT '默认分组',
    remark        TEXT,
    color         TEXT DEFAULT '#3b82f6',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_version  INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE ai_config (
    id            TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    user_id       TEXT,
    api_base      TEXT DEFAULT 'https://api.openai.com/v1',
    api_key       TEXT,                    -- AES-256-GCM 加密
    model         TEXT DEFAULT 'gpt-4o',
    system_prompt TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_connections_user_id ON connections(user_id);
CREATE INDEX idx_connections_group ON connections(group_name);
```

### 4.2 加密方案

- 加密字段: `password_enc`, `private_key`, `passphrase`, `api_key`
- 算法: AES-256-GCM
- 密钥派生: PBKDF2 (100000 迭代) -> 256-bit 密钥
- 本地模式: 随机生成密钥存储在本地 config
- 同步模式: 用户密码派生密钥

---

## 5. API 设计

### 5.1 REST API

```
POST   /api/auth/login              # 登录 -> JWT
POST   /api/auth/register           # 注册
POST   /api/auth/logout             # 登出

GET    /api/connections             # 连接列表
POST   /api/connections             # 创建连接
PUT    /api/connections/:id         # 更新连接
DELETE /api/connections/:id         # 删除连接
POST   /api/connections/:id/test    # 测试连接

GET    /api/files/:connId/*         # SFTP 文件操作
POST   /api/files/:connId/upload    # 文件上传

GET    /api/sysinfo/:connId         # 系统信息

POST   /api/ai/chat                 # AI 对话 (SSE 流式)
GET    /api/ai/config               # AI 配置
PUT    /api/ai/config               # 更新 AI 配置

POST   /api/sync/pull               # 拉取远端
POST   /api/sync/push               # 推送本地
```

### 5.2 WebSocket

```
ws://host:port/ws/terminal/:connId

客户端 -> 服务端: { "type": "input", "data": "ls -la\n" }
服务端 -> 客户端: { "type": "output", "data": "..." }
控制消息:         { "type": "resize", "cols": 120, "rows": 30 }
```

---

## 6. 功能模块详细设计

### 6.1 三栏布局 (可拖拽)

```
+--------------+--------------------------+------------------+
|              |                          |   系统信息        |
|   连接列表    |                          |   CPU/MEM/DISK   |
|   + 分组树   |      终端 (xterm.js)     |------------------|
|              |      多标签页            |   AI 对话窗口    |
|              |      语法高亮            |   流式输出       |
|  [添加连接]   |      复制粘贴            |                  |
+--------------+--------------------------+------------------+
```

- react-resizable-panels 实现三栏可拖拽
- 右侧面板内系统信息/AI 对话上下可拖拽
- 每栏可最小化/展开
- Android 端: 左侧默认收起，汉堡菜单唤出

### 6.2 SSH 连接管理

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 服务器名称 | string | 是 | "生产环境-Web01" |
| 主机地址 | string | 是 | IP/域名 |
| 端口 | number | 是 | 默认 22 |
| 用户名 | string | 是 | SSH 用户 |
| 认证方式 | enum | 是 | password / key / agent |
| 密码 | string | 条件 | password 时必填 |
| 私钥 | string | 条件 | key 时必填 |
| 私钥口令 | string | 可选 | |
| 分组 | string | 可选 | 默认 "默认分组" |
| 备注 | string | 可选 | |
| 标签颜色 | color | 可选 | 视觉区分 |

### 6.3 终端

- xterm.js + WebGL 渲染
- 搜索 (Ctrl+F)、全屏、复制粘贴
- 多标签页 (无限制)、Ctrl+T/W 新建/关闭
- ANSI 语义着色增强

### 6.4 文件树 (SFTP)

- 面板内树形结构展示，展开/折叠均在同一面板层级内操作，不打开新栏
- 支持: 新建文件/文件夹、重命名、删除、下载、上传
- 拖拽上传 (桌面端)
- 右键菜单操作
- 路径面包屑导航
- 文件图标 (根据后缀显示不同图标)

### 6.5 系统信息面板

通过 SSH 执行命令采集，默认 5 秒刷新，刷新频率可在设置中调整 (1s/3s/5s/10s/30s):
- CPU/内存/磁盘使用率 (进度条)
- 网络流量
- 系统版本、运行时间

### 6.6 AI 对话窗口

- OpenAI 兼容接口，支持 DeepSeek/Ollama 等
- SSE 流式输出
- 代码块一键复制
- 最近 20 轮上下文
- 预设问题快捷按钮
- 默认 System Prompt: 运维专家人设

### 6.7 主题

- 暗色 (默认): slate-900 背景 + blue-500 强调
- 亮色: 白色背景 + blue-600 强调
- localStorage 记忆偏好
- xterm.js 配色同步切换

### 6.8 同步

- 离线优先: 默认纯本地 SQLite
- 未登录: `user_id = NULL`
- 登录后增量同步: Pull + Push
- 冲突处理: 检测到本地与远程数据冲突时，展示对比冲突项并弹窗询问用户选择:
  - "以本地为准" -> 本地数据同步到服务器
  - "以服务器为准" -> 服务器数据同步到本地

### 6.9 登录与后端配置

- 首次打开: 自动启动本地 Go 后端 -> 直接使用
- 同步时: 填写后端地址 + 用户名密码
- 本地后端: Tauri 管理进程生命周期，默认端口 29800

---

## 7. 开发阶段

| Phase | 内容 |
|-------|------|
| 1 - MVP | 项目骨架、三栏布局、主题、连接 CRUD、SSH 终端 (密码) |
| 2 - 核心 | 密钥认证、多标签、语法高亮、SFTP 文件树、系统信息 |
| 3 - AI+同步 | AI 对话 (SSE)、用户系统、AES 加密、增量同步 |
| 4 - 打包 | Android 适配、移动端 UI、性能优化、打包发布 |

---

## 8. 关键依赖

### 前端
```
@tauri-apps/api ^2.x, @xterm/xterm ^5.x,
@xterm/addon-webgl, @xterm/addon-search, @xterm/addon-fit,
react ^18.x, zustand ^5.x, tailwindcss ^3.x,
@radix-ui/react-dialog, @radix-ui/react-dropdown-menu,
react-resizable-panels ^2.x, lucide-react, axios ^1.x
```

### 后端
```
golang.org/x/crypto ^0.37 (SSH)
github.com/pkg/sftp ^1.13 (SFTP)
modernc.org/sqlite ^1.36 (纯 Go SQLite)
github.com/gorilla/websocket ^1.5 (WebSocket)
github.com/gin-gonic/gin ^1.10 (HTTP)
github.com/golang-jwt/jwt/v5 (JWT)
```

---

## 9. 安全

| 威胁 | 措施 |
|------|------|
| 数据库泄露 | AES-256-GCM 加密敏感字段 |
| 中间人 | SSH 协议加密 + host key 验证 |
| API 越权 | JWT + 本地 127.0.0.1 |
| 密码明文 | HTTPS (生产) / localhost (本地) |
| AI Key 泄露 | 加密存储，不参与同步 |

---

## 10. 验收标准

- 启动 < 3s | 连接 < 2s | 终端延迟 < 50ms
- 文件树 < 1s (1000 文件) | AI 首字 < 3s
- 主题切换无闪烁 | 同步 100 条 < 5s
- Windows exe < 30MB | Android APK < 25MB
- 内存 < 200MB

---

## 11. 已确认项

| # | 项目 | 决定 |
|---|------|------|
| 1 | 文件树展开方式 | 面板内树形层级展开/折叠，不打开新栏 |
| 2 | 系统信息刷新频率 | 默认 5s，设置页可调 (1/3/5/10/30s) |
| 3 | AI 上下文轮数 | 最近 20 轮 |
| 4 | 同步冲突策略 | 弹窗询问用户: 本地优先 or 服务器优先 |
| 5 | Android 端优先级 | Windows 稳定后再做 |
| 6 | 连接导入导出 | 不支持从其他工具导入 |
| 7 | 终端配色预设 | 4-6 个常用预设 (Dracula, Monokai, Solarized, Nord, One Dark, Tokyo Night) |
| 8 | Go 后端默认端口 | 29800 |

---
