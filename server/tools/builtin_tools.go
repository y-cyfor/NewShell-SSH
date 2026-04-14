package tools

import (
	"context"
	"fmt"
)

// getSystemInfoTool retrieves system information from the target server
var getSystemInfoTool = Tool{
	Name:        "get_system_info",
	Description: "获取服务器系统信息，包括CPU、内存、磁盘、网络等",
	Category:    "builtin",
	Parameters:  map[string]ToolParam{},
	Handler: func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
		cmd := `echo "=== 系统信息 ===" && uname -a && echo "" && \
echo "=== 主机名 ===" && hostname && echo "" && \
echo "=== 运行时间 ===" && uptime && echo "" && \
echo "=== CPU信息 ===" && lscpu 2>/dev/null || cat /proc/cpuinfo | grep "model name" | head -1 && echo "" && \
echo "=== 内存使用 ===" && free -h && echo "" && \
echo "=== 磁盘使用 ===" && df -h && echo "" && \
echo "=== 网络接口 ===" && ip addr 2>/dev/null || ifconfig && echo "" && \
echo "=== 负载平均值 ===" && cat /proc/loadavg`

		if execCtx.WSBroadcast != nil {
			execCtx.WSBroadcast("\r\n\x1b[33m$ 获取系统信息\x1b[0m\r\n")
		}

		return ExecuteSSHCommand(ctx, execCtx.ConnID, cmd, "", execCtx)
	},
}

// searchFilesTool searches for files on the target server
var searchFilesTool = Tool{
	Name:        "search_files",
	Description: "按名称或内容搜索文件",
	Category:    "builtin",
	Parameters: map[string]ToolParam{
		"pattern": {
			Type:        "string",
			Description: "搜索模式(文件名或内容关键词)",
			Required:    true,
		},
		"path": {
			Type:        "string",
			Description: "搜索目录(默认当前目录)",
			Required:    false,
		},
		"type": {
			Type:        "string",
			Description: "搜索类型: name|content",
			Required:    false,
			Enum:        []string{"name", "content"},
		},
		"max_depth": {
			Type:        "integer",
			Description: "最大搜索深度",
			Required:    false,
		},
		"file_pattern": {
			Type:        "string",
			Description: "文件名过滤(如 *.log)",
			Required:    false,
		},
	},
	Handler: func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
		pattern := params["pattern"].(string)
		searchPath := "."
		if p, ok := params["path"].(string); ok && p != "" {
			searchPath = p
		}
		searchType := "name"
		if t, ok := params["type"].(string); ok && t != "" {
			searchType = t
		}

		var cmd string
		if searchType == "content" {
			cmd = fmt.Sprintf("grep -rn --include='*' '%s' '%s' 2>/dev/null | head -100", pattern, searchPath)
		} else {
			maxDepth := ""
			if md, ok := params["max_depth"].(float64); ok {
				maxDepth = fmt.Sprintf(" -maxdepth %d", int(md))
			}
			cmd = fmt.Sprintf("find '%s'%s -name '*%s*' 2>/dev/null | head -50", searchPath, maxDepth, pattern)
		}

		if filePattern, ok := params["file_pattern"].(string); ok && filePattern != "" && searchType == "content" {
			cmd = fmt.Sprintf("grep -rn --include='%s' '%s' '%s' 2>/dev/null | head -100", filePattern, pattern, searchPath)
		}

		if execCtx.WSBroadcast != nil {
			execCtx.WSBroadcast(fmt.Sprintf("\r\n\x1b[33m$ 搜索: %s in %s\x1b[0m\r\n", pattern, searchPath))
		}

		return ExecuteSSHCommand(ctx, execCtx.ConnID, cmd, "", execCtx)
	},
}
