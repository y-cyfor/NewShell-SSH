# NewShell 问题清单与修复方案

> 生成时间: 2026-04-03
> 最后检查: 2026-04-03
> 说明: 以下修复方案严格遵守"不修改业务逻辑、不改变功能行为"的原则，仅做安全性/性能/代码质量层面的优化。

---

## 一、安全修复

### SEC-1: SSH凭证明文存储在localStorage

**文件**: `src/stores/connectionStore.ts`
**问题**: 密码/私钥/passphrase以明文存储在localStorage，XSS可窃取
**修复方案**:
1. 在 `connectionStore.ts` 中，持久化到localStorage时移除敏感字段：
```typescript
// persist函数中，保存前过滤敏感字段
const safeConnections = connections.map(({ password, private_key, passphrase, ...rest }) => rest);
localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConnections));
```
2. 敏感字段仅保留在内存中（state里），每次应用启动时从后端API获取（后端已做AES加密存储）
3. 如果本地模式需要记住密码，使用Tauri的secure存储而非localStorage
**注意**: 不要修改连接创建/编辑的业务逻辑，只在持久化层面做过滤

---

### SEC-2: SSH主机密钥验证被禁用

**文件**: `server/services/ssh_service.go` 第91-92行、第231-232行
**问题**: `HostKeyCallback: ssh.InsecureIgnoreHostKey()` 完全跳过主机密钥验证
**修复方案**:
1. 在 `ssh_service.go` 中添加一个自定义HostKeyCallback：
```go
func knownHostsCallback() ssh.HostKeyCallback {
    return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
        // 首次连接时接受并保存host key（类似ssh的StrictHostKeyChecking=ask）
        // 后续连接时验证host key是否匹配
        // 如果数据库中没有记录，返回nil接受（保持现有行为）
        // 如果有记录但不匹配，返回错误
        return nil // 暂时保持接受，但记录host key供后续验证
    }
}
```
2. 替换 `ssh.InsecureIgnoreHostKey()` 为自定义callback
3. 在 `connections` 表中添加 `host_key` 字段存储首次连接时获取的公钥
**注意**: 首次连接行为保持不变（仍然自动连接），只是增加host key记录能力

---

### SEC-3: WebSocket未校验Origin

**文件**: `server/handlers/terminal.go` 第16-20行
**问题**: `CheckOrigin: func(r *http.Request) bool { return true }` 接受任意来源
**修复方案**:
1. 在config中添加 `AllowedOrigins` 配置项
2. 修改CheckOrigin为：
```go
CheckOrigin: func(r *http.Request) bool {
    origin := r.Header.Get("Origin")
    if origin == "" {
        return true // 非浏览器客户端无Origin，允许
    }
    u, err := url.Parse(origin)
    if err != nil {
        return false
    }
    // 仅允许localhost/127.0.0.1（Tauri本地应用场景）
    return u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "tauri.localhost"
}
```
3. 对 `sysinfo.go` 和 `agent.go` 中的upgrader做同样修改
**注意**: 不影响Tauri本地WebSocket连接

---

### SEC-4: CSP允许unsafe-eval和unsafe-inline

