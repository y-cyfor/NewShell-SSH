---

# VibeCoding Shell - AI Agent 改造完整方案

## 一、架构确认

```
┌─────────────────────── Tauri 桌面应用 ────────────────────────┐
│                                                                │
│  ┌─────────── 前端 (React/TypeScript) ──────────────────────┐  │
│  │ AiChatPanel | AgentTerminal | Settings                   │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ HTTP/SSE/WebSocket (localhost)     │
│  ┌─────────── 本地 Go 后端 (Tauri子进程) ───────────────────┐  │
│  │ Agent引擎 | SSH执行器 | MCP客户端 | Skill管理器           │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ SQLite (~/.newshell/data.db)                         │  │  │
│  │ │ - connections (现有)                                 │  │  │
│  │ │ - agent_sessions (新增)                              │  │  │
│  │ │ - agent_config (新增)                                │  │  │
│  │ │ - mcp_servers (新增)                                 │  │  │
│  │ │ - skills (新增)                                      │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ SSH (出站)                         │
└───────────────────────────┼────────────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │   远程服务器 (用户的目标)     │
              │   execute commands via SSH  │
              └────────────────────────────┘

另有一个独立部署的远程 Go 后端，仅用于 SSH连接信息云端同步，不参与Agent功能。
```

## 二、实现阶段 (按 Phase 1→5 顺序)

### Phase 1: 后端核心 - Agent引擎 + 内置工具 + SSH执行器

**新增文件:**

| 文件 | 职责 |
|------|------|
| `server/tools/types.go` | 工具类型定义 (Tool, ToolParam, ToolResult, ToolOutput) |
| `server/tools/registry.go` | 工具注册中心 (注册/查询/执行) |
| `server/tools/builtin_tools.go` | 内置工具: get_system_info, search_files |
| `server/tools/ssh_tools.go` | SSH工具: execute_command, read_file, write_file, list_directory, create_directory, delete_file |
| `server/services/ssh_executor.go` | 非PTY命令执行器 (流式输出, 智能超时) |
| `server/services/agent_service.go` | Agent引擎核心 (ReAct循环, 安全检查, SSE输出) |
| `server/services/agent_config.go` | Agent配置管理 |
| `server/handlers/agent.go` | Agent API端点 |
| `server/models/agent.go` | 数据库模型 (AgentConfig, AgentSession) |

**修改文件:**

| 文件 | 改动 |
|------|------|
| `server/services/ai_service.go` | 扩展支持function calling (tools参数, tool_calls解析) |
| `server/database/db.go` | 新增表迁移 |
| `server/main.go` | 注册新路由 |

**核心流程实现:**

```go
// agent_service.go 核心逻辑伪代码
func (ae *AgentEngine) Run(ctx context.Context, session *AgentSession, 
    userMessage string, outputChan chan<- SSEEvent) error {
    
    // 1. 添加用户消息到会话
    session.Messages = append(session.Messages, ChatMessage{Role: "user", Content: userMessage})
    
    // 2. 构建system prompt (包含工具定义、服务器上下文)
    systemPrompt := ae.buildSystemPrompt(session.ConnID)
    
    // 3. ReAct循环
    for i := 0; i < ae.Config.MaxIterations; i++ {
        // 调用LLM
        response, err := ae.callLLM(systemPrompt, session.Messages, tools)
        
        // 如果LLM返回纯文本 (无工具调用)，这是最终回答
        if len(response.ToolCalls) == 0 {
            outputChan <- SSEEvent{Type: "text", Data: {Content: response.Content, IsFinal: true}}
            break
        }
        
        // 处理每个工具调用
        for _, tc := range response.ToolCalls {
            // 安全检查
            dangerous, reason := ae.checkDangerous(tc)
            if dangerous && ae.Config.ConfirmMode != "none" {
                // 发送确认请求，等待用户响应
                outputChan <- SSEEvent{Type: "confirm_required", Data: {ToolCall: tc, Reason: reason}}
                confirmed := ae.waitForConfirmation(session.ID, tc.ID)
                if !confirmed {
                    // 用户拒绝
                    session.Messages = append(session.Messages, 
                        ChatMessage{Role: "tool", Content: "用户拒绝执行此命令"})
                    continue
                }
            }
            
            // 执行工具
            outputChan <- SSEEvent{Type: "tool_call", Data: tc}
            result, err := ae.executeTool(ctx, tc, session.ConnID, outputChan)
            
            // 将结果添加到消息历史
            session.Messages = append(session.Messages, 
                ChatMessage{Role: "tool", Content: result.Output, ToolCallID: tc.ID})
        }
    }
    
    // 4. 保存会话到数据库
    ae.saveSession(session)
    
    return nil
}
```

