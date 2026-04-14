package tools

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"
)

// SEC-8: 随机分隔符防止heredoc注入
func randomDelimiter() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("NEWSSHELL_%X", b)
}

// executeCommandTool executes a shell command on the target server
var executeCommandTool = Tool{
	Name:        "execute_command",
	Description: "在目标服务器上执行shell命令并返回输出",
	Category:    "ssh",
	Parameters: map[string]ToolParam{
		"command": {
			Type:        "string",
			Description: "要执行的shell命令",
			Required:    true,
		},
		"working_dir": {
			Type:        "string",
			Description: "工作目录(可选)",
			Required:    false,
		},
		"timeout": {
			Type:        "integer",
			Description: "超时秒数(可选, 不指定则使用智能超时)",
			Required:    false,
		},
	},
	Handler: func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
		command := params["command"].(string)
		workingDir := ""
		if wd, ok := params["working_dir"].(string); ok && wd != "" {
			workingDir = wd
		}

		// Broadcast command to agent terminal
		if execCtx.WSBroadcast != nil {
			execCtx.WSBroadcast(fmt.Sprintf("\r\n\x1b[33m$ %s\x1b[0m\r\n", command))
		}

		// Use SSH executor from services package
		return ExecuteSSHCommand(ctx, execCtx.ConnID, command, workingDir, execCtx)
	},
}

// readFileTool reads file content from the target server
var readFileTool = Tool{
	Name:        "read_file",
	Description: "读取服务器上文件的内容",
	Category:    "ssh",
	Parameters: map[string]ToolParam{
		"path": {
			Type:        "string",
			Description: "文件路径",
			Required:    true,
		},
		"encoding": {
			Type:        "string",
			Description: "编码(默认utf-8)",
			Required:    false,
			Enum:        []string{"utf-8", "gbk", "latin1"},
		},
		"max_lines": {
			Type:        "integer",
			Description: "最大行数(默认500)",
			Required:    false,
		},
	},
	Handler: func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
		path := params["path"].(string)
		maxLines := 500
		if ml, ok := params["max_lines"].(float64); ok {
			maxLines = int(ml)
		}

		cmd := fmt.Sprintf("head -n %d '%s'", maxLines, path)
		if execCtx.WSBroadcast != nil {
			execCtx.WSBroadcast(fmt.Sprintf("\r\n\x1b[33m$ cat %s\x1b[0m\r\n", path))
		}

		return ExecuteSSHCommand(ctx, execCtx.ConnID, cmd, "", execCtx)
	},
}

// writeFileTool writes content to a file on the target server
var writeFileTool = Tool{
	Name:        "write_file",
	Description: "在服务器上创建或覆盖文件",
	Category:    "ssh",
	Parameters: map[string]ToolParam{
		"path": {
			Type:        "string",
			Description: "文件路径",
			Required:    true,
		},
		"content": {
			Type:        "string",
			Description: "文件内容",
			Required:    true,
		},
		"append": {
			Type:        "boolean",
			Description: "是否追加模式(默认覆盖)",
			Required:    false,
		},
	},
	Handler: func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
		path := params["path"].(string)
		content := params["content"].(string)
		appendMode := false
		if am, ok := params["append"].(bool); ok {
			appendMode = am
		}

		// Escape single quotes in content
		escapedContent := strings.ReplaceAll(content, "'", "'\\''")

		// SEC-8: 随机EOF分隔符防止注入
		delimiter := randomDelimiter()

		var cmd string
		if appendMode {
			cmd = fmt.Sprintf("cat >> '%s' << '%s'\n%s\n%s", path, delimiter, escapedContent, delimiter)
		} else {
			cmd = fmt.Sprintf("cat > '%s' << '%s'\n%s\n%s", path, delimiter, escapedContent, delimiter)
		}

		if execCtx.WSBroadcast != nil {
			action := "写入"
			if appendMode {
				action = "追加"
			}
			execCtx.WSBroadcast(fmt.Sprintf("\r\n\x1b[33m$ %s文件: %s\x1b[0m\r\n", action, path))
		}

		return ExecuteSSHCommand(ctx, execCtx.ConnID, cmd, "", execCtx)
	},
}

// listDirectoryTool lists contents of a directory
var listDirectoryTool = Tool{
	Name:        "list_directory",
	Description: "列出目录内容，显示文件和子目录",
	Category:    "ssh",
	Parameters: map[string]ToolParam{
		"path": {
			Type:        "string",
			Description: "目录路径",
			Required:    true,
		},
		"show_hidden": {
			Type:        "boolean",
			Description: "显示隐藏文件",
			Required:    false,
		},
		"show_details": {
			Type:        "boolean",
			Description: "显示详细信息(权限、大小等)",
			Required:    false,
		},
	},
	Handler: func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
		path := params["path"].(string)
		showHidden := false
		if sh, ok := params["show_hidden"].(bool); ok {
			showHidden = sh
		}
		showDetails := true
		if sd, ok := params["show_details"].(bool); ok {
			showDetails = sd
		}

		cmd := "ls"
		if showDetails {
			cmd += " -la"
		}
		if showHidden {
			cmd += "A"
		}
		cmd += fmt.Sprintf(" '%s'", path)

		if execCtx.WSBroadcast != nil {
			execCtx.WSBroadcast(fmt.Sprintf("\r\n\x1b[33m$ ls %s\x1b[0m\r\n", path))
		}

		return ExecuteSSHCommand(ctx, execCtx.ConnID, cmd, "", execCtx)
	},
}

// createDirectoryTool creates a directory on the target server
var createDirectoryTool = Tool{
	Name:        "create_directory",
	Description: "在服务器上创建目录",
	Category:    "ssh",
	Parameters: map[string]ToolParam{
		"path": {
			Type:        "string",
			Description: "目录路径",
			Required:    true,
		},
		"recursive": {
			Type:        "boolean",
			Description: "递归创建父目录",
			Required:    false,
		},
	},
	Handler: func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
		path := params["path"].(string)
		recursive := true
		if r, ok := params["recursive"].(bool); ok {
			recursive = r
		}

		cmd := "mkdir"
		if recursive {
			cmd += " -p"
		}
		cmd += fmt.Sprintf(" '%s'", path)

		if execCtx.WSBroadcast != nil {
			execCtx.WSBroadcast(fmt.Sprintf("\r\n\x1b[33m$ mkdir %s\x1b[0m\r\n", path))
		}

		return ExecuteSSHCommand(ctx, execCtx.ConnID, cmd, "", execCtx)
	},
}

// deleteFileTool deletes a file or directory on the target server
var deleteFileTool = Tool{
	Name:        "delete_file",
	Description: "删除服务器上的文件或目录",
	Category:    "ssh",
	IsDangerous: true,
	Parameters: map[string]ToolParam{
		"path": {
			Type:        "string",
			Description: "文件或目录路径",
			Required:    true,
		},
		"recursive": {
			Type:        "boolean",
			Description: "递归删除目录",
			Required:    false,
		},
	},
	Handler: func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
		path := params["path"].(string)
		recursive := false
		if r, ok := params["recursive"].(bool); ok {
			recursive = r
		}

		cmd := "rm"
		if recursive {
			cmd += " -rf"
		}
		cmd += fmt.Sprintf(" '%s'", path)

		if execCtx.WSBroadcast != nil {
			execCtx.WSBroadcast(fmt.Sprintf("\r\n\x1b[31m$ 删除: %s\x1b[0m\r\n", path))
		}

		return ExecuteSSHCommand(ctx, execCtx.ConnID, cmd, "", execCtx)
	},
}