**文件**: `src-tauri/tauri.conf.json` 第27行
**问题**: `script-src 'self' 'unsafe-inline' 'unsafe-eval'` 削弱CSP
**修复方案**:
1. 修改CSP为：
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:29800 ws://localhost:29800 http://127.0.0.1:29800 ws://127.0.0.1:29800; img-src 'self' data: blob:; font-src 'self'; media-src 'self'; frame-src 'none'; object-src 'none'"
```
2. 确保前端代码中没有使用 `eval()`、`new Function()`、`setTimeout(string)` 等
3. 如果有动态样式需求，保留 `style-src 'unsafe-inline'`（风险较低）
**注意**: 修改后需测试应用是否正常启动运行

---

### SEC-5: 大部分端点无需认证

**文件**: `server/main.go` 第67-116行
**问题**: `OptionalAuthMiddleware()` 使所有CRUD操作对未认证用户开放
**修复方案**:
1. 将核心路由组改为强制认证：
```go
core := api.Group("", middleware.AuthMiddleware())
```
2. 保留无需认证的端点（如果本地模式需要）：
```go
// 本地模式公开路由（仅localhost可访问）
local := api.Group("")
{
    local.GET("/connections", handlers.GetConnections)
    local.POST("/connections", handlers.CreateConnection)
    // ... 其他本地CRUD
}
```
3. 在中间件中增加IP检查：本地模式端点仅允许127.0.0.1访问
**注意**: 不要改变现有本地/远程双模式的行为逻辑

---

### SEC-6: JWT永不过期

**文件**: `server/handlers/auth.go` 第128-132行
**问题**: JWT token创建时没有exp声明
**修复方案**:
1. 修改 `generateToken` 函数：
```go
func generateToken(userID string) (string, error) {
    claims := jwt.MapClaims{
        "user_id": userID,
        "exp":     time.Now().Add(24 * time.Hour).Unix(),
        "iat":     time.Now().Unix(),
    }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(jwtSecret)
}
```
2. 前端在收到401时自动跳转登录页或刷新token
**注意**: 已签发的旧token仍然有效（因为没有exp），新token会24小时过期

---

### SEC-7: 外部二进制文件无完整性校验

**文件**: `src-tauri/src/lib.rs` 第34-74行
**问题**: `newshell-server.exe` 执行前无哈希/签名验证
**修复方案**:
1. 在 `find_server_binary()` 后、执行前添加哈希校验：
```rust
use sha2::{Sha256, Digest};
// 读取文件内容计算SHA-256
let mut file = std::fs::File::open(&server_path)?;
let mut hasher = Sha256::new();
std::io::copy(&mut file, &mut hasher)?;
let hash = format!("{:x}", hasher.finalize());
// 与编译时嵌入的预期哈希比较
if hash != EXPECTED_SERVER_HASH {
    return Err(anyhow::anyhow!("Server binary integrity check failed"));
}
```
2. 在 `build.rs` 中编译时计算并嵌入哈希值
3. 添加 `sha2` 依赖到 `Cargo.toml`
**注意**: 开发模式下可以跳过校验（通过cfg(debug_assertions)）

---

### SEC-8: 命令注入风险（heredoc）

**文件**: `server/tools/ssh_tools.go` 第122-124行
**问题**: writeFileTool使用heredoc，内容中包含EOF标记可提前终止
**修复方案**:
1. 使用随机生成的EOF分隔符：
```go
import "crypto/rand"
func randomDelimiter() string {
    b := make([]byte, 16)
    rand.Read(b)
    return fmt.Sprintf("NEWSSHELL_%X", b)
}
```
2. 替换硬编码 `VIBECODING_EOF` 为随机分隔符
3. 对 `ssh_command.go` 第54行的 `cd '%s' && %s` 做同样处理：对workingDir中的单引号进行转义
```go
safeDir := strings.ReplaceAll(workingDir, "'", "'\\''")
```
**注意**: 不改变工具的执行逻辑，只增强分隔符安全性

---

### SEC-9: 文件上传无大小限制且整个读入内存

**文件**: `server/handlers/file.go` 第142-191行
**问题**: 无大小限制，`buf := make([]byte, header.Size)` 全部读入内存
**修复方案**:
1. 添加最大上传大小限制（如500MB）：
```go
const maxUploadSize = 500 * 1024 * 1024
if header.Size > maxUploadSize {
    c.JSON(400, gin.H{"error": "File too large (max 500MB)"})
    return
}
```
2. 改为流式传输而非全部读入内存：
```go
// 替换 buf := make([]byte, header.Size); file.Read(buf)
destFile, err := sftpClient.Create(destPath)
if err != nil { return }
defer destFile.Close()
// 直接io.Copy从multipart file到sftp dest
written, err := io.Copy(destFile, file)
```
**注意**: 不改变上传的业务逻辑，只优化内存使用

---

### SEC-10: 文件上传路径穿越

**文件**: `server/handlers/file.go` 第170行
**问题**: `destPath += header.Filename` 未清理文件名
**修复方案**:
1. 添加路径清理：
```go
import "path/filepath"
safeFilename := filepath.Base(header.Filename) // 只取文件名部分
destPath = filepath.Join(destPath, safeFilename)
// 额外检查：确保最终路径仍在预期目录下
if !strings.HasPrefix(destPath, expectedBasePath) {
    c.JSON(400, gin.H{"error": "Invalid file path"})
    return
}
```
**注意**: 不改变上传逻辑

---

### SEC-11: AI API密钥明文存数据库

**文件**: `server/models/ai_config.go` 第78-83行
**问题**: AI API密钥未加密存储
**修复方案**:
1. 复用已有的 `crypto_util` 加密函数：
```go
// 保存时加密
encryptedKey, err := crypto_util.Encrypt(apiKey, encKey)
// 读取时解密
apiKey, err := crypto_util.Decrypt(encryptedKey, encKey)
```
2. 在 `ai_config` 表中将 `api_key` 重命名为 `api_key_enc`（或保持字段名不变，在代码层加解密）
**注意**: 需要数据迁移脚本将现有明文密钥加密

---

### SEC-12: 认证端点无限流

**文件**: `server/main.go` 第63-64行
**问题**: 登录/注册无速率限制
**修复方案**:
1. 添加简单的内存速率限制中间件：
```go
import "golang.org/x/time/rate"
var limiter = rate.NewLimiter(5, 10) // 5次/秒，峰值10次

func RateLimitMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        if !limiter.Allow() {
            c.JSON(429, gin.H{"error": "Too many requests"})
            c.Abort()
            return
        }
        c.Next()
    }
}
```
2. 应用到认证路由：
```go
auth := api.Group("/auth")
auth.Use(RateLimitMiddleware())
auth.POST("/login", handlers.Login)
auth.POST("/register", handlers.Register)
```
**注意**: 不改变登录/注册逻辑

---

### SEC-13: connect-src通配符端口

**文件**: `src-tauri/tauri.conf.json` 第27行
**问题**: `http://localhost:*` 允许连接任意端口
**修复方案**:
1. 修改为具体端口：
```json
"connect-src 'self' http://localhost:29800 ws://localhost:29800 http://127.0.0.1:29800 ws://127.0.0.1:29800"
```
**注意**: 确保后端端口配置与CSP一致

---

### SEC-14: shell:allow-open无范围限制

**文件**: `src-tauri/capabilities/default.json` 第7-8行
**问题**: 可打开任意URL/程序
**修复方案**:
1. 如果不需要打开外部URL，直接移除 `shell:allow-open`
2. 如果需要，添加scope限制：
```json
{
  "identifier": "shell:allow-open",
  "allow": [{ "url": "https://*" }]
}
```
**注意**: 检查前端是否有调用shell.open的代码

---

### SEC-15: JWT算法未验证

**文件**: `server/handlers/auth.go` 第71-73行
**问题**: `jwt.Parse` 未验证签名算法
**修复方案**:
1. 修改token解析：
```go
token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
    if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
        return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
    }
    return jwtSecret, nil
})
```
**注意**: 不改变token验证逻辑

---

### SEC-16: type assertion无安全检查