**LLM Function Calling格式:**

```go
// 发送给LLM的tools参数
type APITool struct {
    Type     string       `json:"type"`
    Function FunctionDef  `json:"function"`
}

type FunctionDef struct {
    Name        string                 `json:"name"`
    Description string                 `json:"description"`
    Parameters  map[string]interface{} `json:"parameters"`
}

// tools定义示例
var executeCommandTool = APITool{
    Type: "function",
    Function: FunctionDef{
        Name: "execute_command",
        Description: "在目标服务器上执行shell命令并返回输出",
        Parameters: map[string]interface{}{
            "type": "object",
            "properties": map[string]interface{}{
                "command": map[string]interface{}{
                    "type": "string",
                    "description": "要执行的shell命令",
                },
                "working_dir": map[string]interface{}{
                    "type": "string",
                    "description": "工作目录(可选)",
                },
                "timeout": map[string]interface{}{
                    "type": "integer",
                    "description": "超时秒数(可选, 会使用智能超时)",
                },
            },
            "required": []string{"command"},
        },
    },
}
```

**SSH非PTY执行器:**

```go
// ssh_executor.go
func ExecuteCommand(ctx context.Context, connID string, cmd CommandRequest, 
    outputChan chan<- ToolOutput) (*CommandResult, error) {
    
    // 获取SSH连接 (复用现有连接池或创建新连接)
    client, err := getSSHClient(connID)
    
    // 每次命令创建独立session (非PTY)
    session, err := client.NewSession()
    defer session.Close()
    
    // 设置输出管道
    stdout, _ := session.StdoutPipe()
    stderr, _ := session.StderrPipe()
    
    // 如果指定了工作目录，拼接cd命令
    fullCmd := cmd.Command
    if cmd.WorkingDir != "" {
        fullCmd = fmt.Sprintf("cd %s && %s", cmd.WorkingDir, cmd.Command)
    }
    
    // 启动命令
    session.Start(fullCmd)
    
    // 实时读取输出
    go func() {
        scanner := bufio.NewScanner(stdout)
        for scanner.Scan() {
            line := scanner.Text() + "\n"
            outputChan <- ToolOutput{ToolID: cmd.ToolID, Chunk: line}
            // 同时通过WebSocket发送到Agent终端Tab
            broadcastToAgentTerminal(sessionID, line)
        }
    }()
    
    go func() {
        scanner := bufio.NewScanner(stderr)
        for scanner.Scan() {
            line := scanner.Text() + "\n"
            outputChan <- ToolOutput{ToolID: cmd.ToolID, Chunk: line}
            broadcastToAgentTerminal(sessionID, line)
        }
    }()
    
    // 等待完成或超时
    done := make(chan error, 1)
    go func() { done <- session.Wait() }()
    
    timeout := getSmartTimeout(cmd.Command)
    select {
    case err := <-done:
        exitCode := 0
        if err != nil {
            exitCode = getExitCode(err)
        }
        return &CommandResult{ExitCode: exitCode}, nil
    case <-time.After(timeout):
        session.Signal(ssh.SIGKILL)
        return nil, fmt.Errorf("command timed out after %v", timeout)
    case <-ctx.Done():
        session.Signal(ssh.SIGKILL)
        return nil, ctx.Err()
    }
}
```

