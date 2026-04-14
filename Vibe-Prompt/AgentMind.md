# NewShell Agent 实现原理

## 一、整体架构

```
┌─────────────────────── Tauri 桌面应用 ────────────────────────┐
│                                                                │
│  ┌─────────── 前端 (React/TypeScript) ──────────────────────┐  │
│  │ AiChatPanel ── SSE事件解析 ── 消息渲染 ── 确认弹窗        │  │
│  │ AgentTerminalPanel ── WebSocket实时输出                   │  │
│  │ agentStore (Zustand) ── 状态管理                          │  │
│  │ agentService ── API客户端                                 │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ HTTP/SSE + WebSocket               │
│  ┌─────────── Go 后端 (Tauri子进程) ────────────────────────┐  │
│  │ AgentEngine (ReAct循环)                                   │  │
│  │  ├─ ToolRegistry (工具注册中心)                           │  │
│  │  │   ├─ SSH工具: execute_command, read_file, write_file   │  │
│  │  │   │            list_directory, create_directory,       │  │
│  │  │   │            delete_file                             │  │
│  │  │   ├─ 内置工具: get_system_info, search_files           │  │
│  │  │   └─ (预留) MCP工具, Skill工具                         │  │
│  │  ├─ SafetyChecker (安全检查器)                            │  │
│  │  ├─ SSHExecutor (非PTY命令执行)                           │  │
│  │  └─ AI Service (OpenAI兼容 Function Calling)              │  │
│  │                                                           │  │
│  │ SQLite (~/.newshell/data.db)                              │  │
│  │  - agent_config / agent_sessions / agent_messages         │  │
│  │  - mcp_servers / skills                                   │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ SSH (出站, 非PTY)                  │
└───────────────────────────┼────────────────────────────────────┘
                            ▼
                    远程目标服务器
```

---

## 二、核心工作流：ReAct 循环

Agent 的核心是一个 **ReAct (Reasoning + Acting)** 循环，实现在 `server/services/agent_service.go` 的 `Run()` 方法中。

### 2.1 触发入口

1. 用户在前端 `AiChatPanel` 组件的 Agent 模式下输入需求
2. 前端调用 `agentChat()` → `POST /api/agent/chat`（SSE 流式请求）
3. 后端 `handlers/agent.go:AgentChat()` 接收请求：
   - 加载 Agent 配置（最大迭代次数、确认模式、危险命令列表等）
   - 构建 AI 配置（优先使用前端传来的 model_config，否则从数据库读取）
   - 加载自定义危险命令模式到 `GlobalSafetyChecker`
   - 创建或获取会话（自动生成标题：取用户消息前30字）
   - 保存用户消息到数据库
   - 创建 `AgentEngine` 实例
   - 启动 goroutine 执行 `engine.Run()`
   - 将 `stepChan` 中的事件通过 SSE 流式推送到前端

### 2.2 ReAct 循环步骤

```
for i := 0; i < maxIterations; i++ {
    步骤1: 发送 "thinking" 事件 → 前端显示"思考中... (第N步)"
    
    步骤2: 调用 LLM (CallLLMWithTools)
           ├─ 传入 system prompt + 消息历史 + 工具定义
           ├─ 流式接收响应，通过 chunkCb 回调发送 "text_chunk" 事件
           └─ 返回 LLMResponse {Content, ToolCalls[]}
    
    步骤3: 将 assistant 消息加入历史，保存到数据库
    
    步骤4: 发送 "text" 事件（如果有文本内容）
    
    步骤5: 判断是否有 ToolCalls
           ├─ 无 ToolCalls → 这是最终回答，发送 isFinal=true 的 text 事件，break
           └─ 有 ToolCalls → 进入步骤6
    
    步骤6: 对每个 ToolCall 执行：
           6a: 安全检查 (checkDangerous)
               ├─ 提取命令字符串（execute_command取command参数，delete_file取path等）
               ├─ 用 SafetyChecker 匹配预定义+自定义危险模式
               └─ 如果危险且 confirmMode != "none"：
                   → 发送 "confirm_required" 事件
                   → 阻塞等待 confirmChan（前端用户确认/拒绝）
                   → 用户拒绝 → 发送 "tool_rejected"，continue
           
           6b: 如果 confirmMode == "all"（即使不危险也要确认）
               → 同样发送 confirm_required 并等待
           
           6c: 发送 "tool_start" 事件
           
           6d: 创建 ExecutionContext（包含 ConnID, SessionID, OutputChan, WSBroadcast）
               ├─ 启动 goroutine 消费 outputChan → 发送 "tool_output" SSE 事件
               ├─ WSBroadcast 回调同时推送至 AgentTerminalPanel (WebSocket)
               └─ 调用 tools.GlobalRegistry.Execute() 执行工具
           
           6e: 执行结果处理
               ├─ 成功 → 截断输出(>5000字符) → 发送 "tool_complete" → 保存 tool 消息
               └─ 失败 → 发送 "tool_error"
           
           6f: 将 tool 结果作为 role="tool" 消息加入历史
}
```