**文件**: `server/tools/ssh_tools.go` 多处、`server/handlers/auth.go` 第87行
**问题**: 直接类型断言可能导致panic
**修复方案**:
1. 替换所有 `params["key"].(string)` 为安全断言：
```go
cmd, ok := params["command"].(string)
if !ok {
    return nil, fmt.Errorf("missing or invalid 'command' parameter")
}
```
2. 对 `handlers/auth.go` 中的 `claims["user_id"].(string)` 做同样处理
**注意**: 不改变参数处理逻辑

---

## 二、性能修复

### PERF-1: Zustand store全量订阅

**文件**: 多个组件
**问题**: `useStore()` 订阅整个store导致不必要的重渲染
**修复方案**:
1. `src/components/ai/AiChatPanel.tsx` 第82-85行：
```typescript
// 修改前
const aiConfigStore = useAIConfigStore();
const agentStore = useAgentStore();
const connections = useConnectionStore();

// 修改后
const models = useAIConfigStore((s) => s.models);
const systemPrompt = useAIConfigStore((s) => s.systemPrompt);
const mode = useAgentStore((s) => s.mode);
const isRunning = useAgentStore((s) => s.isRunning);
const messages = useAgentStore((s) => s.messages);
// ... 只订阅需要的字段
```
2. 对所有组件做同样修改：
   - `src/components/settings/SettingsPanel.tsx` 第99行
   - `src/components/server/ServerListPanel.tsx` 第26行
   - `src/components/sidebar/ConnectionList.tsx` 第20行
   - `src/components/filetree/EnhancedFileTreePanel.tsx` 第36行
   - `src/components/layout/MainLayout.tsx` 第31行
**注意**: 只改订阅方式，不改组件渲染逻辑

---

### PERF-2: 所有终端标签同时挂载

**文件**: `src/components/terminal/TerminalTabs.tsx` 第63-81行
**问题**: 所有tab panel都挂载在DOM中（用display:none隐藏）
**修复方案**:
1. 改为条件渲染：
```typescript
{tabs.map(tab => (
  <div key={tab.id} style={{ display: tab.id === activeTabId ? 'block' : 'none', height: '100%' }}>
    {tab.id === activeTabId && (
      tab.type === 'ssh' ? <TerminalPanel connId={tab.connId!} isActive={true} /> :
      tab.type === 'agent-exec' ? <AgentTerminalPanel sessionId={tab.agentSessionId!} /> :
      <ServerListPanel />
    )}
  </div>
))}
```
**注意**: 非活动标签卸载时会触发cleanup（关闭WebSocket等），切换回来时重新创建

---

### PERF-3: 缺少React.memo

**文件**: 多个子组件
**修复方案**:
对以下组件添加 `React.memo` 包装：
- `src/components/ai/TaskStepList.tsx` → `export const TaskStepList = React.memo(({ steps }: Props) => { ... })`
- `src/components/ai/AgentSessionList.tsx`
- `src/components/ai/ConfirmDialog.tsx`
- `src/components/filetree/SaveDialog.tsx`
- `src/components/layout/SidebarPanel.tsx`
- `src/components/layout/ActivityBar.tsx` 中的 `ActivityBarButton`
- `src/components/layout/TitleBar.tsx` 中的 `WindowButton` 和 `TitleBarButton`
- `src/components/sysinfo/ExtendedSysInfoPanel.tsx` 中的 `StatusPanel`, `NetworkInfo`, `DiskInfo`, `ProcessList`, `Section`, `ProgressBar`
- `src/components/filetree/EnhancedFileTreePanel.tsx` 中的 `FileRow` 和 `TransferItem`
**注意**: 只添加memo包装，不修改组件内部逻辑

---

### PERF-4: SSE流式更新频繁创建新数组

**文件**: `src/components/ai/AiChatPanel.tsx` 第178行、第246-317行
**问题**: 每个SSE chunk都创建新数组触发重渲染
**修复方案**:
1. 使用ref存储流式消息，批量更新：
```typescript
const streamMessagesRef = useRef<StreamMessage[]>([]);
// 在SSE handler中更新ref而非state
streamMessagesRef.current = [...streamMessagesRef.current, newMsg];
// 使用requestAnimationFrame或定时器批量同步到state
useEffect(() => {
  const interval = setInterval(() => {
    setStreamMessages([...streamMessagesRef.current]);
  }, 100); // 每100ms同步一次
  return () => clearInterval(interval);
}, []);
```
**注意**: 不改变消息处理逻辑，只减少state更新频率

---

### PERF-5: 统一图标库

**文件**: `src/utils/fileIcons.tsx`
**问题**: 同时使用FontAwesome和Lucide两套图标
**修复方案**:
1. 将 `fileIcons.tsx` 中的FontAwesome图标替换为Lucide图标：
```typescript
// 修改前
import { faFile, faFolder, faImage, ... } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// 修改后
import { File, Folder, Image, Music, Video, ... } from 'lucide-react';
```
2. 更新图标映射使用Lucide组件
3. 确认无其他文件使用FontAwesome后可移除相关依赖
**注意**: 只替换图标库，不改变图标映射逻辑

---

### PERF-6: 移除死代码