**智能超时:**

```go
func getSmartTimeout(command string) time.Duration {
    // 提取命令的第一个词
    parts := strings.Fields(command)
    if len(parts) == 0 {
        return 60 * time.Second
    }
    baseCmd := filepath.Base(parts[0])
    
    timeouts := map[string]time.Duration{
        // 查询类 - 短超时
        "ls": 10*time.Second, "cat": 10*time.Second, "head": 10*time.Second,
        "tail": 10*time.Second, "grep": 15*time.Second, "find": 30*time.Second,
        "df": 10*time.Second, "du": 15*time.Second, "ps": 10*time.Second,
        "free": 10*time.Second, "uptime": 10*time.Second, "whoami": 10*time.Second,
        "pwd": 10*time.Second, "date": 10*time.Second, "uname": 10*time.Second,
        
        // 安装/编译类 - 长超时
        "apt": 300*time.Second, "apt-get": 300*time.Second, "yum": 300*time.Second,
        "dnf": 300*time.Second, "pacman": 300*time.Second, "zypper": 300*time.Second,
        "make": 600*time.Second, "cmake": 300*time.Second, "gcc": 300*time.Second,
        "go": 300*time.Second, "cargo": 300*time.Second, "npm": 180*time.Second,
        "pip": 180*time.Second, "docker": 300*time.Second, "podman": 300*time.Second,
        
        // 网络类 - 中等超时
        "wget": 120*time.Second, "curl": 60*time.Second, "scp": 120*time.Second,
        "rsync": 300*time.Second, "ssh": 30*time.Second,
    }
    
    if t, ok := timeouts[baseCmd]; ok {
        return t
    }
    return 60 * time.Second // 默认60秒
}
```

**高危命令检测 (预置+自定义):**

```go
// server/tools/safety.go
type SafetyChecker struct {
    predefined []DangerousPattern
    custom     []DangerousPattern  // 用户自定义
}

type DangerousPattern struct {
    Pattern *regexp.Regexp
    Reason  string
    Level   string // "critical" | "warning"
}

var predefinedPatterns = []DangerousPattern{
    {regexp.MustCompile(`rm\s+(-[a-z]*r[a-z]*|--recursive)\s*/`), "递归删除根目录", "critical"},
    {regexp.MustCompile(`rm\s+(-[a-z]*r[a-z]*|--recursive)\s*~`), "递归删除用户主目录", "critical"},
    {regexp.MustCompile(`mkfs[\.\s]`), "格式化磁盘分区", "critical"},
    {regexp.MustCompile(`dd\s+.*of=/dev/`), "直接写入磁盘设备", "critical"},
    {regexp.MustCompile(`>\s*/dev/sd[a-z]`), "重定向到磁盘设备", "critical"},
    {regexp.MustCompile(`shutdown|reboot|halt|poweroff|init\s+[06]`), "关机/重启系统", "warning"},
    {regexp.MustCompile(`chmod\s+(-R\s+)?777`), "设置过于宽松的权限(777)", "warning"},
    {regexp.MustCompile(`iptables\s+(-F|--flush)`), "清空防火墙规则", "warning"},
    {regexp.MustCompile(`crontab\s+-r`), "删除所有定时任务", "warning"},
    {regexp.MustCompile(`userdel|groupdel`), "删除用户/用户组", "warning"},
    {regexp.MustCompile(`passwd\s+root`), "修改root密码", "warning"},
    {regexp.MustCompile(`:\(\)\{.*\|.*&\};:`), "Fork炸弹", "critical"},
    {regexp.MustCompile(`curl.*\|\s*(ba)?sh`), "远程脚本直接执行", "warning"},
    {regexp.MustCompile(`wget.*\|\s*(ba)?sh`), "远程脚本直接执行", "warning"},
}

func (sc *SafetyChecker) Check(command string) (bool, string, string) {
    allPatterns := append(sc.predefined, sc.custom...)
    for _, p := range allPatterns {
        if p.Pattern.MatchString(command) {
            return true, p.Reason, p.Level
        }
    }
    return false, "", ""
}
```