### 2.3 消息历史管理

- System prompt 始终作为第一条消息
- 总消息数限制为 21 条（system + 最近 20 条），超出时保留 system 和最后 20 条
- 每轮对话的 assistant 消息和 tool 消息都持久化到 SQLite `agent_messages` 表

---

## 三、系统提示词 (System Prompt)

系统提示词在 `agent_service.go:buildSystemPrompt()` 中动态构建，包含以下部分：

```
你是 VibeCoding Shell 的 AI 运维Agent。你可以使用工具来帮助用户管理服务器。

## 当前目标服务器
- 名称: {{Connection.Name}}
- 地址: {{Connection.Username}}@{{Connection.Host}}:{{Connection.Port}}

## 可用Skills (工作流模板)
（如果有启用的Skills，注入每个Skill的Name、Description和Content）

## 可用工具
### execute_command
在目标服务器上执行shell命令并返回输出
参数:
  - command (string): 要执行的shell命令 [必填]
  - working_dir (string): 工作目录(可选)
  - timeout (integer): 超时秒数(可选)

### read_file
读取服务器上文件的内容
参数:
  - path (string): 文件路径 [必填]
  - encoding (string): 编码(默认utf-8)
  - max_lines (integer): 最大行数(默认500)

### write_file
在服务器上创建或覆盖文件
参数:
  - path (string): 文件路径 [必填]
  - content (string): 文件内容 [必填]
  - append (boolean): 是否追加模式(默认覆盖)

### list_directory
列出目录内容，显示文件和子目录
参数:
  - path (string): 目录路径 [必填]
  - show_hidden (boolean): 显示隐藏文件
  - show_details (boolean): 显示详细信息(权限、大小等)

### create_directory
在服务器上创建目录
参数:
  - path (string): 目录路径 [必填]
  - recursive (boolean): 递归创建父目录

### delete_file
删除服务器上的文件或目录
参数:
  - path (string): 文件或目录路径 [必填]
  - recursive (boolean): 递归删除目录

### get_system_info
获取服务器系统信息，包括CPU、内存、磁盘、网络等

### search_files
按名称或内容搜索文件
参数:
  - pattern (string): 搜索模式(文件名或内容关键词) [必填]
  - path (string): 搜索目录(默认当前目录)
  - type (string): 搜索类型: name|content
  - max_depth (integer): 最大搜索深度
  - file_pattern (string): 文件名过滤(如 *.log)

## 执行规则
1. 仔细分析用户需求，制定执行计划
2. 每次调用一个工具，观察结果后再决定下一步
3. 执行危险操作前必须向用户解释原因
4. 如果命令执行失败，分析错误信息并尝试修复
5. 任务完成后给出结构化的总结

## 安全规则
- 绝对不要执行 rm -rf / 等极端危险命令
- 修改系统配置前先备份原文件
- 敏感信息不要在输出中明文显示

## 输出格式
- 工具调用时: 简洁说明目的
- 执行失败时: 分析原因并给出修复建议
- 最终总结: 使用结构化格式
```

---

## 四、工具系统

### 4.1 工具注册中心 (`server/tools/registry.go`)

- 全局单例 `GlobalRegistry`，线程安全（sync.RWMutex）
- 每个工具包含：Name, Description, Parameters, Handler, Category, IsDangerous
- `InitBuiltinTools()` 在启动时注册所有内置工具
- `ToAPITools()` 将所有工具转换为 OpenAI Function Calling 格式
- `Execute()` 执行前校验必填参数，然后调用对应 Handler

### 4.2 SSH 工具 (`server/tools/ssh_tools.go`)