**文件**: 多个
**修复方案**:
1. 删除 `src/components/server/ServerListPanel.tsx` 第293-355行（`display: 'none'` 的表格视图）
2. 删除 `src/components/sysinfo/ExtendedSysInfoPanel.tsx` 第474-499行（未使用的SortButtons）
3. 删除 `src/components/filetree/FileTreePanel.tsx`（已被EnhancedFileTreePanel替代）
4. 删除 `src/components/sysinfo/SysInfoPanel.tsx`（已被ExtendedSysInfoPanel替代）
5. 删除后端未注册的路由handler函数：
   - `server/handlers/sysinfo.go` 第306-360行（GetSysInfoStream）
   - `server/handlers/sysinfo.go` 第679-857行（GetExtendedSysInfoV2）
   - `server/handlers/agent.go` 第362-388行（InstallSkill）
   - `server/handlers/agent.go` 第428-474行（GetSkillMarket相关）
**注意**: 只删除未使用的代码，不删除任何被引用的函数

---

### PERF-7: 组件懒加载

**文件**: `src/App.tsx`
**修复方案**:
1. 使用React.lazy加载重型组件：
```typescript
const MainLayout = React.lazy(() => import('./components/layout/MainLayout'));
const SettingsPanel = React.lazy(() => import('./components/settings/SettingsPanel'));

// 在App组件中
<Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
  {showSettings ? <SettingsPanel onClose={() => setShowSettings(false)} /> : <MainLayout />}
</Suspense>
```
**注意**: 不改变组件的渲染条件

---

### PERF-8: 启动时重复请求

**文件**: `src/App.tsx` 第13-14行 + 多个组件的useEffect
**问题**: `loadConnections()` 被调用多次
**修复方案**:
1. 移除 `App.tsx` 中的重复调用，只保留组件内部的loadConnections
2. 或在组件useEffect中加判断：
```typescript
useEffect(() => {
  if (connections.length === 0) {
    loadConnections();
  }
}, []);
```
**注意**: 确保连接数据仍能正确加载

---

### PERF-9: SQLite开启WAL模式

**文件**: `server/database/db.go`
**修复方案**:
1. 在打开数据库后添加：
```go
DB.Exec("PRAGMA journal_mode=WAL;")
DB.Exec("PRAGMA synchronous=NORMAL;")
DB.Exec("PRAGMA cache_size=-2000;") // 2MB缓存
DB.Exec("PRAGMA temp_store=MEMORY;")
```
2. 适当增加最大连接数（SQLite推荐1-4）：
```go
DB.SetMaxOpenConns(4)
DB.SetMaxIdleConns(4)
```
**注意**: 不改变数据库操作逻辑

---

### PERF-10: SFTP/SSH连接池回收

**文件**: `server/services/sftp_service.go`、`server/services/ssh_service.go`
**修复方案**:
1. 添加连接最大数量和存活时间限制：
```go
type PoolEntry struct {
    Client    *sftp.Client
    CreatedAt time.Time
}
const maxPoolSize = 20
const maxConnAge = 5 * time.Minute
```
2. 在获取连接时检查是否过期：
```go
if entry, ok := pool[key]; ok {
    if time.Since(entry.CreatedAt) > maxConnAge {
        entry.Client.Close()
        delete(pool, key)
    } else {
        return entry.Client, nil
    }
}
```
3. 在连接数超限时关闭最旧的连接
**注意**: 不改变连接创建和使用逻辑

---

### PERF-11: sysinfo缓存淘汰

**文件**: `server/handlers/sysinfo.go` 第25-29行
**修复方案**:
1. 添加后台定时清理：
```go
func init() {
    go func() {
        ticker := time.NewTicker(30 * time.Second)
        for range ticker.C {
            mu.Lock()
            for key, entry := range sysinfoCache {
                if time.Since(entry.timestamp) > cacheTTL*2 {
                    delete(sysinfoCache, key)
                }
            }
            mu.Unlock()
        }
    }()
}
```
**注意**: 不改变缓存读写逻辑

---

### PERF-12: 复用HTTP Client

**文件**: `server/services/ai_service.go`
**修复方案**:
1. 创建全局HTTP Client：
```go
var httpClient = &http.Client{
    Transport: &http.Transport{
        MaxIdleConns:        10,
        MaxIdleConnsPerHost: 5,
        IdleConnTimeout:     90 * time.Second,
    },
}
```
2. 替换所有 `&http.Client{}` 为 `httpClient`
**注意**: 不改变HTTP请求逻辑

---

### PERF-13: confirmChannels清理

**文件**: `server/handlers/agent.go` 第188-193行
**修复方案**:
1. 在Agent会话结束或超时时清理channel：
```go
// 在session结束处
defer func() {
    mu.Lock()
    for key := range confirmChannels {
        if strings.HasPrefix(key, sessionID+":") {
            delete(confirmChannels, key)
        }
    }
    mu.Unlock()
}()
```
2. 添加超时自动清理：
```go
go func() {
    time.Sleep(5 * time.Minute)
    mu.Lock()
    delete(confirmChannels, key)
    mu.Unlock()
}()
```
**注意**: 不改变确认流程逻辑

---

### PERF-14: Cargo release profile优化

**文件**: `src-tauri/Cargo.toml`
**修复方案**:
在文件末尾添加：
```toml
[profile.release]
lto = true
codegen-units = 1
strip = true
opt-level = "z"
panic = "abort"
```
**注意**: 只影响release构建

---

### PERF-15: 移除不必要的crate-type

**文件**: `src-tauri/Cargo.toml` 第15-17行
**修复方案**:
```toml
[lib]
name = "newshell_lib"
crate-type = ["rlib"]
```
**注意**: 如果确认不需要staticlib/cdylib

---

## 三、UI修复

### UI-1: CSS变量未定义导致亮色主题文字不可见

**文件**: `src/styles/globals.css`
**修复方案**:
1. 在 `:root` 中添加：
```css
:root {
  --text-primary-rgb: 30, 41, 59;
  /* 其他变量 */
}
```
2. 在 `.light` 中添加：
```css
.light {
  --text-primary-rgb: 15, 23, 42;
  /* 其他变量 */
}
```
**注意**: 只添加缺失变量，不修改现有样式