**API端点:**

```
POST   /api/agent/chat              Agent对话 (SSE流式)
POST   /api/agent/confirm           确认执行命令
POST   /api/agent/cancel            取消执行
GET    /api/agent/config            获取Agent配置
PUT    /api/agent/config            更新Agent配置
GET    /api/agent/sessions          获取会话列表
GET    /api/agent/sessions/:id      获取会话详情
DELETE /api/agent/sessions/:id      删除会话
GET    /api/agent/sessions/:id/messages  获取会话消息 (分页)
```

---

### Phase 2: 前端 - Agent UI + 终端集成

**新增文件:**

| 文件 | 职责 |
|------|------|
| `src/stores/agentStore.ts` | Agent状态管理 (配置、会话、确认队列) |
| `src/services/agentService.ts` | Agent API客户端 (SSE解析、WebSocket) |
| `src/components/ai/AgentMessage.tsx` | Agent消息渲染 (思考、工具调用、总结) |
| `src/components/ai/ToolCallCard.tsx` | 工具调用卡片 (状态、输出、耗时) |
| `src/components/ai/ConfirmDialog.tsx` | 命令确认弹窗 (高危警告、修改命令) |
| `src/components/ai/InputCollectDialog.tsx` | 参数收集弹窗 (密码、路径等) |
| `src/components/ai/AgentSessionList.tsx` | 历史会话列表 |
| `src/components/terminal/AgentTerminalPanel.tsx` | Agent执行专用终端Tab |

**修改文件:**

| 文件 | 改动 |
|------|------|
| `src/components/ai/AiChatPanel.tsx` | 模式切换、Agent消息渲染、确认/输入弹窗 |
| `src/components/terminal/TerminalTabs.tsx` | 支持agent-exec类型 |
| `src/stores/terminalStore.ts` | 新增addAgentTab方法 |
| `src/types/index.ts` | 新增Agent相关类型 |
| `src/components/settings/SettingsPanel.tsx` | 新增Agent配置Tab |

**AiChatPanel改造要点:**

1. **模式切换按钮**: 在标题栏增加切换开关 `💬 传统模式 | 🤖 Agent模式`
2. **目标服务器选择器**: Agent模式下，标题栏下方显示服务器下拉选择器
3. **消息渲染**: 区分渲染用户消息、AI思考、工具调用、最终总结
4. **颜色方案**:
   - 工具调用过程: `color: rgba(var(--text-primary-rgb), 0.5)` 浅色
   - 执行输出: `color: rgba(var(--text-primary-rgb), 0.4)` 更浅
   - 最终总结: `color: var(--text-primary)` 深色
5. **实时更新**: SSE流式接收，实时更新消息内容
6. **确认弹窗**: 收到confirm_required事件时弹出确认对话框
7. **输入弹窗**: 收到input_required事件时弹出参数收集对话框

**ToolCallCard组件设计:**