| 工具名 | 功能 | 危险标记 |
|--------|------|----------|
| `execute_command` | 执行任意 shell 命令 | 否（但命令内容会被安全检查） |
| `read_file` | 用 `head -n` 读取文件 | 否 |
| `write_file` | 用 heredoc 写入文件 | 否 |
| `list_directory` | `ls -la` 列目录 | 否 |
| `create_directory` | `mkdir -p` 创建目录 | 否 |
| `delete_file` | `rm` 删除文件/目录 | **是** |

**安全细节：**
- `write_file` 使用随机分隔符 (`NEWSSHELL_随机16字节`) 构建 heredoc，防止内容注入
- 所有文件路径用单引号包裹
- `write_file` 中的内容会转义单引号 (`'` → `'\''`)

### 4.3 内置工具 (`server/tools/builtin_tools.go`)

| 工具名 | 功能 |
|--------|------|
| `get_system_info` | 执行一组系统信息采集命令（uname, hostname, uptime, lscpu, free, df, ip addr, loadavg） |
| `search_files` | 按文件名（find）或内容（grep）搜索 |

### 4.4 工具执行上下文 (`ExecutionContext`)

```go
type ExecutionContext struct {
    ConnID      string            // 目标服务器连接ID
    SessionID   string            // Agent会话ID
    ToolCallID  string            // 工具调用ID
    OutputChan  chan<- ToolOutput // 流式输出通道
    WSBroadcast func(data string) // WebSocket广播回调（推送到Agent终端面板）
}
```

---

## 五、安全检查器 (`server/tools/safety.go`)

### 5.1 预定义危险模式（15条正则规则）

| 模式 | 危险等级 | 说明 |
|------|----------|------|
| `rm -r /` | critical | 递归删除根目录 |
| `rm -r ~` | critical | 递归删除用户主目录 |
| `mkfs` | critical | 格式化磁盘分区 |
| `dd of=/dev/` | critical | 直接写入磁盘设备 |
| `> /dev/sd[a-z]` | critical | 重定向到磁盘设备 |
| `fork炸弹` | critical | Fork炸弹 |
| `shutdown/reboot/halt/poweroff/init [06]` | warning | 关机/重启系统 |
| `chmod 777` | warning | 设置过于宽松的权限 |
| `iptables -F` | warning | 清空防火墙规则 |
| `crontab -r` | warning | 删除所有定时任务 |
| `userdel/groupdel` | warning | 删除用户/用户组 |
| `passwd root` | warning | 修改root密码 |
| `curl/wget | sh` | warning | 远程脚本直接执行 |
| `chmod +s` | warning | 设置SUID/SGID权限 |
| `> /etc/` | warning | 重定向到系统配置目录 |

### 5.2 自定义模式

用户可在设置中添加自定义正则规则，存储格式：
```json
[{"pattern": "rm\\s+.*", "reason": "删除操作", "level": "warning"}]
```

### 5.3 检查时机

- 在 `agent_service.go:checkDangerous()` 中调用
- 仅对 `execute_command`（提取 command 参数）、`delete_file`（提取 path 参数）、`write_file`（提取 path 参数）进行命令级检查
- 其他工具调用不经过安全检查

---

## 六、SSH 命令执行器 (`server/services/ssh_command.go`)

### 6.1 执行流程

```
1. GetOrCreateAgentClient(connID) → 获取/创建SSH连接（复用连接池）
2. client.NewSession() → 为每个命令创建独立非PTY会话
3. 构建完整命令（如有working_dir则拼接 cd 'dir' && cmd）
4. session.Start(fullCmd) → 启动命令
5. 两个 goroutine 并发读取 stdout 和 stderr：
   ├─ 每行写入 outputChan（SSE流式输出）
   ├─ 每行调用 wsBroadcast（WebSocket推送到Agent终端面板）
   └─ 同时累积到 strings.Builder（用于最终返回）
6. session.Wait() 等待完成
7. 解析退出码（ssh.ExitError）
8. 广播完成/失败状态到终端面板
```

### 6.2 关键设计

- **非PTY模式**：每次命令创建独立 session，不请求伪终端
- **并发输出**：stdout 和 stderr 分别用 goroutine 读取，用 WaitGroup 确保全部输出捕获完毕
- **取消支持**：监听 context.Done()，收到信号后发送 SIGKILL
- **大缓冲区**：scanner.Buffer 设置为 1MB，支持长行输出