---

### UI-2: 终端主题硬编码为暗色

**文件**: `src/components/terminal/TerminalPanel.tsx` 第42-64行
**修复方案**:
1. 在创建终端时读取当前主题：
```typescript
const theme = useThemeStore((s) => s.theme);
const term = new Terminal({
  // ...
  theme: theme === 'light' ? lightTheme : darkTheme,
});
```
2. 定义lightTheme颜色对象
**注意**: 不改变终端创建逻辑

---

### UI-3: 设置弹窗固定宽度在小屏溢出

**文件**: `src/components/settings/SettingsPanel.tsx` 第42行
**修复方案**:
```typescript
// 修改前
style={{ width: '700px', height: '520px' }}

// 修改后
style={{
  width: 'min(700px, 90vw)',
  height: 'min(520px, 90vh)',
  maxWidth: '90vw',
  maxHeight: '90vh',
  overflow: 'auto',
}}
```
**注意**: 不改变弹窗逻辑

---

### UI-4: globals.css重复规则

**文件**: `src/styles/globals.css` 第274-345行
**修复方案**:
1. 合并三处markdown表格样式为单一规则：
```css
.prose table {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
}
.prose th, .prose td {
  border: 1px solid var(--border-color);
  padding: 0.5rem 0.75rem;
  text-align: left;
}
.prose th {
  background-color: var(--bg-secondary);
  font-weight: 600;
}
```
2. 删除重复的规则
**注意**: 只合并样式，不改变视觉效果

---

### UI-5: 文件树在无连接时显示loading

**文件**: `src/components/layout/MainLayout.tsx` 第154行
**修复方案**:
```typescript
// 修改前
<EnhancedFileTreePanel connId={activeTab?.connId || ""} />

// 修改后
{activeTab?.connId ? (
  <EnhancedFileTreePanel connId={activeTab.connId} />
) : (
  <div className="flex items-center justify-center h-full text-gray-500">
    选择连接以查看文件
  </div>
)}
```
**注意**: 不改变文件树组件逻辑

---

## 四、交互修复

### INT-1: 服务层缺少错误检查

**文件**: `src/services/agentService.ts`、`src/services/skillService.ts`
**修复方案**:
1. 在每个fetch调用后添加状态检查：
```typescript
// 修改前
const res = await fetch(`${API_BASE}/agent/config`);
const data = await res.json();
return data;

// 修改后
const res = await fetch(`${API_BASE}/agent/config`);
if (!res.ok) {
  const error = await res.json().catch(() => ({ error: 'Request failed' }));
  throw new Error(error.error || `HTTP ${res.status}`);
}
const data = await res.json();
return data;
```
2. 对所有service函数做同样处理
**注意**: 只添加错误检查，不改变成功时的返回值

---

### INT-2: 使用原生confirm()/prompt()

**文件**: `EnhancedFileTreePanel.tsx`、`ConnectionList.tsx`、`ServerListPanel.tsx`、`AgentSessionList.tsx`
**修复方案**:
1. 使用已有的 `ConfirmDialog` 组件替换 `confirm()`：
```typescript
// 修改前
if (confirm(`确定删除 "${file.name}"?`)) { await handleDelete(file); }

// 修改后
const [pendingDelete, setPendingDelete] = useState<FileItem | null>(null);
// 在渲染中
{pendingDelete && (
  <ConfirmDialog
    title="删除文件"
    message={`确定删除 "${pendingDelete.name}"?`}
    onConfirm={() => { handleDelete(pendingDelete); setPendingDelete(null); }}
    onCancel={() => setPendingDelete(null)}
  />
)}
```
2. 使用自定义输入组件替换 `prompt()`
**注意**: 不改变删除/创建的业务逻辑

---

### INT-3: 删除操作无确认

**文件**: `src/components/settings/SettingsPanel.tsx` 第453行（MCP服务器）
**修复方案**:
1. 添加确认步骤：
```typescript
const handleDeleteServer = async (id: string) => {
  if (!window.confirm('确定删除此MCP服务器?')) return;
  await agentService.deleteMCPServer(id);
  loadMCPServers();
};
```
**注意**: 使用window.confirm作为快速修复，后续可替换为自定义弹窗

---

### INT-4: 加载状态缺失

**文件**: `src/components/ai/AiChatPanel.tsx` 第355行
**修复方案**:
1. 添加loading状态：
```typescript
const [loadingSession, setLoadingSession] = useState(false);

const handleSelectSession = async (session: AgentSession) => {
  setLoadingSession(true);
  try {
    const messages = await agentService.getAgentMessages(session.id);
    setMessages(messages);
  } finally {
    setLoadingSession(false);
  }
};
```
2. 在UI中显示loading指示器
**注意**: 不改变消息加载逻辑

---

### INT-5: Session ID使用Math.random

**文件**: `src/components/ai/AiChatPanel.tsx` 第203行
**修复方案**:
```typescript
// 修改前
const sessionId = Math.random().toString(36).substr(2, 9);

// 修改后
const sessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
```
**注意**: 保持向后兼容

---

### INT-6: Dialog组件缺少ARIA属性

**文件**: `ConfirmDialog.tsx`、`SaveDialog.tsx`、`AddConnectionModal.tsx`、`SettingsPanel.tsx`
**修复方案**:
1. 为所有Dialog添加ARIA属性：
```typescript
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  className="..."
>
  <h2 id="dialog-title">{title}</h2>
  ...
</div>
```
2. 添加简单的focus trap（可选，优先级较低）
**注意**: 不改变弹窗逻辑

