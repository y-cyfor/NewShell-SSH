# NewShell 产品需求文档 (PRD)

> 版本: v0.1.0 | 最后更新: 2026-04-02 | 状态: 开发中

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [前端架构](#3-前端架构)
4. [后端架构](#4-后端架构)
5. [数据库设计](#5-数据库设计)
6. [状态管理](#6-状态管理)
7. [业务逻辑详解](#7-业务逻辑详解)
8. [Agent系统](#8-agent系统)
9. [安全机制](#9-安全机制)
10. [部署配置](#10-部署配置)
11. [交互流程图](#11-交互流程图)
12. [关键代码说明](#12-关键代码说明)

---

## 1. 项目概述

### 1.1 产品定位

NewShell 是一款**免费、开源、跨平台**的 SSH 管理工具，解决市面上 SSH 工具的痛点：
- 同步功能收费（如 Termius $10/月）
- 窗口数量限制（如 MobaXterm 免费版12个）
- 广告和性能问题（如 FinalShell）
- 缺乏AI辅助和现代UI

### 1.2 核心价值主张

| 特性 | 说明 |
|------|------|
| 永久免费 | 无窗口数量限制，无功能限制 |
| 本地优先 | 默认纯本地运行，数据自控 |
| 自建同步 | 支持自建后端同步，不依赖第三方 |
| AI 辅助 | 内置 AI 助手，支持 Agent 模式自动执行 |

### 1.3 功能模块总览

```
┌─────────────────────────────────────────────────────────────┐
│                     NewShell 功能架构                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ SSH连接管理  │  │  多标签终端  │  │ SFTP文件管理 │         │
│  │ - 密码认证   │  │ - xterm.js  │  │ - 文件树     │         │
│  │ - 密钥认证   │  │ - WebGL渲染 │  │ - 上传下载   │         │
│  │ - 分组管理   │  │ - 语法高亮  │  │ - 拖拽支持   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 系统信息监控 │  │  AI对话助手  │  │  数据同步    │         │
│  │ - CPU/内存   │  │ - 传统对话   │  │ - 本地存储   │         │
│  │ - 磁盘/网络  │  │ - Agent模式  │  │ - 云端同步   │         │
│  │ - 进程列表   │  │ - 工具调用   │  │ - 冲突处理   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 界面布局

```
┌─────────────────────────────────────────────────────────────┐
│ ◀ □ ✕  NewShell                                    [🌲][⚙️] │  <- 标题栏(无边框)
├──┬──────────────────────────────────────────────────────────┤
│  │                                                          │
│S │                  终端区域 (xterm.js)                      │  <- 主终端面板
│E │  ┌────────────────────────────────────────────────────┐  │
│R │  │ user@server:~$ ls -la                              │  │
│V │  │ total 48                                           │  │
│E │  │ drwxr-xr-x  5 user user 4096 Apr  2 10:30 .        │  │
│R │  │ drwxr-xr-x  3 root root 4096 Apr  1 15:20 ..       │  │
│  │  └────────────────────────────────────────────────────┘  │
│列 │─────────────────────────────────────────────────────────│
│表 │                                                         │
│  │  文件树面板                    │  系统信息/AI面板         │
│  │  ┌─────────────────────┐      │  ┌─────────────────────┐│
│  │  │ 📁 /                │      │  │ CPU: ████████░░ 80% ││
│  │  │  ├─ 📁 home         │      │  │ MEM: ██████░░░░ 60% ││
│  │  │  ├─ 📁 var          │      │  │ DISK: ████░░░░░ 40% ││
│  │  │  └─ 📁 etc          │      │  │─────────────────────││
│  │  └─────────────────────┘      │  │ AI 对话窗口          ││
│  │                               │  │ [输入问题...]        ││
├──┴───────────────────────────────┴──┴─────────────────────┤
│                                                           │  <- 状态栏
└───────────────────────────────────────────────────────────┘
```

---

## 2. 技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri 2.0 桌面应用                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  React 18 前端                           ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   ││
│  │  │ 组件层   │  │ 状态层   │  │ 服务层   │  │ 工具层   │   ││
│  │  │Components│  │ Stores  │  │Services │  │ Utils   │   ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘   ││
│  └────────────────────────┬────────────────────────────────┘│
│                           │ HTTP/WebSocket                  │
│  ┌────────────────────────┴────────────────────────────────┐│
│  │                  Go 后端 (Tauri子进程)                    ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   ││
│  │  │Handlers │  │Services │  │ Models  │  │Database │   ││
│  │  │ API层   │  │ 业务层   │  │ 数据层   │  │ SQLite  │   ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘   ││
│  └────────────────────────┬────────────────────────────────┘│
│                           │ SSH/SFTP                        │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │     远程服务器 (目标机器)     │
              └────────────────────────────┘
```

### 2.2 技术栈详情

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 桌面框架 | Tauri | 2.0 | 跨平台桌面应用外壳 |
| 前端框架 | React | 18.3 | UI组件化开发 |
| 构建工具 | Vite | 5.4 | 快速HMR开发体验 |
| 类型系统 | TypeScript | 5.6 | 静态类型检查 |
| 终端模拟 | xterm.js | 5.5 | 终端渲染引擎 |
| UI样式 | Tailwind CSS | 3.4 | 原子化CSS框架 |
| 图标库 | FontAwesome + Lucide | - | 图标系统 |
| 状态管理 | Zustand | 5.0 | 轻量级状态管理 |
| HTTP客户端 | Axios | 1.7 | API请求 |
| 后端语言 | Go | 1.22+ | 高性能后端 |
| HTTP框架 | Gin | 1.10 | Go Web框架 |
| 数据库 | SQLite | - | 嵌入式数据库 |
| SSH库 | golang.org/x/crypto | 0.37 | SSH连接 |
| SFTP库 | github.com/pkg/sftp | 1.13 | 文件传输 |
| WebSocket | gorilla/websocket | 1.5 | 实时通信 |

### 2.3 通信协议

```
┌─────────────────────────────────────────────────────────────┐
│                      通信协议矩阵                             │
├─────────────────────────────────────────────────────────────┤
│  协议        │  用途                    │  端点示例          │
├─────────────────────────────────────────────────────────────┤
│  HTTP REST   │  CRUD操作                │  /api/connections  │
│  WebSocket   │  终端实时IO              │  /ws/terminal/:id  │
│  SSE         │  AI流式输出              │  /api/ai/chat      │
│  SSH         │  服务器连接              │  出站22端口        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 前端架构

### 3.1 目录结构

```
src/
├── App.tsx                       # 应用根组件
├── main.tsx                      # 入口文件
├── components/                   # UI组件
│   ├── layout/                   # 布局组件
│   │   ├── MainLayout.tsx        # 主布局(三栏)
│   │   ├── TitleBar.tsx          # 标题栏(无边框)
│   │   ├── ActivityBar.tsx       # 活动栏(侧边切换)
│   │   └── SidebarPanel.tsx      # 侧边栏容器
│   ├── sidebar/                  # 侧边栏内容
│   │   ├── ConnectionList.tsx    # 连接列表
│   │   └── AddConnectionModal.tsx# 添加连接弹窗
│   ├── terminal/                 # 终端相关
│   │   ├── TerminalPanel.tsx     # SSH终端面板
│   │   ├── TerminalTabs.tsx      # 终端标签管理
│   │   └── AgentTerminalPanel.tsx# Agent终端(只读)
│   ├── filetree/                 # 文件树
│   │   ├── FileTreePanel.tsx     # 基础文件树
│   │   └── EnhancedFileTreePanel.tsx # 增强版(上传下载)
│   ├── sysinfo/                  # 系统信息
│   │   ├── SysInfoPanel.tsx      # 基础信息
│   │   └── ExtendedSysInfoPanel.tsx # 扩展信息
│   ├── ai/                       # AI相关
│   │   ├── AiChatPanel.tsx       # AI对话面板
│   │   ├── AgentMessage.tsx      # Agent消息渲染
│   │   ├── ToolCallCard.tsx      # 工具调用卡片
│   │   ├── ConfirmDialog.tsx     # 确认对话框
│   │   └── AgentSessionList.tsx  # 历史会话
│   ├── settings/                 # 设置
│   │   └── SettingsPanel.tsx     # 设置面板
│   └── server/                   # 服务器
│       └── ServerListPanel.tsx   # 服务器列表
├── stores/                       # Zustand状态
│   ├── connectionStore.ts        # 连接状态
│   ├── terminalStore.ts          # 终端状态
│   ├── activityStore.ts          # 活动状态
│   ├── aiConfigStore.ts          # AI配置
│   ├── agentStore.ts             # Agent状态
│   ├── fileTransferStore.ts      # 文件传输
│   ├── groupStore.ts             # 分组管理
│   ├── syncStore.ts              # 同步状态
│   └── themeStore.ts             # 主题状态
├── services/                     # 服务层
│   ├── api.ts                    # Axios HTTP客户端
│   ├── wsService.ts              # WebSocket服务
│   └── agentService.ts           # Agent API
├── types/                        # 类型定义
│   └── index.ts                  # 全局类型
├── utils/                        # 工具函数
│   ├── fileIcons.tsx             # 文件图标映射
│   └── terminalHighlighter.ts    # 终端高亮
└── styles/                       # 样式
    └── globals.css               # 全局样式+CSS变量
```

### 3.2 组件详细说明

#### 3.2.1 MainLayout.tsx - 主布局

**职责**: 组织整个应用界面结构，管理三栏布局

**状态管理**:
```typescript
const [showSettings, setShowSettings] = useState(false);      // 设置面板显示
const [showFileTree, setShowFileTree] = useState(true);       // 文件树显示
const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // 侧边栏折叠
const [sidebarWidth, setSidebarWidth] = useState(240);        // 侧边栏宽度(px)
const [isResizing, setIsResizing] = useState(false);          // 拖拽调整中
```

**布局结构**:
```
┌─────────┬─────────────────────────────────────────────────┐
│         │                                                 │
│ Activity│              Main Content Area                  │
│   Bar   │  ┌─────────────────┬─────────────────────────┐ │
│         │  │                 │                         │ │
│  [服务器] │  │   TerminalTabs  │   Right Panel          │ │
│  [AI]   │  │                 │   (SysInfo + AiChat)   │ │
│         │  │                 │                         │ │
│         │  ├─────────────────┴─────────────────────────┤ │
│         │  │           FileTree (可选)                  │ │
│         │  └───────────────────────────────────────────┘ │
├─────────┼─────────────────────────────────────────────────┤
│ Sidebar │                                                 │
│ Panel   │                                                 │
└─────────┴─────────────────────────────────────────────────┘
```

**关键交互**:
1. 侧边栏宽度拖拽调整 (保存到localStorage)
2. 侧边栏折叠/展开
3. 文件树面板显示/隐藏
4. 设置面板显示/隐藏

#### 3.2.2 TitleBar.tsx - 标题栏

**职责**: 无边框窗口的自定义标题栏，包含窗口控制

**Props**:
```typescript
interface TitleBarProps {
  onToggleFileTree?: () => void;   // 切换文件树
  onToggleSettings?: () => void;   // 切换设置
  showFileTree?: boolean;          // 文件树状态
}
```

**窗口控制**: 使用Tauri API
- `appWindow.minimize()` - 最小化
- `appWindow.toggleMaximize()` - 最大化/还原
- `appWindow.close()` - 关闭

#### 3.2.3 TerminalPanel.tsx - SSH终端

**职责**: xterm.js终端模拟器封装，处理SSH I/O

**Props**:
```typescript
interface Props {
  connId: string;    // 连接ID
  isActive: boolean; // 是否活动标签
}
```

**核心逻辑**:
```typescript
// 1. 创建xterm实例
const term = new Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  theme: currentTheme  // 跟随应用主题
});

// 2. 加载插件
const fitAddon = new FitAddon();      // 自适应大小
const webglAddon = new WebGLAddon();  // WebGL渲染
const searchAddon = new SearchAddon(); // 搜索功能

// 3. WebSocket连接
const ws = createTerminalWS(
  connId,
  (data) => term.write(data),           // 接收输出
  (err) => term.write(`\r\nError: ${err}`)
);

// 4. 用户输入 -> WebSocket
term.onData((data) => sendInput(ws, data));

// 5. 窗口大小变化
term.onResize(({ cols, rows }) => sendResize(ws, cols, rows));
```

**WebSocket消息格式**:
```typescript
// 连接消息(首次)
{
  type: 'connect',
  host: string,
  port: number,
  username: string,
  auth_type: 'password' | 'key',
  password?: string,
  private_key?: string,
  passphrase?: string
}

// 用户输入
{ type: 'input', data: string }

// 终端大小
{ type: 'resize', cols: number, rows: number }

// 服务端输出
{ type: 'output', data: string }
{ type: 'error', message: string }
{ type: 'connected' }
```

#### 3.2.4 EnhancedFileTreePanel.tsx - 增强文件树

**职责**: SFTP文件管理，支持上传/下载/创建/删除

**状态管理**:
```typescript
const [path, setPath] = useState('/');              // 当前路径
const [files, setFiles] = useState<FileItem[]>([]); // 文件列表
const [loading, setLoading] = useState(false);      // 加载状态
const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
const [showTransfers, setShowTransfers] = useState(true); // 传输面板
```

**FileItem结构**:
```typescript
interface FileItem {
  name: string;
  path: string;
  size: number;
  mode: string;      // 权限字符串 "drwxr-xr-x"
  modTime: string;   // 修改时间
  isDir: boolean;
}
```

**API端点**:
- `GET /api/files/:connId/list?path=/` - 列出目录
- `GET /api/files/:connId/download?path=/file.txt` - 下载文件
- `POST /api/files/:connId/upload` - 上传文件 (multipart)
- `POST /api/files/:connId/mkdir` - 创建目录
- `POST /api/files/:connId/delete` - 删除文件
- `POST /api/files/:connId/rename` - 重命名

**拖拽上传实现**:
```typescript
const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files);
  for (const file of files) {
    await fileTransferStore.uploadFile(connId, currentPath, file);
  }
};
```

#### 3.2.5 AiChatPanel.tsx - AI对话面板

**职责**: AI对话界面，支持传统对话和Agent模式

**模式切换**:
```typescript
// agentStore中的mode状态
mode: 'chat' | 'agent'
```

**传统对话流程**:
1. 用户输入消息
2. 调用 `/api/ai/chat-proxy` (SSE)
3. 流式接收响应并显示

**Agent模式流程**:
1. 用户输入任务描述
2. 调用 `/api/agent/chat` (SSE)
3. 接收事件流:
   - `thinking` - 思考中
   - `tool_start` - 开始执行工具
   - `tool_output` - 工具输出
   - `tool_complete` - 工具完成
   - `confirm_required` - 需要确认
   - `text` - 最终回复

**事件处理**:
```typescript
const handleAgentEvent = (event: SSEAgentEvent) => {
  switch (event.type) {
    case 'thinking':
      // 显示思考状态，迭代次数
      break;
    case 'tool_start':
      // 创建工具调用卡片，状态executing
      break;
    case 'tool_output':
      // 追加输出内容
      break;
    case 'tool_complete':
      // 更新状态completed/failed
      break;
    case 'confirm_required':
      // 设置pendingConfirm，显示确认对话框
      break;
    case 'text':
      // 显示最终回复(如果是isFinal)
      break;
  }
};
```

#### 3.2.6 ExtendedSysInfoPanel.tsx - 扩展系统信息

**职责**: 实时显示服务器系统信息

**数据来源**:
1. HTTP轮询: `GET /api/sysinfo/:connId/extended`
2. WebSocket实时: `ws://host/ws/sysinfo/:connId`

**显示内容**:
```typescript
interface ExtendedSysInfo {
  hostname: string;
  os: string;
  uptime: string;
  cpu_percent: number;
  memory: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number };
  network: { rx: number; tx: number };
  load_average?: [number, number, number];  // 1/5/15分钟负载
  network_interfaces?: NetworkInterface[];  // 网络接口列表
  disk_partitions?: DiskPartition[];        // 磁盘分区
  processes?: ProcessInfo[];                // 进程列表(按内存/CPU排序)
}
```

**刷新机制**:
- 默认5秒刷新
- 可配置: 1s/3s/5s/10s/30s
- WebSocket模式实时推送

---

## 4. 后端架构

### 4.1 目录结构

```
server/
├── main.go                       # 入口，路由注册
├── go.mod                        # Go模块依赖
├── config/
│   └── config.go                 # 配置加载
├── database/
│   └── db.go                     # SQLite初始化
├── handlers/                     # HTTP处理器
│   ├── auth.go                   # 认证(login/register)
│   ├── connection.go             # 连接CRUD
│   ├── terminal.go               # WebSocket终端
│   ├── file.go                   # SFTP文件操作
│   ├── sysinfo.go                # 系统信息
│   ├── ai.go                     # AI对话
│   ├── agent.go                  # Agent执行
│   └── sync.go                   # 数据同步
├── services/                     # 业务逻辑
│   ├── ssh_service.go            # SSH连接管理
│   ├── sftp_service.go           # SFTP操作
│   ├── ai_service.go             # AI接口调用
│   ├── agent_service.go          # Agent引擎
│   └── agent_config.go           # Agent配置
├── models/                       # 数据模型
│   ├── user.go                   # 用户
│   ├── connection.go             # 连接
│   ├── ai_config.go              # AI配置
│   └── agent.go                  # Agent相关
├── tools/                        # Agent工具系统
│   ├── types.go                  # 类型定义
│   ├── registry.go               # 工具注册
│   ├── builtin_tools.go          # 内置工具
│   ├── ssh_tools.go              # SSH工具
│   └── safety.go                 # 安全检查
└── crypto_util/
    └── crypto.go                 # AES加密工具
```

### 4.2 路由注册 (main.go)

```go
func main() {
    // 公开路由
    r.GET("/api/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })

    // 认证路由(无需认证)
    api.POST("/auth/login", handlers.Login)
    api.POST("/auth/register", handlers.Register)

    // 核心路由(可选认证 - 本地/远程都可用)
    core := api.Group("", middleware.OptionalAuthMiddleware())
    {
        // 连接管理
        core.GET("/connections", handlers.GetConnections)
        core.POST("/connections", handlers.CreateConnection)
        core.PUT("/connections/:id", handlers.UpdateConnection)
        core.DELETE("/connections/:id", handlers.DeleteConnection)

        // 文件操作
        core.GET("/files/:id/list", handlers.ListFiles)
        core.GET("/files/:id/download", handlers.DownloadFile)
        core.POST("/files/:id/upload", handlers.UploadFile)
        core.POST("/files/:id/mkdir", handlers.MakeDir)
        core.POST("/files/:id/delete", handlers.DeleteFile)
        core.POST("/files/:id/rename", handlers.RenameFile)

        // 系统信息
        core.GET("/sysinfo/:id", handlers.GetSysInfo)
        core.GET("/sysinfo/:id/extended", handlers.GetExtendedSysInfo)
        core.GET("/connections/:id/config", handlers.GetServerConfig)

        // AI对话
        core.POST("/ai/chat-proxy", handlers.ChatProxy)
        core.POST("/ai/chat", handlers.Chat)
        core.GET("/ai/config", handlers.GetAIConfig)
        core.PUT("/ai/config", handlers.UpdateAIConfig)

        // Agent
        core.POST("/agent/chat", handlers.AgentChat)
        core.POST("/agent/confirm", handlers.AgentConfirm)
        core.POST("/agent/cancel", handlers.AgentCancel)
        core.GET("/agent/config", handlers.GetAgentConfig)
        core.PUT("/agent/config", handlers.UpdateAgentConfig)
        core.GET("/agent/sessions", handlers.GetAgentSessions)
        core.GET("/agent/sessions/:id", handlers.GetAgentSession)
        core.GET("/agent/sessions/:id/messages", handlers.GetAgentMessages)
        core.DELETE("/agent/sessions/:id", handlers.DeleteAgentSession)

        // MCP服务器
        core.GET("/agent/mcp/servers", handlers.GetMCPServers)
        core.POST("/agent/mcp/servers", handlers.CreateMCPServer)
        core.DELETE("/agent/mcp/servers/:id", handlers.DeleteMCPServer)

        // Skills
        core.GET("/agent/skills", handlers.GetSkills)
        core.POST("/agent/skills/install", handlers.InstallSkill)
        core.DELETE("/agent/skills/:name", handlers.DeleteSkill)
    }

    // 同步路由(强制认证)
    sync := api.Group("/sync", middleware.AuthMiddleware())
    {
        sync.POST("/pull", handlers.PullSync)
        sync.POST("/push", handlers.PushSync)
    }

    // WebSocket路由
    r.GET("/ws/terminal/:id", handlers.TerminalWS)
    r.GET("/ws/agent-terminal/:sessionId", handlers.AgentTerminalWS)
    r.GET("/ws/sysinfo/:id", handlers.SysInfoWS)
}
```

### 4.3 配置管理 (config/config.go)

```go
type Config struct {
    Port          int    // 服务器端口，默认29800
    DBPath        string // 数据库路径 ~/.newshell/data.db
    JWTSecret     string // JWT密钥
    EncryptionKey string // AES加密密钥(32字节)
}

// 配置来源
// 1. 环境变量: NEWSHELL_PORT, NEWSHELL_DATA_DIR, NEWSHELL_JWT_SECRET, NEWSHELL_ENCRYPTION_KEY
// 2. 默认值: 端口29800, 数据目录~/.newshell
// 3. 自动生成: JWT密钥和加密密钥(首次运行时生成并保存)
```

### 4.4 Handler详细说明

#### 4.4.1 handlers/auth.go - 认证处理

**POST /api/auth/login**
```go
// 请求
type LoginRequest struct {
    Username string `json:"username" binding:"required"`
    Password string `json:"password" binding:"required"`
}

// 响应
type LoginResponse struct {
    Token string `json:"token"`
    User  User   `json:"user"`
}

// 逻辑
1. 查询用户是否存在
2. 验证密码(bcrypt)
3. 生成JWT token(24小时过期)
4. 返回token和用户信息
```

**POST /api/auth/register**
```go
// 请求
type RegisterRequest struct {
    Username string `json:"username" binding:"required,min=3,max=32"`
    Password string `json:"password" binding:"required,min=6"`
}

// 逻辑
1. 检查用户名是否已存在
2. 密码bcrypt加密
3. 生成UUID作为用户ID
4. 插入users表
5. 返回token和用户信息
```

#### 4.4.2 handlers/connection.go - 连接管理

**GET /api/connections**
```go
// 逻辑
1. 从context获取userID(可选，本地模式为空)
2. 查询该用户的所有连接
3. 返回连接列表(密码字段已脱敏)

// 响应
[]Connection{
    ID, Name, Host, Port, Username, AuthType,
    GroupName, Remark, Color, CreatedAt, UpdatedAt
    // Password, PrivateKey, Passphrase 不返回
}
```

**POST /api/connections**
```go
// 请求
type CreateConnectionRequest struct {
    Name       string `json:"name" binding:"required"`
    Host       string `json:"host" binding:"required"`
    Port       int    `json:"port" binding:"required,min=1,max=65535"`
    Username   string `json:"username" binding:"required"`
    AuthType   string `json:"auth_type" binding:"required,oneof=password key agent"`
    Password   string `json:"password,omitempty"`
    PrivateKey string `json:"private_key,omitempty"`
    Passphrase string `json:"passphrase,omitempty"`
    GroupName  string `json:"group_name"`
    Remark     string `json:"remark"`
    Color      string `json:"color"`
}

// 逻辑
1. 生成UUID作为连接ID
2. 加密敏感字段(Password, PrivateKey, Passphrase)使用AES-256-GCM
3. 插入connections表
4. 返回创建的连接信息
```

#### 4.4.3 handlers/terminal.go - 终端WebSocket

**WebSocket /ws/terminal/:id**
```go
// 连接流程
1. 升级HTTP为WebSocket
2. 等待客户端发送connect消息
3. 从数据库获取连接信息
4. 建立SSH连接
5. 创建PTY终端
6. 双向转发数据

// 消息类型
// 客户端 -> 服务端
{ type: "connect", host, port, username, auth_type, password?, private_key?, passphrase? }
{ type: "input", data: string }
{ type: "resize", cols: number, rows: number }

// 服务端 -> 客户端
{ type: "connected" }
{ type: "output", data: string }
{ type: "error", message: string }

// 核心代码
func TerminalWS(c *gin.Context) {
    connID := c.Param("id")
    ws, _ := upgrader.Upgrade(c.Writer, c.Request, nil)
    defer ws.Close()

    // 等待连接消息
    var connectMsg WSConnectMessage
    ws.ReadJSON(&connectMsg)

    // 建立SSH连接
    sshClient, _ := ssh_service.ConnectWithDetails(connID, connectMsg)
    session, _ := sshClient.NewSession()

    // 请求PTY
    session.RequestPty("xterm-256color", 80, 40, ssh.TerminalModes{})

    // 设置IO管道
    stdin, _ := session.StdinPipe()
    stdout, _ := session.StdoutPipe()

    // 启动shell
    session.Shell()

    // WebSocket -> SSH
    go func() {
        for {
            var msg WSMessage
            ws.ReadJSON(&msg)
            switch msg.Type {
            case "input":
                stdin.Write([]byte(msg.Data))
            case "resize":
                session.WindowChange(msg.Rows, msg.Cols)
            }
        }
    }()

    // SSH -> WebSocket
    go func() {
        buf := make([]byte, 1024)
        for {
            n, _ := stdout.Read(buf)
            ws.WriteJSON(WSMessage{Type: "output", Data: string(buf[:n])})
        }
    }()

    // 等待会话结束
    session.Wait()
}
```

#### 4.4.4 handlers/file.go - 文件操作

**GET /api/files/:id/list**
```go
// 请求参数
path: string (查询参数，默认"/")

// 逻辑
1. 获取连接信息
2. 建立SFTP连接(复用或新建)
3. 列出目录内容
4. 返回文件列表

// 响应
[]FileInfo{
    Name: string,
    Path: string,
    Size: int64,
    Mode: string,      // "drwxr-xr-x"
    ModTime: time.Time,
    IsDir: bool
}
```

**GET /api/files/:id/download**
```go
// 请求参数
path: string (查询参数，文件路径)

// 逻辑
1. 获取连接信息
2. 建立SFTP连接
3. 打开文件
4. 设置响应头(Content-Disposition)
5. 流式传输文件内容

// 响应头
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="filename.txt"
```

**POST /api/files/:id/upload**
```go
// 请求
Content-Type: multipart/form-data
path: string (目标目录)
file: File (上传的文件)

// 逻辑
1. 解析multipart表单
2. 获取目标路径
3. 建立SFTP连接
4. 创建/覆盖目标文件
5. 写入上传内容
6. 返回上传结果
```

#### 4.4.5 handlers/sysinfo.go - 系统信息

**GET /api/sysinfo/:id**
```go
// 逻辑
1. 获取连接信息
2. SSH执行采集命令
3. 解析输出
4. 返回系统信息

// 采集命令
hostname: hostname
os: cat /etc/os-release | grep PRETTY_NAME
uptime: uptime -p
cpu: top -bn1 | grep "Cpu(s)"
memory: free -m | grep Mem
disk: df -h /
network: cat /proc/net/dev

// 响应
type SysInfo struct {
    Hostname string  `json:"hostname"`
    OS       string  `json:"os"`
    Uptime   string  `json:"uptime"`
    CPU      string  `json:"cpu"`      // "80.5%"
    MemUsed  string  `json:"mem_used"` // "4096MB"
    MemTotal string  `json:"mem_total"`
    DiskUsed string  `json:"disk_used"`
    DiskTotal string `json:"disk_total"`
    NetRx    string  `json:"net_rx"`   // "1.2MB/s"
    NetTx    string  `json:"net_tx"`
}
```

**GET /api/sysinfo/:id/extended**
```go
// 扩展信息包含
- 基本系统信息
- 负载平均值 (uptime | awk -F'load average:' '{print $2}')
- 网络接口列表 (ip addr show)
- 磁盘分区列表 (df -h)
- 进程列表 (ps aux --sort=-%mem | head -20)
```

**WebSocket /ws/sysinfo/:id**
```go
// 实时推送
1. 建立WebSocket连接
2. 定时采集系统信息(默认5秒)
3. 推送到客户端
4. 支持interval参数配置

// 推送消息
{ type: "sysinfo", data: ExtendedSysInfo }
```

#### 4.4.6 handlers/ai.go - AI对话

**POST /api/ai/chat-proxy**
```go
// 请求
type ChatProxyRequest struct {
    APIBase      string        `json:"api_base"`
    APIKey       string        `json:"api_key"`
    Model        string        `json:"model"`
    SystemPrompt string        `json:"system_prompt"`
    Messages     []ChatMessage `json:"messages"`
}

// 响应 (SSE流式)
data: {"type":"text_chunk","content":"Hello"}
data: {"type":"text_chunk","content":" world"}
data: {"type":"text","content":"Hello world","isFinal":true}
data: [DONE]

// 逻辑
1. 构建OpenAI API请求
2. 设置SSE响应头
3. 流式转发API响应
4. 发送结束标记
```

**POST /api/ai/chat**
```go
// 逻辑
1. 从数据库获取AI配置(api_base, api_key, model)
2. 调用chat-proxy逻辑
```

#### 4.4.7 handlers/agent.go - Agent执行

**POST /api/agent/chat**
```go
// 请求
type AgentChatRequest struct {
    SessionID   string               `json:"session_id,omitempty"`
    ConnID      string               `json:"conn_id"`
    Messages    []AgentChatMessage   `json:"messages"`
    ModelConfig *ModelConfig         `json:"model_config,omitempty"`
}

// 响应 (SSE流式)
data: {"type":"thinking","iteration":1}
data: {"type":"tool_start","toolCallId":"xxx","toolName":"execute_command","parameters":{"command":"ls -la"}}
data: {"type":"tool_output","toolCallId":"xxx","output":"total 48..."}
data: {"type":"tool_complete","toolCallId":"xxx","status":"completed","exitCode":0}
data: {"type":"text","content":"已列出当前目录内容","isFinal":true}
data: [DONE]

// 逻辑
1. 创建或恢复Agent会话
2. 调用Agent引擎执行
3. 流式返回执行过程
```

**POST /api/agent/confirm**
```go
// 请求
type AgentConfirmRequest struct {
    SessionID  string `json:"session_id"`
    ToolCallID string `json:"tool_call_id"`
    Confirmed  bool   `json:"confirmed"`
    Command    string `json:"command,omitempty"` // 用户修改后的命令
}

// 逻辑
1. 查找待确认的工具调用
2. 如果confirmed=true，使用修改后的命令执行
3. 如果confirmed=false，标记为rejected
4. 继续Agent执行流程
```

---

## 5. 数据库设计

### 5.1 表结构

#### users - 用户表
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,                    -- UUID
    username TEXT UNIQUE NOT NULL,          -- 用户名
    password_hash TEXT NOT NULL,            -- bcrypt哈希
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### connections - 连接表
```sql
CREATE TABLE connections (
    id TEXT PRIMARY KEY,                    -- UUID
    user_id TEXT,                           -- 用户ID(本地模式为NULL)
    name TEXT NOT NULL,                     -- 显示名称
    host TEXT NOT NULL,                     -- 主机地址
    port INTEGER DEFAULT 22,               -- SSH端口
    username TEXT NOT NULL,                 -- SSH用户名
    auth_type TEXT NOT NULL DEFAULT 'password', -- password|key|agent
    password_enc TEXT,                      -- AES加密的密码
    private_key TEXT,                       -- AES加密的私钥
    passphrase TEXT,                        -- AES加密的私钥口令
    group_name TEXT DEFAULT '默认分组',      -- 分组名称
    remark TEXT,                            -- 备注
    color TEXT DEFAULT '#3b82f6',           -- 标签颜色
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 0,        -- 同步版本号
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_connections_user_id ON connections(user_id);
CREATE INDEX idx_connections_group ON connections(group_name);
```

#### sync_meta - 同步元数据
```sql
CREATE TABLE sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

#### ai_config - AI配置表
```sql
CREATE TABLE ai_config (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    api_base TEXT DEFAULT 'https://api.openai.com/v1',
    api_key TEXT,                           -- AES加密
    model TEXT DEFAULT 'gpt-4o',
    system_prompt TEXT,
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,
    top_p REAL DEFAULT 1.0,
    frequency_penalty REAL DEFAULT 0,
    presence_penalty REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### agent_config - Agent配置表
```sql
CREATE TABLE agent_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    max_iterations INTEGER DEFAULT 10,          -- 最大迭代次数
    default_timeout INTEGER DEFAULT 60,         -- 默认超时(秒)
    smart_timeout BOOLEAN DEFAULT 1,            -- 智能超时
    confirm_mode TEXT DEFAULT 'dangerous',      -- all|dangerous|none
    dangerous_commands TEXT DEFAULT '["rm -rf","shutdown","reboot","mkfs","dd"]',
    dangerous_commands_custom TEXT DEFAULT '[]', -- 用户自定义
    history_mode TEXT DEFAULT 'persistent',     -- persistent|session
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### agent_sessions - Agent会话表
```sql
CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY,
    conn_id TEXT,                           -- 目标服务器
    title TEXT,                             -- 会话标题
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conn_id) REFERENCES connections(id) ON DELETE SET NULL
);
```

#### agent_messages - Agent消息表
```sql
CREATE TABLE agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,                      -- user|assistant|tool|system
    content TEXT,
    tool_calls TEXT,                        -- JSON格式的工具调用信息
    tool_call_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_messages_session ON agent_messages(session_id);
```

#### mcp_servers - MCP服务器表
```sql
CREATE TABLE mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL,                -- stdio|http
    command TEXT,                           -- stdio: 启动命令
    args TEXT,                              -- stdio: 参数(JSON数组)
    url TEXT,                               -- http: 服务URL
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### skills - 技能表
```sql
CREATE TABLE skills (
    name TEXT PRIMARY KEY,
    description TEXT,
    version TEXT,
    source TEXT DEFAULT 'local',            -- local|clawhub
    path TEXT,
    enabled BOOLEAN DEFAULT 1,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      数据流向图                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  前端 Zustand Store ──────────────────────> localStorage    │
│        │                                                    │
│        │ HTTP/WebSocket                                     │
│        ▼                                                    │
│  后端 Handler ──> Service ──> Model ──> SQLite              │
│        │                                                    │
│        │ SSH/SFTP                                           │
│        ▼                                                    │
│  远程服务器                                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 状态管理

### 6.1 Store结构总览

| Store | 用途 | 持久化 | 键名 |
|-------|------|--------|------|
| connectionStore | SSH连接管理 | ✅ | `newshell_connections` |
| terminalStore | 终端标签状态 | ❌ | 内存 |
| activityStore | 活动栏状态 | ❌ | 内存 |
| aiConfigStore | AI模型配置 | ✅ | `newshell_ai_config_v2` |
| agentStore | Agent状态 | ✅ | 部分持久化 |
| fileTransferStore | 文件传输 | ❌ | 内存 |
| groupStore | 连接分组 | ✅ | `newshell_groups` |
| syncStore | 同步状态 | ✅ | 多个键 |
| themeStore | 主题设置 | ✅ | `newshell_theme` |

### 6.2 connectionStore

```typescript
interface ConnectionState {
  connections: Connection[];
  loading: boolean;
  
  // Actions
  loadConnections: () => void;
  addConnection: (conn: Omit<Connection, 'id' | 'created_at' | 'updated_at'>) => void;
  updateConnection: (id: string, conn: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  getGroups: () => string[];
  syncToServer: (id: string) => Promise<void>;
  syncFromServer: (id: string) => Promise<void>;
  syncAllToServer: () => Promise<void>;
  syncAllFromServer: () => Promise<void>;
}

// Connection类型
interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key' | 'agent';
  password?: string;
  private_key?: string;
  passphrase?: string;
  group_name: string;
  remark: string;
  color: string;
  synced: boolean;
  created_at: string;
  updated_at: string;
}
```

### 6.3 terminalStore

```typescript
interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  
  // Actions
  addTab: (connId: string, name: string) => void;
  addServerListTab: () => void;
  addAgentTab: (sessionId: string, connId: string, command: string) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  initDefaultTabs: () => void;
}

// Tab类型
interface TerminalTab {
  id: string;
  type: 'ssh' | 'server-list' | 'agent-exec';
  connId?: string;
  name: string;
  agentSessionId?: string;
}
```

### 6.4 agentStore

```typescript
interface AgentState {
  mode: 'chat' | 'agent';              // 对话模式
  config: AgentConfig;                  // Agent配置
  currentSessionId: string | null;      // 当前会话ID
  currentConnId: string;               // 目标服务器
  selectedModelId: string;             // 选中的AI模型
  messages: AgentMessage[];            // 消息列表
  isRunning: boolean;                  // 是否正在执行
  pendingConfirm: PendingConfirm | null; // 待确认项
  
  // Actions
  setMode: (mode: 'chat' | 'agent') => void;
  setCurrentConnId: (id: string) => void;
  setSelectedModelId: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  confirmToolCall: (toolCallId: string, confirmed: boolean, command?: string) => Promise<void>;
  cancelExecution: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  clearMessages: () => void;
}

// Agent消息类型
interface AgentMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCallStep[];
  isThinking?: boolean;
  isStreaming?: boolean;
  isFinal?: boolean;
  iteration?: number;
}

// 工具调用步骤
interface ToolCallStep {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  status: 'pending' | 'confirming' | 'executing' | 'completed' | 'failed' | 'rejected';
  output?: string;
  exitCode?: number;
  startTime: number;
  endTime?: number;
  isDangerous: boolean;
  reason?: string;
}
```

### 6.5 aiConfigStore

```typescript
interface AIConfigState {
  models: ModelConfig[];
  defaultModelId: string;
  systemPrompt: string;
  
  // Actions
  loadConfig: () => void;
  addModel: (model: Omit<ModelConfig, 'id' | 'createdAt'>) => void;
  updateModel: (id: string, partial: Partial<ModelConfig>) => void;
  deleteModel: (id: string) => void;
  setDefaultModel: (id: string) => void;
  getDefaultModel: () => ModelConfig | undefined;
  updateSystemPrompt: (prompt: string) => void;
}

// 模型配置
interface ModelConfig {
  id: string;
  provider: string;           // custom, openai, deepseek, alibaba, etc.
  baseUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;        // 0-2
  maxTokens: number;
  topP: number;               // 0-1
  frequencyPenalty: number;   // -2~2
  presencePenalty: number;    // -2~2
  isDefault: boolean;
  createdAt: string;
}

// 支持的服务商预设
const providerPresets = {
  custom: { name: '自定义', baseUrl: '' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  alibaba: { name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  // ... 更多预设
};
```

---

## 7. 业务逻辑详解

### 7.1 SSH连接流程

```
┌─────────────────────────────────────────────────────────────┐
│                    SSH连接建立流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 用户点击连接                                             │
│     │                                                       │
│     ▼                                                       │
│  2. 终端Store创建新Tab                                       │
│     │                                                       │
│     ▼                                                       │
│  3. TerminalPanel组件挂载                                    │
│     │                                                       │
│     ▼                                                       │
│  4. 建立WebSocket连接 ws://host/ws/terminal/:connId         │
│     │                                                       │
│     ▼                                                       │
│  5. 发送connect消息(包含SSH凭证)                              │
│     │                                                       │
│     ▼                                                       │
│  6. 后端接收消息，查询数据库获取连接信息                        │
│     │                                                       │
│     ▼                                                       │
│  7. 解密敏感字段(密码/私钥)                                   │
│     │                                                       │
│     ▼                                                       │
│  8. 建立SSH连接                                              │
│     │                                                       │
│     ├─ 成功 ──> 创建PTY ──> 返回connected消息                │
│     │                                                       │
│     └─ 失败 ──> 返回error消息 ──> 前端显示错误                │
│                                                             │
│  9. 双向数据转发                                             │
│     - 用户输入 ──> WebSocket ──> SSH stdin                   │
│     - SSH stdout ──> WebSocket ──> xterm显示                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 文件上传流程

```
┌─────────────────────────────────────────────────────────────┐
│                    文件上传流程                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 用户拖拽文件到文件树面板                                   │
│     │                                                       │
│     ▼                                                       │
│  2. 触发onDrop事件                                          │
│     │                                                       │
│     ▼                                                       │
│  3. fileTransferStore.uploadFile()                          │
│     │                                                       │
│     ├─ 创建TransferTask                                     │
│     │   - status: 'pending'                                 │
│     │   - totalSize: file.size                              │
│     │                                                       │
│     ▼                                                       │
│  4. 发送HTTP请求                                            │
│     POST /api/files/:connId/upload                          │
│     Content-Type: multipart/form-data                       │
│     - path: 目标目录                                         │
│     - file: 文件内容                                         │
│     │                                                       │
│     ▼                                                       │
│  5. 后端接收文件                                             │
│     │                                                       │
│     ├─ 建立SFTP连接                                         │
│     ├─ 创建目标文件                                          │
│     ├─ 写入内容                                              │
│     │                                                       │
│     ▼                                                       │
│  6. 返回上传结果                                             │
│     │                                                       │
│     ▼                                                       │
│  7. 前端更新TransferTask状态                                 │
│     - status: 'completed' 或 'error'                        │
│     │                                                       │
│     ▼                                                       │
│  8. 刷新文件列表                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 AI对话流程

```
┌─────────────────────────────────────────────────────────────┐
│                    AI对话流程(传统模式)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 用户输入问题                                             │
│     │                                                       │
│     ▼                                                       │
│  2. 构建消息数组                                             │
│     - system: systemPrompt                                  │
│     - messages: 历史对话(最近20轮)                            │
│     - user: 当前输入                                         │
│     │                                                       │
│     ▼                                                       │
│  3. 调用API POST /api/ai/chat-proxy                         │
│     {                                                       │
│       api_base: modelConfig.baseUrl,                        │
│       api_key: modelConfig.apiKey,                          │
│       model: modelConfig.modelName,                         │
│       messages: messages                                    │
│     }                                                       │
│     │                                                       │
│     ▼                                                       │
│  4. SSE流式响应                                              │
│     data: {"type":"text_chunk","content":"Hello"}           │
│     data: {"type":"text_chunk","content":" world"}          │
│     data: {"type":"text","content":"Hello world","isFinal":true}
│     data: [DONE]                                            │
│     │                                                       │
│     ▼                                                       │
│  5. 前端实时显示                                             │
│     - 拼接text_chunk内容                                    │
│     - isFinal时标记完成                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 Agent执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent执行流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 用户描述任务                                             │
│     "查看服务器磁盘使用情况，找出占用最多的目录"                │
│     │                                                       │
│     ▼                                                       │
│  2. 调用API POST /api/agent/chat                            │
│     {                                                       │
│       conn_id: "server-1",                                  │
│       messages: [{role:"user", content:"..."}]              │
│     }                                                       │
│     │                                                       │
│     ▼                                                       │
│  3. 后端Agent引擎执行                                        │
│     │                                                       │
│     ├─ 构建System Prompt                                    │
│     │   - 服务器上下文                                       │
│     │   - 可用工具列表                                       │
│     │   - 执行规则                                          │
│     │                                                       │
│     ├─ ReAct循环 (最多10次迭代)                              │
│     │   │                                                   │
│     │   ├─ 1. 调用LLM                                      │
│     │   │   event: {type:"thinking", iteration:1}           │
│     │   │                                                   │
│     │   ├─ 2. LLM返回工具调用                                │
│     │   │   - execute_command: "df -h"                      │
│     │   │   event: {type:"tool_start", ...}                 │
│     │   │                                                   │
│     │   ├─ 3. 安全检查                                      │
│     │   │   ├─ 危险命令 ──> event: {type:"confirm_required"}│
│     │   │   └─ 安全命令 ──> 继续执行                         │
│     │   │                                                   │
│     │   ├─ 4. 执行工具                                      │
│     │   │   - SSH执行命令                                   │
│     │   │   event: {type:"tool_output", output:"..."}       │
│     │   │   event: {type:"tool_complete", status:"completed"}
│     │   │                                                   │
│     │   ├─ 5. 将结果加入消息历史                              │
│     │   │   messages.append({role:"tool", content:"..."})   │
│     │   │                                                   │
│     │   └─ 6. 继续循环或返回最终答案                          │
│     │                                                       │
│     └─ 3. 返回最终回复                                       │
│        event: {type:"text", content:"分析结果...", isFinal:true}
│        event: {type:"done"}                                 │
│                                                             │
│  4. 前端实时更新                                             │
│     - 显示思考状态                                           │
│     - 显示工具调用卡片                                       │
│     - 显示工具输出                                           │
│     - 显示最终回复                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.5 数据同步流程

```
┌─────────────────────────────────────────────────────────────┐
│                    数据同步流程                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  前提条件: 用户已登录远程同步服务器                            │
│                                                             │
│  推送流程 (本地 -> 远程)                                     │
│  ─────────────────────────────                              │
│  1. 获取本地所有连接                                         │
│  2. 调用 POST /api/sync/push                                │
│     { connections: [...] }                                  │
│  3. 后端: 遍历连接，更新或插入数据库                          │
│  4. 更新sync_version                                        │
│  5. 返回同步结果                                             │
│                                                             │
│  拉取流程 (远程 -> 本地)                                     │
│  ─────────────────────────────                              │
│  1. 调用 GET /api/connections (带JWT)                        │
│  2. 获取远程连接列表                                         │
│  3. 与本地连接对比                                           │
│     - 按 host + username + port 匹配                         │
│  4. 合并策略                                                 │
│     - 本地存在，远程也存在 -> 弹窗询问用户选择                 │
│     - 本地存在，远程不存在 -> 保留本地                         │
│     - 本地不存在，远程存在 -> 添加到本地                       │
│  5. 更新localStorage                                        │
│                                                             │
│  冲突处理                                                   │
│  ─────────────────────────────                              │
│  当检测到冲突时:                                             │
│  1. 显示冲突对比弹窗                                         │
│  2. 用户选择: "以本地为准" 或 "以服务器为准"                   │
│  3. 执行相应同步操作                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Agent系统

### 8.1 工具系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      工具系统架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   ToolRegistry                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │  │ Builtin │  │   SSH   │  │   MCP   │             │   │
│  │  │  Tools  │  │  Tools  │  │  Tools  │             │   │
│  │  └─────────┘  └─────────┘  └─────────┘             │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 SafetyChecker                        │   │
│  │  - 预置危险模式                                       │   │
│  │  - 用户自定义规则                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               SSH Executor                           │   │
│  │  - 非PTY命令执行                                     │   │
│  │  - 流式输出                                          │   │
│  │  - 智能超时                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 内置工具列表

| 工具名 | 描述 | 参数 |
|--------|------|------|
| execute_command | 执行SSH命令 | command, working_dir?, timeout? |
| read_file | 读取文件内容 | path |
| write_file | 写入文件 | path, content |
| list_directory | 列出目录 | path |
| create_directory | 创建目录 | path |
| delete_file | 删除文件/目录 | path |
| get_system_info | 获取系统信息 | - |
| search_files | 搜索文件 | pattern, path? |

### 8.3 安全检查机制

```go
// 危险命令模式
var predefinedPatterns = []DangerousPattern{
    // Critical级别
    {regexp.MustCompile(`rm\s+(-[a-z]*r[a-z]*|--recursive)\s*/`), "递归删除根目录", "critical"},
    {regexp.MustCompile(`mkfs[\.\s]`), "格式化磁盘分区", "critical"},
    {regexp.MustCompile(`dd\s+.*of=/dev/`), "直接写入磁盘设备", "critical"},
    {regexp.MustCompile(`:\(\)\{.*\|.*&\};:`), "Fork炸弹", "critical"},
    
    // Warning级别
    {regexp.MustCompile(`shutdown|reboot|halt`), "关机/重启系统", "warning"},
    {regexp.MustCompile(`chmod\s+(-R\s+)?777`), "设置过于宽松的权限", "warning"},
    {regexp.MustCompile(`curl.*\|\s*(ba)?sh`), "远程脚本直接执行", "warning"},
}
```

### 8.4 智能超时策略

```go
func getSmartTimeout(command string) time.Duration {
    timeouts := map[string]time.Duration{
        // 查询类 - 短超时
        "ls": 10*time.Second, "cat": 10*time.Second, "grep": 15*time.Second,
        
        // 安装/编译类 - 长超时
        "apt": 300*time.Second, "npm": 180*time.Second, "docker": 300*time.Second,
        
        // 默认
        "default": 60*time.Second,
    }
    // 根据命令第一个词查找超时
}
```

---

### 8.7 Skills 系统（技能系统）

**Skills 是预定义的工作流模板**，用于扩展 Agent 的能力。

#### SKILL.md 文件格式

Skills 使用 SKILL.md 文件格式定义：

```markdown
---
name: 技能名称
description: 技能描述
version: 1.0.0
author: 作者名
tags: [标签 1, 标签 2]
requires:
  bins: [依赖的命令，如 "docker", "kubectl"]
os: [linux, macos]  # 支持的操作系统
install:
  - type: shell
    command: 安装命令
---

# 技能内容

## 工作流定义
## 命令模板
## 使用说明
## 示例
```

#### Skill 管理方式（手动导入）

**当前采用手动导入方式管理 Skills**，不支持在线市场：

| 功能 | API 端点 | 说明 |
|------|----------|------|
| 从 ZIP 导入 | `POST /api/agent/skills/import` | 上传 ZIP 文件导入 Skill |
| 获取已安装 | `GET /api/agent/skills/installed` | 获取所有已安装的 Skills |
| 启用/禁用 | `PUT /api/agent/skills/{name}/toggle` | 切换 Skill 启用状态 |
| 卸载 | `DELETE /api/agent/skills/{name}` | 删除 Skill |
| 更新 | `PUT /api/agent/skills/{name}/update` | 重新导入以更新 |

#### 导入流程

```
1. 用户选择 ZIP 文件或文件夹
2. 前端调用 POST /api/agent/skills/import
   - Content-Type: multipart/form-data
   - 参数：file (ZIP 文件)
3. 后端处理：
   - 保存到临时文件
   - 解压到 ~/.newshell/skills/{skill-name}/
   - 解析 SKILL.md 获取元数据
   - 保存到 skills 数据库表
4. 返回导入结果
```

#### 安装目录

Skills 安装在用户目录：`~/.newshell/skills/`

每个 Skill 占据一个子目录：
```
~/.newshell/skills/
├── skill-name-1/
│   └── SKILL.md
└── skill-name-2/
    ├── SKILL.md
    └── other-files...
```

#### Skill 解析器

**skill_parser.go** 负责解析 SKILL.md:

```go
type SkillMetadata struct {
    Name        string         // 技能名称
    Description string         // 技能描述
    Version     string         // 版本号
    Author      string         // 作者
    Tags        []string       // 标签
    Requires    SkillRequires  // 依赖要求
    OS          []string       // 支持的操作系统
    Install     []SkillInstall // 安装指令
}

type SkillRequires struct {
    Bins []string // 依赖的命令
}

type SkillInstall struct {
    Type    string // 安装类型：shell
    Command string // 安装命令
}
```

#### 前端 Skill 管理

**SkillStore** (src/stores/skillStore.ts):
```typescript
interface SkillState {
  localSkills: LocalSkill[];  // 已安装的 Skills
  loading: boolean;
  loadLocalSkills: () => Promise<void>;
  toggleSkill: (name, enabled) => Promise<void>;
  uninstallSkill: (name) => Promise<void>;
}
```

**SkillService** (src/services/skillService.ts):
```typescript
// 获取已安装 Skills
getLocalSkills(): Promise<LocalSkill[]>

// 启用/禁用 Skill
toggleSkill(name: string, enabled: boolean)

// 卸载 Skill
uninstallSkill(name: string)

// 从 ZIP 导入 Skill
importSkill(file: File): Promise<{ status: string }>
```

#### 在 Agent 中的使用

Skills 会在 Agent 执行时被加载到 System Prompt 中：

```go
// agent_service.go
func (ae *AgentEngine) buildSystemPrompt(connID string) string {
    // ...
    // 加载启用的 Skills
    skills := getEnabledSkills()
    for _, skill := range skills {
        prompt += services.SkillToPrompt(skill)
    }
    // ...
}
```

---

## 9. 安全机制

### 9.1 加密方案

```
┌─────────────────────────────────────────────────────────────┐
│                      加密方案                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  敏感字段:                                                   │
│  - connections.password_enc                                 │
│  - connections.private_key                                  │
│  - connections.passphrase                                   │
│  - ai_config.api_key                                        │
│                                                             │
│  加密算法: AES-256-GCM                                      │
│  密钥来源: NEWSHELL_ENCRYPTION_KEY环境变量或自动生成          │
│  密钥长度: 32字节(256位)                                     │
│                                                             │
│  加密流程:                                                   │
│  1. 生成随机nonce(12字节)                                    │
│  2. 使用AES-256-GCM加密                                      │
│  3. 拼接: nonce + ciphertext + tag                          │
│  4. Base64编码存储                                           │
│                                                             │
│  解密流程:                                                   │
│  1. Base64解码                                               │
│  2. 分离: nonce(12) + tag(16) + ciphertext                  │
│  3. 使用AES-256-GCM解密                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 认证机制

```
┌─────────────────────────────────────────────────────────────┐
│                      认证机制                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  本地模式 (默认)                                             │
│  ─────────────────                                          │
│  - 无需登录                                                 │
│  - 数据存储在本地SQLite                                      │
│  - user_id = NULL                                           │
│                                                             │
│  远程同步模式                                                │
│  ─────────────────                                          │
│  1. 用户注册/登录                                            │
│  2. 获取JWT token                                           │
│  3. 请求头: Authorization: Bearer {token}                   │
│  4. Token有效期: 24小时                                      │
│                                                             │
│  中间件                                                     │
│  ─────────────────                                          │
│  - AuthMiddleware(): 强制认证(同步接口)                      │
│  - OptionalAuthMiddleware(): 可选认证(核心接口)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 CORS配置

```go
cors.New(cors.Config{
    AllowAllOrigins:  true,
    AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
    AllowCredentials: true,
})
```

---

## 10. 部署配置

### 10.1 开发环境

```bash
# 前置条件
- Node.js 18+
- Go 1.22+
- Rust (Tauri构建)

# 启动开发
# Windows
dev.bat

# 手动启动
npm run tauri dev
```

### 10.2 构建

```bash
# Windows
build.ps1

# 手动构建
npm run build
cd server && go build -o newshell-server.exe .
npm run tauri build
```

### 10.3 Docker部署

```yaml
# docker-compose.yml
services:
  newshell:
    build: ./server
    ports:
      - "29800:29800"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - newshell-data:/root/.newshell

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - newshell
```

### 10.4 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| NEWSHELL_PORT | 29800 | 后端端口 |
| NEWSHELL_DATA_DIR | ~/.newshell | 数据目录 |
| NEWSHELL_JWT_SECRET | 自动生成 | JWT密钥 |
| NEWSHELL_ENCRYPTION_KEY | 自动生成 | 加密密钥 |

---

## 11. 交互流程图

### 11.1 应用启动流程

```
┌─────────────────────────────────────────────────────────────┐
│                      应用启动流程                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Tauri启动                                                  │
│     │                                                       │
│     ▼                                                       │
│  检查端口29800是否被占用                                      │
│     │                                                       │
│     ├─ 已占用 ──> 跳过启动后端                               │
│     │                                                       │
│     └─ 未占用 ──> 查找newshell-server.exe                   │
│         │                                                   │
│         ├─ 找到 ──> 启动后端进程                             │
│         │                                                   │
│         └─ 未找到 ──> 提示用户                               │
│     │                                                       │
│     ▼                                                       │
│  React前端加载                                               │
│     │                                                       │
│     ▼                                                       │
│  App.tsx初始化                                               │
│     - loadTheme()                                           │
│     - loadConnections()                                     │
│     - loadAIConfig()                                        │
│     - loadGroups()                                          │
│     - initDefaultTabs()                                     │
│     │                                                       │
│     ▼                                                       │
│  渲染MainLayout                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 终端连接时序图

```
用户        前端           后端          SSH服务器
 │          │              │              │
 │ 点击连接  │              │              │
 │─────────>│              │              │
 │          │ 创建Tab       │              │
 │          │─────────>│              │
 │          │              │              │
 │          │ WebSocket连接 │              │
 │          │─────────────────────────────>│
 │          │              │              │
 │          │ connect消息   │              │
 │          │─────────────────────────────>│
 │          │              │              │
 │          │              │ 查询连接信息  │
 │          │              │──────>│      │
 │          │              │              │
 │          │              │ 建立SSH连接   │
 │          │              │──────────────>│
 │          │              │              │
 │          │              │ 创建PTY      │
 │          │              │──────────────>│
 │          │              │              │
 │          │ connected     │              │
 │          │<─────────────────────────────│
 │          │              │              │
 │ 输入命令  │              │              │
 │─────────>│              │              │
 │          │ input消息     │              │
 │          │─────────────────────────────>│
 │          │              │              │
 │          │              │ 执行命令      │
 │          │              │──────────────>│
 │          │              │              │
 │          │ output消息    │              │
 │          │<─────────────────────────────│
 │          │              │              │
 │ 显示输出  │              │              │
 │<─────────│              │              │
 │          │              │              │
```

---

## 12. 关键代码说明

### 12.1 Tauri进程管理 (src-tauri/src/lib.rs)

```rust
// 核心功能: 管理Go后端进程生命周期

// 1. 端口检测
fn is_port_in_use(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(300),
    ).is_ok()
}

// 2. 查找服务器二进制
fn find_server_binary(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // 开发模式: project_root/server/newshell-server.exe
    // 生产模式: exe同目录或resources/server/子目录
}

// 3. 启动服务器
fn start_server(app: &tauri::AppHandle) -> Option<Child> {
    if is_port_in_use(29800) { return None; }
    let path = find_server_binary(app)?;
    Command::new(&path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

// 4. 窗口关闭时终止进程
.on_window_event(|window, event| {
    if let WindowEvent::CloseRequested { .. } = event {
        let state = window.state::<ServerProcess>();
        if let Some(ref mut c) = child.take() {
            let _ = c.kill();
        }
    }
})
```

### 12.2 WebSocket终端处理 (server/handlers/terminal.go)

```go
func TerminalWS(c *gin.Context) {
    connID := c.Param("id")
    
    // 升级WebSocket
    ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
    if err != nil {
        return
    }
    defer ws.Close()

    // 等待连接消息
    var connectMsg struct {
        Type       string `json:"type"`
        Host       string `json:"host"`
        Port       int    `json:"port"`
        Username   string `json:"username"`
        AuthType   string `json:"auth_type"`
        Password   string `json:"password"`
        PrivateKey string `json:"private_key"`
        Passphrase string `json:"passphrase"`
    }
    
    if err := ws.ReadJSON(&connectMsg); err != nil {
        return
    }

    // 建立SSH连接
    var auth ssh.AuthMethod
    if connectMsg.AuthType == "password" {
        auth = ssh.Password(connectMsg.Password)
    } else {
        signer, _ := ssh.ParsePrivateKeyWithPassphrase(
            []byte(connectMsg.PrivateKey),
            []byte(connectMsg.Passphrase),
        )
        auth = ssh.PublicKeys(signer)
    }

    sshClient, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", connectMsg.Host, connectMsg.Port), &ssh.ClientConfig{
        User: connectMsg.Username,
        Auth: []ssh.AuthMethod{auth},
        HostKeyCallback: ssh.InsecureIgnoreHostKey(),
    })
    
    if err != nil {
        ws.WriteJSON(map[string]string{"type": "error", "message": err.Error()})
        return
    }
    defer sshClient.Close()

    // 创建会话
    session, _ := sshClient.NewSession()
    defer session.Close()

    // 请求PTY
    session.RequestPty("xterm-256color", 80, 40, ssh.TerminalModes{
        ssh.ECHO:          1,
        ssh.TTY_OP_ISPEED: 14400,
        ssh.TTY_OP_OSPEED: 14400,
    })

    // 设置IO
    stdin, _ := session.StdinPipe()
    stdout, _ := session.StdoutPipe()
    stderr, _ := session.StderrPipe()

    // 启动shell
    session.Shell()

    // 通知连接成功
    ws.WriteJSON(map[string]string{"type": "connected"})

    // WebSocket -> SSH
    go func() {
        for {
            var msg struct {
                Type string          `json:"type"`
                Data json.RawMessage `json:"data"`
            }
            if err := ws.ReadJSON(&msg); err != nil {
                return
            }
            switch msg.Type {
            case "input":
                var input string
                json.Unmarshal(msg.Data, &input)
                stdin.Write([]byte(input))
            case "resize":
                var size struct {
                    Cols int `json:"cols"`
                    Rows int `json:"rows"`
                }
                json.Unmarshal(msg.Data, &size)
                session.WindowChange(size.Rows, size.Cols)
            }
        }
    }()

    // SSH -> WebSocket
    go io.Copy(wsWriter{ws}, stdout)
    go io.Copy(wsWriter{ws}, stderr)

    // 等待结束
    session.Wait()
}
```

---

## 附录

### A. 常用命令参考

```bash
# 开发
npm run tauri dev          # 启动开发环境
npm run build              # 构建前端
go build -o newshell-server.exe .  # 构建后端

# 清理
clean.bat                  # 清理构建缓存
cargo clean                # 清理Rust构建

# 部署
docker-compose up -d       # Docker部署
./deploy.sh                # Linux部署脚本
```

### B. 错误码参考

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| SSH_AUTH_FAILED | SSH认证失败 | 检查用户名/密码/密钥 |
| SSH_CONNECTION_REFUSED | 连接被拒绝 | 检查主机和端口 |
| SFTP_PERMISSION_DENIED | 权限不足 | 检查文件权限 |
| AI_API_ERROR | AI API错误 | 检查API配置 |
| AGENT_TIMEOUT | Agent执行超时 | 调整超时设置 |

### C. 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 启动时间 | < 3s | 应用启动到可用 |
| 连接时间 | < 2s | SSH连接建立 |
| 终端延迟 | < 50ms | 输入到显示 |
| 文件列表 | < 1s | 1000文件目录 |
| AI首字 | < 3s | 首个token返回 |
| 内存占用 | < 200MB | 正常运行时 |

---

*文档结束*

---

## 更新日志

### 2026-04-02 - Skills 系统和 AI 助手更新

#### Skills 系统更新
- **管理方式变更**：从在线市场改为手动导入（ZIP 文件/文件夹）
- **新增 API 端点**：
  - POST /api/agent/skills/import - 从 ZIP 文件导入 Skill
  - GET /api/agent/skills/installed - 获取已安装的 Skills
  - PUT /api/agent/skills/{name}/toggle - 启用/禁用 Skill
  - DELETE /api/agent/skills/{name} - 卸载 Skill
  - PUT /api/agent/skills/{name}/update - 更新 Skill（重新导入）
- **安装目录**：~/.newshell/skills/
- **文件格式**：SKILL.md（包含 YAML frontmatter 和 Markdown 内容）

#### AI 助手功能
- **双模式支持**：
  - 对话模式（chat）：运维问题咨询，纯文本对话
  - Agent 模式（agent）：服务器自动执行，可调用工具
- **模式切换**：通过 UI 按钮切换
- **服务器选择**：Agent 模式下选择目标服务器
- **模型选择**：支持选择不同 AI 模型（显示服务商图标）
- **确认机制**：危险命令需要用户确认（可编辑命令）
- **实时反馈**：
  - 思考状态显示（迭代次数）
  - 工具调用卡片（状态、输出、耗时）
  - 工具输出实时流式显示
  - 任务步骤进度条

#### 技术实现
- **skill_parser.go**：解析 SKILL.md 文件
- **skill_market.go**：Skill 导入管理（ZIP/文件夹）
- **agent_terminal.go**：Agent 终端 WebSocket 广播
- **AiChatPanel.tsx**：双模式 UI 和事件处理
- **skillStore.ts**：Skill 状态管理
- **skillService.ts**：Skill API 服务

#### 后端 Handler 更新 (handlers/agent.go)
- ImportSkill - 导入 Skill 从 ZIP 文件
- GetInstalledSkillsWithMarketInfo - 获取已安装 Skills
- ToggleSkill - 启用/禁用 Skill
- UpdateSkill - 更新 Skill

#### 前端组件更新
- **AiChatPanel.tsx**：
  - 双模式切换 UI
  - 服务器选择器
  - 模型选择器
  - 历史会话列表
  - 工具调用卡片（可展开）
  - 确认对话框
- **SettingsPanel.tsx**：
  - Agent 设置标签页
  - Skill 管理界面

---