```tsx
// ToolCallCard.tsx 核心渲染
function ToolCallCard({ toolCall }: { toolCall: ToolCallStep }) {
  // 状态图标映射
  const statusIcon = {
    pending: <Clock size={12} className="text-yellow-400" />,
    confirming: <AlertTriangle size={12} className="text-orange-400" />,
    executing: <Loader size={12} className="animate-spin text-blue-400" />,
    completed: <CheckCircle size={12} className="text-green-400" />,
    failed: <XCircle size={12} className="text-red-400" />,
    cancelled: <Ban size={12} className="text-gray-400" />,
  };

  // 颜色: 执行中用浅色，完成后用深色
  const opacity = toolCall.status === 'executing' ? 0.5 : 1;
  
  return (
    <div 
      className="rounded-lg p-3 my-2 text-xs"
      style={{ 
        background: 'var(--bg-tertiary)', 
        border: toolCall.isDangerous ? '1px solid var(--danger)' : '1px solid var(--border)',
        opacity 
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {statusIcon[toolCall.status]}
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {toolCall.toolName}
        </span>
        {toolCall.isDangerous && <span className="text-red-400 text-[10px]">⚠️ 高危</span>}
      </div>
      <div className="pl-5" style={{ color: 'var(--text-secondary)' }}>
        <div className="font-mono">{toolCall.parameters.command || JSON.stringify(toolCall.parameters)}</div>
        {toolCall.status === 'executing' && (
          <div className="mt-1 text-[10px]">⏱️ 执行中... {formatDuration(Date.now() - toolCall.startTime)}</div>
        )}
        {toolCall.status === 'completed' && (
          <div className="mt-1 text-[10px]">
            ✅ 退出码: {toolCall.exitCode} | 耗时: {formatDuration(toolCall.endTime! - toolCall.startTime)}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Agent终端Tab:**

```tsx
// AgentTerminalPanel.tsx
// 复用xterm.js，WebSocket连接到Agent执行流
// 与普通TerminalPanel的区别:
// - 不发送用户输入 (只读观察)
// - WebSocket URL不同: /ws/agent-terminal/:sessionId
// - 标题显示当前执行的命令
// - 命令之间有分隔线
```

**ConfirmDialog设计:**

```tsx
// ConfirmDialog.tsx
function ConfirmDialog({ toolCall, reason, level, onConfirm, onCancel, onModify }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-lg p-4 w-[400px]" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2 mb-3">
          {level === 'critical' ? (
            <ShieldAlert size={20} className="text-red-500" />
          ) : (
            <AlertTriangle size={20} className="text-yellow-500" />
          )}
          <span className="font-semibold text-sm">
            {level === 'critical' ? '危险操作确认' : '操作确认'}
          </span>
        </div>
        
        <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          原因: {reason}
        </div>
        
        <div className="rounded p-2 mb-3 font-mono text-xs" style={{ background: 'var(--bg-primary)' }}>
          {toolCall.parameters.command}
        </div>
        
        <div className="mb-3">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            可修改命令后执行:
          </label>
          <input 
            value={modifiedCommand} 
            onChange={e => setModifiedCommand(e.target.value)}
            className="w-full px-2 py-1 rounded text-xs font-mono"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
          />
        </div>
        
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded text-xs"
            style={{ background: 'var(--bg-tertiary)' }}>取消</button>
          <button onClick={() => onConfirm(modifiedCommand)} className="flex-1 px-3 py-2 rounded text-xs text-white"
            style={{ background: level === 'critical' ? 'var(--danger)' : 'var(--accent)' }}>
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
```

**WebSocket扩展 (`wsService.ts`):**

```typescript
// 新增Agent终端WebSocket
export function createAgentTerminalWS(
  sessionId: string,
  onData: (data: string) => void,
  onCommandStart: (command: string) => void,
  onCommandEnd: (exitCode: number) => void,
  onDone: () => void
): WebSocket {
  const baseUrl = getBaseUrl().replace('http', 'ws');
  const ws = new WebSocket(`${baseUrl}/ws/agent-terminal/${sessionId}`);
  
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case 'agent_output': onData(msg.data); break;
      case 'agent_command_start': onCommandStart(msg.command); break;
      case 'agent_command_end': onCommandEnd(msg.exitCode); break;
      case 'agent_done': onDone(); break;
    }
  };
  
  return ws;
}
```

---

### Phase 3: 安全与配置

1. **Agent配置页面** (SettingsPanel新增Tab)
   - 执行模式选择 (全自动/仅高危确认/每步确认)
   - 高危命令列表管理 (预置规则 + 自定义正则)
   - 超时策略 (智能/统一)
   - 最大循环次数
   - 对话历史策略 (持久化/仅会话)

2. **对话历史持久化**
   - 后端SQLite存储: `agent_sessions` + `agent_messages` 表
   - 前端通过API查询: GET /api/agent/sessions
   - 会话列表侧边栏: 在AI面板左侧显示历史会话
   - 自动标题生成: 用第一条用户消息的前30字作为标题

3. **自定义高危规则**
   - 存储在SQLite `agent_config.dangerous_commands_custom` (JSON)
   - 格式: `[{"pattern": "rm\\s+.*", "reason": "删除操作", "level": "warning"}]`
   - 前端UI支持增删改

---

### Phase 4: MCP集成

1. **MCP客户端核心** (`server/services/mcp_client.go`)
   - JSON-RPC 2.0协议实现
   - stdio传输: 启动子进程，通过stdin/stdout通信
   - HTTP SSE传输: 通过HTTP长连接通信
   - 工具发现: `tools/list` 方法
   - 工具调用: `tools/call` 方法

2. **MCP工具注册**
   - MCP工具自动注册到ToolRegistry
   - 工具名格式: `mcp_{serverName}_{toolName}`
   - MCP工具的执行结果通过SSE流式返回

3. **MCP服务器管理API**
   ```
   GET    /api/agent/mcp/servers       列出MCP服务器
   POST   /api/agent/mcp/servers       添加MCP服务器
   PUT    /api/agent/mcp/servers/:id   更新MCP服务器
   DELETE /api/agent/mcp/servers/:id   删除MCP服务器
   POST   /api/agent/mcp/servers/:id/test  测试连接
   GET    /api/agent/mcp/servers/:id/tools 列出该服务器的工具
   ```

4. **前端MCP管理UI** (在Settings的Agent Tab中)
   - 添加服务器表单 (名称、传输方式、命令/URL)
   - 服务器列表 (状态、工具数、操作)
   - 测试连接按钮

---

### Phase 5: Skills系统

1. **Skill管理器** (`server/services/skill_manager.go`)
   - SKILL.md解析 (YAML frontmatter + Markdown正文)
   - Skills加载目录: `~/.newshell/skills/`
   - Skills → System Prompt注入 (在可用工具列表中展示)
   - Skills → Tool转换 (如果Skill定义了命令模板，转换为可调用工具)

2. **ClawHub集成**
   - 通过npm/npx安装: `npx clawhub@latest install {skill-slug}`
   - 或直接HTTP下载SKILL.md和相关文件
   - 安装到 `~/.newshell/skills/{skill-name}/`

3. **Skills管理API**
   ```
   GET    /api/agent/skills              列出已安装Skills
   GET    /api/agent/skills/:name        获取Skill详情
   POST   /api/agent/skills/install      安装Skill (从ClawHub)
   DELETE /api/agent/skills/:name        卸载Skill
   PUT    /api/agent/skills/:name/toggle 启用/禁用Skill
   ```

4. **前端Skills管理UI**
   - 已安装列表
   - 从ClawHub搜索/安装
   - 启用/禁用开关
   - 卸载按钮

---

## 三、数据库Schema (完整)

```sql
-- 现有表保持不变
-- connections, users, ai_config, sync_state