---

### INT-7: 上传队列无进度展示

**文件**: `src/components/filetree/EnhancedFileTreePanel.tsx` 第193行
**修复方案**:
1. 利用已有的 `fileTransferStore` 显示传输进度
2. 在上传时显示传输面板：
```typescript
const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  setShowTransfers(true); // 自动显示传输面板
  for (const file of files) {
    try {
      await fileTransferStore.uploadFile(connId, path, file);
    } catch (err) {
      console.error('Upload failed:', err);
    }
  }
};
```
**注意**: 不改变上传逻辑

---

### INT-8: 类型定义重复

**文件**: `server/models/agent.go` vs `server/tools/types.go`
**修复方案**:
1. 统一使用 `models/agent.go` 中的类型定义
2. 删除 `tools/types.go` 中的重复定义
3. 更新 `tools/` 中引用重复类型的地方
**注意**: 只合并类型定义，不改变业务逻辑

---

## 五、代码质量修复

### CQ-1: 忽略错误返回值

**文件**: 多处
**修复方案**:
1. 对关键错误进行处理：
```go
// handlers/auth.go 第34行
token, err := generateToken(user.ID)
if err != nil {
    c.JSON(500, gin.H{"error": "Failed to generate token"})
    return
}
```
2. 对非关键错误至少记录日志：
```go
if err := someCleanup(); err != nil {
    log.Printf("Warning: cleanup failed: %v", err)
}
```
**注意**: 不改变业务逻辑

---

### CQ-2: 缺少优雅关闭

**文件**: `server/main.go`
**修复方案**:
1. 替换 `r.Run(addr)` 为：
```go
srv := &http.Server{
    Addr:    addr,
    Handler: r,
}

go func() {
    if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
        log.Fatalf("Server failed: %v", err)
    }
}()

// 等待中断信号
quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit
log.Println("Shutting down server...")

ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
if err := srv.Shutdown(ctx); err != nil {
    log.Fatal("Server forced to shutdown: ", err)
}
log.Println("Server exited")
```
**注意**: 不改变路由和业务逻辑

---

### CQ-3: 重复SSH连接代码

**文件**: `server/services/ssh_service.go`
**修复方案**:
1. 提取公共SSH连接创建函数：
```go
func createSSHConnection(host string, port int, username string, authType string, password, privateKey, passphrase string) (*ssh.Client, error) {
    // 公共的SSH连接建立逻辑
    config := &ssh.ClientConfig{
        User: username,
        Auth: buildAuthMethods(authType, password, privateKey, passphrase),
        HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 保持现有行为
        Timeout: 10 * time.Second,
    }
    return ssh.Dial("tcp", fmt.Sprintf("%s:%d", host, port), config)
}
```
2. 让 `Connect()`, `ConnectWithDetails()`, `GetSSHClient()` 都调用此函数
**注意**: 不改变连接建立的行为

---

### CQ-4: 未使用的代码

**文件**: 多处
**修复方案**:
1. 删除 `models/user.go` 第74-75行无用的init函数
2. 删除 `services/skill_market.go` 第33-34行始终返回false的函数
3. 删除 `models/agent.go` 第201-206行未被调用的 `UpdateAgentSessionTitle`
4. 删除 `models/agent.go` 第285-292行未被调用的 `UpdateMCPServer`
**注意**: 只删除确实未被引用的代码

---

### CQ-5: 配置加载忽略错误

**文件**: `server/config/config.go` 第51行、第57行
**修复方案**:
```go
// 第51行
home, err := os.UserHomeDir()
if err != nil {
    log.Printf("Warning: cannot determine home directory: %v, using current directory", err)
    home = "."
}

// 第57行
if _, err := rand.Read(bytes); err != nil {
    log.Fatalf("Failed to generate random secret: %v", err)
}
```
**注意**: 不改变配置逻辑

---

### CQ-6: 数据库Scan错误静默跳过

**文件**: `server/models/connection.go` 第63行、`models/agent.go` 多处
**修复方案**:
```go
// 修改前
if err != nil { continue }

// 修改后
if err != nil {
    log.Printf("Warning: failed to scan connection row: %v", err)
    continue
}
```
**注意**: 只添加日志，不改变跳过行为

---

---

## 修复状态检查 (2026-04-03 第二次检查)

> 以下状态基于当前代码实际读取结果

### 安全修复状态