---

## 七、LLM 调用与 Function Calling (`server/services/ai_service.go`)

### 7.1 CallLLMWithTools

这是 Agent 与 LLM 交互的核心函数：

```go
func CallLLMWithTools(cfg *models.AIConfig, messages []ChatMessage, 
    apiTools []tools.APITool, chunkCb LLMChunkCallback) (*LLMResponse, error)
```

**请求构建：**
- URL: `{api_base}/chat/completions`
- 请求体包含：model, messages, stream=true, tools, tool_choice="auto"
- 支持模型参数：temperature, max_tokens, top_p, frequency_penalty, presence_penalty
- 超时设置：300秒（5分钟）

**SSE 流式解析：**
1. 逐行读取 `data:` 前缀的 SSE 事件
2. 解析 `chatAPIResponse` 的 choices
3. **文本内容**：直接累加到 `result.Content`，同时调用 chunkCb 回调
4. **工具调用**：OpenAI 的 tool_calls 是分 chunk 返回的（ID和Name通常只在第一个chunk出现，Arguments是分段JSON字符串）
   - 用 `toolCallMap map[int]*streamingToolCall` 按 index 累积
   - 每个 chunk 追加 Arguments 字符串
   - 结束后统一 JSON 解析为 `map[string]interface{}`

**返回：**
- `LLMResponse{Content, ToolCalls[], FinishReason}`

---

## 八、前端实现

### 8.1 状态管理 (`src/stores/agentStore.ts`)

Zustand store，部分状态持久化到 localStorage：

```typescript
interface AgentState {
    mode: 'chat' | 'agent';              // 对话模式
    config: AgentConfig;                  // Agent配置
    currentSessionId: string | null;      // 当前会话ID
    currentConnId: string;               // 目标服务器ID
    selectedModelId: string;             // 选中的AI模型
    messages: AgentMessage[];            // 消息列表
    isRunning: boolean;                  // 是否正在执行
    pendingConfirm: {...} | null;        // 待确认项
}
// 持久化: mode, currentConnId, selectedModelId, config
```

### 8.2 SSE 事件处理 (`src/components/ai/AiChatPanel.tsx:handleAgentEvent`)

前端接收并解析 SSE 事件流，按类型更新 UI：

| SSE 事件类型 | 前端行为 |
|-------------|----------|
| `thinking` | 显示/更新"思考中... (第N步)"状态 |
| `text_chunk` | 流式追加 AI 文本内容（半透明显示） |
| `text` | 如果是 isFinal → 显示最终总结（正常颜色）；否则显示中间文本 |
| `tool_start` | 创建 ToolCallCard，状态设为 executing |
| `tool_output` | 追加工具输出到对应 ToolCallCard |
| `tool_complete` | 更新 ToolCallCard 状态为 completed，显示退出码和耗时 |
| `tool_error` | 更新 ToolCallCard 状态为 failed |
| `tool_rejected` | 标记工具调用被用户拒绝 |
| `confirm_required` | 设置 pendingConfirm，弹出 ConfirmDialog |
| `error` | 显示错误消息 |
| `done` | 设置 isRunning=false，保存 sessionId |

### 8.3 确认对话框 (`src/components/ai/ConfirmDialog.tsx`)

当收到 `confirm_required` 事件时弹出：
- 显示工具名、危险原因、危险等级（critical 红色 / warning 黄色）
- 显示完整命令内容
- 提供输入框允许用户修改命令
- 两个按钮：取消 / 确认执行
- 用户操作后调用 `POST /api/agent/confirm` 通知后端

### 8.4 Agent 终端面板 (`src/components/terminal/AgentTerminalPanel.tsx`)

- 复用 xterm.js + WebGL 渲染
- 通过 WebSocket 连接 `/ws/agent-terminal/{sessionId}`
- 只读模式（不发送用户输入）
- 实时接收 Agent 执行命令的输出（包含命令头、stdout、stderr、完成/失败状态）
- 支持暗色/亮色主题切换

### 8.5 Agent 服务 (`src/services/agentService.ts`)

- `agentChat()`: 使用 fetch + ReadableStream 解析 SSE 事件流
- `agentConfirm()`: POST /api/agent/confirm
- `agentCancel()`: POST /api/agent/cancel
- `createAgentTerminalWS()`: 创建 Agent 终端 WebSocket 连接

