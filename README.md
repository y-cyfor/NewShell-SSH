> **🤖 AI VibeCoding 试验项目** — 使用 [OpenCode](https://opencode.sh) / [Claude Code](https://claude.ai/code) 驱动开发，大模型为 小米 Mimo-Pro / Qwen3.6-Plus

# NewShell - 免费开源 SSH 管理工具

> 永久免费 | 跨平台 | 本地优先 | AI 辅助

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/y-cyfor/NewShell-SSH)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-ffc131.svg)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org)
[![Go](https://img.shields.io/badge/Go-1.22-00add8.svg)](https://golang.org)

NewShell 是一款免费、开源、跨平台的 SSH 管理工具，解决市面上 SSH 工具同步收费、窗口数量限制等痛点。

## 主要功能

| 功能 | 描述 |
|------|------|
| 三栏可拖拽布局 | 左侧连接列表、中间终端、右侧系统信息/AI对话 |
| SSH连接管理 | 支持密码/密钥认证，无窗口数量限制 |
| 多标签终端 | 基于xterm.js + WebGL渲染，支持语法高亮 |
| SFTP文件管理 | 文件树面板，支持上传/下载/创建/删除 |
| 系统信息监控 | 实时CPU/内存/磁盘/网络监控 |
| AI对话助手 | OpenAI兼容接口，支持流式输出 |
| 数据同步 | 本地优先，支持自建后端同步 |
| 主题切换 | 暗色/亮色主题，xterm.js配色同步 |

## 技术栈

- **桌面外壳**: Tauri 2.0 (Rust + WebView)
- **前端**: React 18 + TypeScript + Vite 5
- **终端**: xterm.js 5 + WebGL渲染
- **后端**: Go 1.22+ + Gin框架
- **数据库**: SQLite (纯Go实现)
- **加密**: AES-256-GCM
- **部署**: Docker + Nginx + Certbot

## 截图

![主界面截图](screenshots/main.png)
*主界面 - 三栏布局展示*

![终端截图](screenshots/terminal.png)
*终端 - xterm.js + WebGL渲染*

![文件管理截图](screenshots/filemanager.png)
*文件管理 - SFTP文件树*

> 注意：截图目录当前为空，请后续补充实际截图

## 快速开始

### 先决条件

- Node.js 18+
- Go 1.22+
- Rust (用于Tauri构建)
- npm 或 yarn

### 安装

```bash
# 克隆项目
git clone https://github.com/y-cyfor/NewShell-SSH.git
cd NewShell

# 安装前端依赖
npm install

# 构建Go后端
cd server
go build -o newshell-server.exe .
cd ..
```

### 开发

```bash
# 启动 Tauri 开发
npm run tauri dev
```

### 构建

```bash
# 构建 Go 后端
cd server
go build -o newshell-server.exe .
cd ..

# 构建 Tauri 应用
npm run tauri build
```

### 部署 (Docker)

```bash
# 生产环境部署
docker-compose up -d
```

## 项目结构

```
NewShell/
├── src-tauri/                  # Tauri桌面应用配置
│   ├── src/main.rs             # Tauri入口，管理Go后端进程
│   ├── tauri.conf.json
│   └── Cargo.toml
├── src/                        # React前端
│   ├── components/             # UI组件
│   ├── services/               # API/WebSocket服务
│   ├── stores/                 # 状态管理
│   └── utils/                  # 工具函数
├── server/                     # Go后端
│   ├── handlers/               # API处理器
│   ├── services/               # 业务逻辑
│   └── models/                 # 数据模型
└── nginx/                      # Nginx配置
```

## 配置

### 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

主要配置项：
- `JWT_SECRET`: JWT密钥
- `ENCRYPTION_KEY`: AES加密密钥
- `PORT`: 后端端口 (默认29800)

### Tauri配置

编辑 `src-tauri/tauri.conf.json` 配置应用窗口、权限等。

### Go后端配置

编辑 `server/config/config.go` 配置数据库、AI接口等。

## 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 开发规范

- 前端：ESLint + Prettier
- 后端：gofmt + go vet
- 提交信息：语义化提交

## 许可证

本项目基于 Apache License 2.0 开源 - 详见 [LICENSE](LICENSE) 文件。

## 致谢

- [Tauri](https://tauri.app) - 桌面应用框架
- [React](https://reactjs.org) - 前端框架
- [xterm.js](https://xtermjs.org) - 终端模拟器
- [Gin](https://gin-gonic.com) - Go HTTP框架
- [SQLite](https://www.sqlite.org) - 嵌入式数据库

## 支持

- 提交 [Issue](https://github.com/y-cyfor/NewShell-SSH/issues)
- 邮件：cyfor@foxmail.com

---

**注意**: 本项目处于早期开发阶段 (v0.1.0)，功能可能不完整，欢迎反馈问题。