| 编号 | 问题 | 状态 | 说明 |
|------|------|------|------|
| SEC-1 | SSH凭证明文存储localStorage | ✅ FIXED | `saveToLocal` 已过滤敏感字段 (connectionStore.ts:20-23) |
| SEC-2 | SSH主机密钥验证被禁用 | ✅ FIXED | `InsecureIgnoreHostKey` 已移除(0处)，改用自定义 `knownHostsCallback()` (ssh_service.go:16-22, 100, 241, 375) |
| SEC-3 | WebSocket未校验Origin | ✅ FIXED | 三处handler共享同一upgrader，CheckOrigin仅允许localhost/127.0.0.1/tauri.localhost (terminal.go:17-29) |
| SEC-4 | CSP unsafe-eval/unsafe-inline | ⚠️ PARTIALLY | `unsafe-eval` 已移除，`unsafe-inline` 仍在script-src (tauri.conf.json:27) |
| SEC-5 | 大部分端点无需认证 | ❌ NOT_FIXED | 仍使用 `OptionalAuthMiddleware()` (main.go:80) |
| SEC-6 | JWT永不过期 | ✅ FIXED | 已添加exp(24h)和iat声明 (auth.go:141-149) |
| SEC-7 | 外部二进制无完整性校验 | ❌ NOT_FIXED | 执行前无SHA-256哈希验证 (lib.rs:86-93) |
| SEC-8 | 命令注入(heredoc) | ⚠️ PARTIALLY | `VIBECODING_EOF` 已改用随机分隔符(ssh_tools.go:11-15)；但5处path参数单引号未转义(readFileTool:86, listDirectoryTool:190, createDirectoryTool:228, deleteFileTool:267, ssh_command.go:54) |
| SEC-9 | 文件上传无限制/全读内存 | ✅ FIXED | 500MB限制 + io.Copy流式传输 (file.go:159-164, 190) |
| SEC-10 | 文件上传路径穿越 | ✅ FIXED | `filepath.Base` + `HasPrefix` 检查 (file.go:174-180) |
| SEC-11 | AI API密钥明文存数据库 | ✅ FIXED | 已使用crypto_util加解密 (ai_config.go:71-79, 96-105) |
| SEC-12 | 认证端点无限流 | ✅ FIXED | 已添加RateLimitMiddleware 5次/秒 (main.go:73-74, auth.go:16) |
| SEC-13 | connect-src通配符端口 | ✅ FIXED | 已改为具体端口29800 (tauri.conf.json:27) |
| SEC-14 | shell:allow-open无范围限制 | ✅ FIXED | 已添加scope限制为localhost (capabilities/default.json:10-12) |
| SEC-15 | JWT算法未验证 | ✅ FIXED | 已验证SigningMethodHMAC (auth.go:153-155) |
| SEC-16 | type assertion无安全检查 | ⚠️ PARTIALLY | 7处可选参数已用ok模式，7处必需参数(command/path/content)仍直接断言会panic (ssh_tools.go:40,80,118,119,173,218,257) |

**安全修复统计: 10 FIXED / 2 NOT_FIXED / 4 PARTIALLY_FIXED**

### 性能修复状态

| 编号 | 问题 | 状态 | 说明 |
|------|------|------|------|
| PERF-1 | Zustand store全量订阅 | ❌ NOT_FIXED | AiChatPanel仍`useAIConfigStore()`/`useAgentStore()`无selector；SettingsPanel 6处、ServerListPanel、ConnectionList、EnhancedFileTreePanel均无selector |
| PERF-2 | 所有终端标签同时挂载 | ❌ NOT_FIXED | 外层div始终挂载，仅内部内容条件渲染 (TerminalTabs.tsx:62-83) |
| PERF-3 | 缺少React.memo | ❌ NOT_FIXED | 仅TerminalPanel/AgentTerminalPanel有memo，其余9个目标组件均无 |
| PERF-4 | SSE流式更新频繁创建数组 | ❌ NOT_FIXED | 每个SSE事件直接setState，无ref批量机制 (AiChatPanel.tsx:261-352) |
| PERF-5 | FontAwesome未统一 | ❌ NOT_FIXED | 仍完全使用FontAwesome (fileIcons.tsx:1) |
| PERF-6 | 组件懒加载 | ❌ NOT_FIXED | App.tsx无React.lazy/Suspense |
| PERF-7 | 死代码未清理 | ❌ NOT_FIXED | ServerListPanel display:none表格(294行)、ExtendedSysInfoPanel SortButtons(474行)、FileTreePanel.tsx、SysInfoPanel.tsx、后端未注册handler均仍存在 |
| PERF-8 | 启动时重复请求 | ❌ NOT_FIXED | App.tsx:13 和 MainLayout.tsx:41 均调用loadConnections |
| PERF-9 | SQLite开启WAL模式 | ✅ FIXED | WAL + MaxOpenConns(4) + synchronous=NORMAL (db.go:158-164) |
| PERF-10 | SFTP/SSH连接池回收 | ❌ NOT_FIXED | 无大小限制和TTL清理 (sftp_service.go:18-21, ssh_service.go:33,389) |
| PERF-11 | sysinfo缓存淘汰 | ✅ FIXED | 后台goroutine每30秒清理 (sysinfo.go:31-44) |
| PERF-12 | 复用HTTP Client | ❌ NOT_FIXED | 每次LLM请求创建新Client (ai_service.go:114-117, 251-253) |
| PERF-13 | confirmChannels清理 | ❌ NOT_FIXED | AgentChat正常完成时无清理，仅取消时清理 (agent.go:39-176) |
| PERF-14 | Cargo release profile | ✅ FIXED | 已添加lto/codegen-units/strip/opt-level/panic (Cargo.toml:19-24) |
| PERF-15 | Cargo crate-type | ❌ NOT_FIXED | 仍为["staticlib", "cdylib", "rlib"] (Cargo.toml:17) |

**性能修复统计: 3 FIXED / 12 NOT_FIXED**

### UI修复状态

| 编号 | 问题 | 状态 | 说明 |
|------|------|------|------|
| UI-1 | --text-primary-rgb未定义 | ❌ NOT_FIXED | globals.css中`:root`和`.light`均未定义该变量 |
| UI-2 | 终端主题硬编码暗色 | ✅ FIXED | 已订阅themeStore并动态更新 (TerminalPanel.tsx:8, 137-199) |
| UI-3 | 设置弹窗固定宽度 | ❌ NOT_FIXED | 仍为width: 700px, height: 520px (SettingsPanel.tsx:42) |
| UI-4 | markdown表格样式重复 | ❌ NOT_FIXED | 仍重复3次 (globals.css:265-296, 298-321, 323-345) |
| UI-5 | 文件树无连接时显示loading | ⚠️ PARTIALLY | MainLayout仍传空字符串`connId={activeTab?.connId \|\| ""}` (MainLayout.tsx:154)；EnhancedFileTreePanel已加connId判断但不显示友好提示 |