---

## 九、API 端点一览

### Agent 核心

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/api/agent/chat` | Agent对话（SSE流式） |
| POST | `/api/agent/confirm` | 确认/拒绝工具执行 |
| POST | `/api/agent/cancel` | 取消Agent执行 |

### Agent 配置

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/agent/config` | 获取Agent配置 |
| PUT | `/api/agent/config` | 更新Agent配置 |

### Agent 会话

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/agent/sessions` | 会话列表 |
| GET | `/api/agent/sessions/:id` | 会话详情 |
| GET | `/api/agent/sessions/:id/messages` | 消息列表 |
| DELETE | `/api/agent/sessions/:id` | 删除会话 |

### MCP 管理

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/agent/mcp/servers` | 列出MCP服务器 |
| POST | `/api/agent/mcp/servers` | 添加MCP服务器 |
| DELETE | `/api/agent/mcp/servers/:id` | 删除MCP服务器 |

### Skills 管理

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/agent/skills` | 列出Skills |
| POST | `/api/agent/skills/install` | 安装Skill |
| DELETE | `/api/agent/skills/:name` | 卸载Skill |
| PUT | `/api/agent/skills/:name/toggle` | 启用/禁用Skill |
| GET | `/api/agent/skills/market` | 浏览Skill市场 |
| POST | `/api/agent/skills/market/install` | 从市场安装 |
| POST | `/api/agent/skills/import` | 从ZIP导入Skill |

### WebSocket

| 端点 | 功能 |
|------|------|
| `/ws/agent-terminal/:sessionId` | Agent终端实时输出 |

---

## 十、数据库 Schema

### agent_config
```sql
CREATE TABLE agent_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    max_iterations INTEGER DEFAULT 10,
    default_timeout INTEGER DEFAULT 60,
    smart_timeout BOOLEAN DEFAULT 1,
    confirm_mode TEXT DEFAULT 'dangerous',   -- 'all' | 'dangerous' | 'none'
    dangerous_commands TEXT DEFAULT '["rm -rf","shutdown","reboot","mkfs","dd"]',
    dangerous_commands_custom TEXT DEFAULT '[]',
    history_mode TEXT DEFAULT 'persistent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### agent_sessions
```sql
CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY,
    conn_id TEXT,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conn_id) REFERENCES connections(id) ON DELETE SET NULL
);
```

### agent_messages
```sql
CREATE TABLE agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,       -- 'user' | 'assistant' | 'tool' | 'system'
    content TEXT,
    tool_calls TEXT,          -- JSON
    tool_call_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);
```

### mcp_servers / skills
```sql
CREATE TABLE mcp_servers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL, command TEXT, args TEXT, url TEXT,
    enabled BOOLEAN DEFAULT 1, ...
);

CREATE TABLE skills (
    name TEXT PRIMARY KEY, description TEXT, version TEXT,
    source TEXT DEFAULT 'local', path TEXT, enabled BOOLEAN DEFAULT 1, ...
);
```

---

## 十一、确认机制详解

### 11.1 三种确认模式

| 模式 | 行为 |
|------|------|
| `none` | 自动执行所有工具调用，无需确认 |
| `dangerous`（默认） | 仅对 SafetyChecker 标记为危险的命令弹出确认 |
| `all` | 每个工具调用都需要确认 |

### 11.2 确认通道机制

后端使用 in-memory channel 实现确认：

```go
// handlers/agent.go
var confirmChannels = make(map[string]chan bool)
// key = sessionID + ":" + toolCallID
```

1. Agent 循环遇到需要确认的工具调用时，创建 `confirmChan := make(chan bool, 1)`
2. 将 channel 存入 `confirmChannels` map
3. 发送 `confirm_required` SSE 事件到前端（不包含 channel）
4. Agent 循环阻塞在 `select { case confirmed := <-confirmChan: ... }`
5. 前端用户点击确认/取消 → `POST /api/agent/confirm`
6. 后端 handler 从 map 中找到对应 channel，发送 `true` 或 `false`
7. Agent 循环接收到结果，继续执行或跳过

### 11.3 取消机制

- 前端点击取消按钮 → 调用 `abortController.abort()` + `POST /api/agent/cancel`
- 后端 cancel handler 遍历该 session 的所有 pending confirm channel，发送 `false`
- context 取消 → SSH 执行器收到信号后发送 SIGKILL