-- Agent配置
CREATE TABLE IF NOT EXISTS agent_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    max_iterations INTEGER DEFAULT 10,
    default_timeout INTEGER DEFAULT 60,
    smart_timeout BOOLEAN DEFAULT 1,
    confirm_mode TEXT DEFAULT 'dangerous',  -- 'all' | 'dangerous' | 'none'
    dangerous_commands TEXT DEFAULT '["rm -rf","shutdown","reboot","mkfs","dd"]',
    dangerous_commands_custom TEXT DEFAULT '[]',
    history_mode TEXT DEFAULT 'persistent',  -- 'persistent' | 'session'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent会话
CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    conn_id TEXT,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conn_id) REFERENCES connections(id) ON DELETE SET NULL
);

-- Agent消息
CREATE TABLE IF NOT EXISTS agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,  -- 'user' | 'assistant' | 'tool' | 'system'
    content TEXT,
    tool_calls TEXT,     -- JSON: 工具调用信息
    tool_call_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

-- MCP服务器
CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL,  -- 'stdio' | 'http'
    command TEXT,             -- stdio: 启动命令
    args TEXT,                -- stdio: 命令参数 (JSON数组)
    url TEXT,                 -- http: 服务URL
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Skills
CREATE TABLE IF NOT EXISTS skills (
    name TEXT PRIMARY KEY,
    description TEXT,
    version TEXT,
    source TEXT DEFAULT 'local',  -- 'local' | 'clawhub'
    path TEXT,
    enabled BOOLEAN DEFAULT 1,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 四、System Prompt模板

```
你是 VibeCoding Shell 的 AI 运维Agent。你可以使用工具来帮助用户管理服务器。

## 当前上下文
- 目标服务器: {{.ServerName}} ({{.ServerIP}})
- 操作系统: {{.OS}}
- 当前用户: {{.User}}
- 工作目录: {{.WorkingDir}}

## 可用工具
{{range .Tools}}
### {{.Name}}
{{.Description}}
参数:
{{range $name, $param := .Parameters}}  - {{$name}} ({{$param.Type}}): {{$param.Description}}{{if $param.Required}} [必填]{{end}}
{{end}}
{{end}}

{{if .Skills}}
## 可用Skills (工作流模板)
{{range .Skills}}
- **{{.Name}}**: {{.Description}}
{{end}}
{{end}}

## 执行规则
1. 仔细分析用户需求，制定执行计划
2. 每次调用一个工具，观察结果后再决定下一步
3. 执行危险操作前必须向用户解释原因
4. 如果命令执行失败，分析错误信息并尝试修复
5. 任务完成后给出结构化的总结

## 安全规则
- 绝对不要执行 rm -rf / 等极端危险命令
- 修改系统配置前先备份原文件
- 使用sudo时说明原因
- 敏感信息(密码等)不要在输出中明文显示

## 输出格式
- 工具调用时: 简洁说明目的 (一句话)
- 执行失败时: 分析原因并给出修复建议
- 最终总结: 使用结构化格式，包含关键发现和建议操作
```

## 五、完整API一览

```
-- Agent核心 --
POST   /api/agent/chat                          # Agent对话 (SSE)
POST   /api/agent/confirm                       # 确认命令执行
POST   /api/agent/cancel                        # 取消执行
POST   /api/agent/input                         # 提交用户输入

-- Agent配置 --
GET    /api/agent/config                        # 获取配置
PUT    /api/agent/config                        # 更新配置

-- Agent会话 --
GET    /api/agent/sessions                      # 会话列表
GET    /api/agent/sessions/:id                  # 会话详情
DELETE /api/agent/sessions/:id                  # 删除会话
GET    /api/agent/sessions/:id/messages         # 消息列表 (分页)

-- MCP管理 --
GET    /api/agent/mcp/servers                   # 列出MCP服务器
POST   /api/agent/mcp/servers                   # 添加MCP服务器
PUT    /api/agent/mcp/servers/:id               # 更新
DELETE /api/agent/mcp/servers/:id               # 删除
POST   /api/agent/mcp/servers/:id/test          # 测试连接
GET    /api/agent/mcp/servers/:id/tools         # 列出工具

-- Skills管理 --
GET    /api/agent/skills                        # 列出Skills
POST   /api/agent/skills/install                # 安装Skill
DELETE /api/agent/skills/:name                  # 卸载Skill
PUT    /api/agent/skills/:name/toggle           # 启用/禁用

-- WebSocket --
WS     /ws/agent-terminal/:sessionId            # Agent终端输出
```

---

以上是完整的执行方案，涵盖架构、流程、数据结构、API、UI设计的所有细节。你确认后我将按 Phase 1→5 顺序开始实现。有什么需要调整的吗？