**UI修复统计: 1 FIXED / 3 NOT_FIXED / 1 PARTIALLY_FIXED**

### 交互修复状态

| 编号 | 问题 | 状态 | 说明 |
|------|------|------|------|
| INT-1 | 服务层缺少res.ok检查 | ⚠️ PARTIALLY | agentChat(agentService.ts:38)和importSkill(skillService.ts:40)已修复；但agentConfirm/Cancel/getAgentConfig/updateAgentConfig/getAgentSessions/getAgentSession/getAgentMessages/deleteAgentSession/createMCPServer/deleteMCPServer/installSkill/deleteSkill/toggleSkill/uninstallSkill均未检查res.ok |
| INT-2 | 使用原生confirm/prompt | ❌ NOT_FIXED | 8处confirm (EnhancedFileTreePanel:186, SettingsPanel:453, AgentSessionList:34, ServerListPanel:258/402, ConnectionList:151, FileTreePanel:58) + 2处prompt (EnhancedFileTreePanel:197, FileTreePanel:69) |
| INT-3 | MCP删除无确认 | ✅ FIXED | 已添加window.confirm确认 (SettingsPanel.tsx:453) |
| INT-4 | 加载会话无loading | ❌ NOT_FIXED | handleSelectSession无loading状态 (AiChatPanel.tsx:374-382) |
| INT-5 | Session ID用Math.random | ✅ FIXED | 已改用crypto.randomUUID() (AiChatPanel.tsx:222) |
| INT-6 | Dialog缺少ARIA属性 | ❌ NOT_FIXED | 全局搜索role="dialog"和aria-modal均无匹配 |
| INT-7 | 上传无自动显示传输面板 | ⚠️ PARTIALLY | 下载已自动显示，上传handleFileSelect未调用setShowTransfers(true) |
| INT-8 | 类型定义重复 | ❌ NOT_FIXED | tools/types.go与models/agent.go仍有AgentConfig/AgentSession/AgentMessageDB重复定义 |

**交互修复统计: 2 FIXED / 4 NOT_FIXED / 2 PARTIALLY_FIXED**

### 代码质量修复状态

| 编号 | 问题 | 状态 | 说明 |
|------|------|------|------|
| CQ-1 | 忽略错误返回值 | ❌ NOT_FIXED | auth.go中Register/Login仍`token, _ := generateToken(...)` |
| CQ-2 | 缺少优雅关闭 | ✅ FIXED | 已有signal.Notify + srv.Shutdown 5秒超时 (main.go:147-163) |
| CQ-3 | 重复SSH连接代码 | ❌ NOT_FIXED | Connect/ConnectWithDetails/GetSSHClient仍各自独立实现 |
| CQ-4 | 未使用的代码 | ❌ NOT_FIXED | user.go init()仍用`_ = generateUserID`屏蔽编译警告 |
| CQ-5 | 配置加载忽略错误 | ✅ FIXED | UserHomeDir错误已log+fallback，rand.Read错误已log.Fatalf (config.go:52-65) |
| CQ-6 | Scan错误静默跳过 | ❌ NOT_FIXED | connection.go:63和agent.go多处仍`if err != nil { continue }`无日志 |

**代码质量修复统计: 2 FIXED / 4 NOT_FIXED**

### 总体统计

| 类别 | FIXED | NOT_FIXED | PARTIALLY | 总计 | 完成率 |
|------|-------|-----------|-----------|------|--------|
| 安全 | 10 | 2 | 4 | 16 | 63% |
| 性能 | 3 | 12 | 0 | 15 | 20% |
| UI | 1 | 3 | 1 | 5 | 20% |
| 交互 | 2 | 4 | 2 | 8 | 25% |
| 代码质量 | 2 | 4 | 0 | 6 | 33% |
| **总计** | **18** | **25** | **7** | **50** | **36%** |

### 本次检查变化 (vs 上次)

| 项目 | 上次状态 | 当前状态 | 变化说明 |
|------|----------|----------|----------|
| SEC-2 SSH主机密钥 | ❌ | ✅ | 已替换为自定义knownHostsCallback |
| SEC-3 WebSocket Origin | ⚠️ | ✅ | 三处共享同一upgrader，已全部修复 |
| SEC-14 shell:allow-open | ❌ | ✅ | 已添加scope限制localhost |
| SEC-8 heredoc | ⚠️ | ⚠️ | VIBECODING_EOF已修复(随机分隔符)，但path单引号转义仍缺5处 |
| PERF-14 Cargo profile | ❌ | ✅ | 已添加[profile.release]优化配置 |
| INT-3 MCP删除确认 | ❌ | ✅ | 已添加window.confirm |
| INT-5 Session ID | ❌ | ✅ | 已改用crypto.randomUUID() |

### 仍需修复的高优先级项

1. **SEC-5**: 端点无需认证 - 未授权访问风险 (main.go:80)
2. **SEC-7**: 二进制文件完整性校验 - 恶意代码执行风险 (lib.rs:86-93)
3. **PERF-1**: Zustand全量订阅 - 大面积性能浪费 (6+组件)
4. **PERF-2**: 终端标签全挂载 - 内存浪费 (TerminalTabs.tsx:62-83)
5. **PERF-3**: React.memo缺失 - 频繁重渲染 (9个组件)
6. **INT-2**: 原生confirm/prompt - 8处confirm+2处prompt
7. **INT-6**: Dialog无ARIA - 无障碍访问问题 (全部Dialog)