---

## 十二、输出流式传输链路

Agent 执行过程中的输出通过 **双通道** 实时推送到前端：

### 通道1：SSE（AiChatPanel 对话面板）

```
SSH命令执行 → outputChan → goroutine消费 → stepChan → SSE流 → handleAgentEvent → 更新ToolCallCard
```

- `tool_output` 事件携带输出 chunk，前端追加到对应 ToolCallCard 的 output 字段
- 输出截断：超过 5000 字符时截断并添加 "...(输出已截断)"

### 通道2：WebSocket（AgentTerminalPanel 专用终端）

```
SSH命令执行 → wsBroadcast回调 → BroadcastToAgentTerminal() → WebSocket → xterm.js渲染
```

- 命令头：黄色 `$ command`
- stdout：正常白色文本
- stderr：红色文本（ANSI `\x1b[31m`）
- 完成：绿色 `✓ 命令完成 (退出码: N)`
- 失败：红色 `✗ 命令失败 (退出码: N)`

---

## 十三、Skills 系统（工作流模板）

Skills 是预定义的工作流模板，在 system prompt 中注入到 LLM 上下文：

1. **存储**：`~/.newshell/skills/` 目录，每个 Skill 包含 SKILL.md（YAML frontmatter + Markdown正文）
2. **加载**：`buildSystemPrompt()` 中查询所有 enabled 的 Skills，将 Name、Description、Content 注入到 prompt
3. **来源**：
   - 本地创建
   - 从 ClawHub 市场搜索/安装
   - 从 ZIP 文件导入
4. **管理**：启用/禁用开关，安装/卸载操作

---

## 十四、MCP 集成（预留）

MCP (Model Context Protocol) 支持外部工具服务器：

1. **传输方式**：stdio（子进程）或 HTTP SSE
2. **工具发现**：`tools/list` 方法
3. **工具调用**：`tools/call` 方法
4. **命名**：`mcp_{serverName}_{toolName}`
5. **当前实现**：数据库表和管理 API 已就绪，MCP 客户端核心待实现

---

## 十五、关键文件索引

### 后端 (Go)

| 文件 | 职责 |
|------|------|
| `server/services/agent_service.go` | AgentEngine：ReAct循环、system prompt构建、安全检查、工具执行编排 |
| `server/services/ai_service.go` | CallLLMWithTools：OpenAI兼容Function Calling、SSE流式解析、tool_calls累积 |
| `server/services/ssh_command.go` | SSH命令执行：非PTY会话、并发输出、context取消 |
| `server/services/ssh_service.go` | SSH连接管理、连接池（含Agent专用池） |
| `server/services/agent_terminal.go` | Agent终端WebSocket广播器注册/注销 |
| `server/handlers/agent.go` | 所有Agent HTTP处理器 + Agent终端WebSocket + 确认channel管理 |
| `server/tools/types.go` | 核心类型定义：Tool, ToolHandler, ExecutionContext, ToolResult, ToolCall等 |
| `server/tools/registry.go` | 工具注册中心：注册/查询/执行/转换为API格式 |
| `server/tools/ssh_tools.go` | 6个SSH工具的实现 |
| `server/tools/builtin_tools.go` | 2个内置工具（系统信息、文件搜索） |
| `server/tools/safety.go` | 安全检查器：15条预定义危险模式 + 自定义模式 |
| `server/models/agent.go` | 数据模型 + 数据库CRUD操作 |
| `server/database/db.go` | SQLite数据库初始化 + 表迁移 |
| `server/main.go` | 路由注册 |

### 前端 (React/TypeScript)

| 文件 | 职责 |
|------|------|
| `src/components/ai/AiChatPanel.tsx` | AI对话面板：传统对话 + Agent模式、SSE事件处理、确认弹窗 |
| `src/components/ai/ConfirmDialog.tsx` | 危险命令确认对话框 |
| `src/components/ai/AgentSessionList.tsx` | 历史会话列表 |
| `src/components/terminal/AgentTerminalPanel.tsx` | Agent专用终端面板（xterm.js + WebSocket） |
| `src/stores/agentStore.ts` | Zustand状态管理 |
| `src/services/agentService.ts` | Agent API客户端 + WebSocket创建 |
