package tools

import (
	"context"
	"fmt"
	"sync"
)

// Registry manages all available tools
type Registry struct {
	tools map[string]*Tool
	mu    sync.RWMutex
}

// Global registry instance
var GlobalRegistry = NewRegistry()

// NewRegistry creates a new tool registry
func NewRegistry() *Registry {
	return &Registry{
		tools: make(map[string]*Tool),
	}
}

// Register adds a tool to the registry
func (r *Registry) Register(tool *Tool) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if tool.Name == "" {
		return fmt.Errorf("tool name cannot be empty")
	}
	if tool.Handler == nil {
		return fmt.Errorf("tool handler cannot be nil for tool %s", tool.Name)
	}

	r.tools[tool.Name] = tool
	return nil
}

// Unregister removes a tool from the registry
func (r *Registry) Unregister(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.tools, name)
}

// Get retrieves a tool by name
func (r *Registry) Get(name string) (*Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	tool, ok := r.tools[name]
	return tool, ok
}

// List returns all registered tools
func (r *Registry) List() []*Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	tools := make([]*Tool, 0, len(r.tools))
	for _, t := range r.tools {
		tools = append(tools, t)
	}
	return tools
}

// ListByCategory returns tools filtered by category
func (r *Registry) ListByCategory(category string) []*Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var tools []*Tool
	for _, t := range r.tools {
		if t.Category == category {
			tools = append(tools, t)
		}
	}
	return tools
}

// Execute runs a tool with the given parameters
func (r *Registry) Execute(ctx context.Context, name string, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error) {
	tool, ok := r.Get(name)
	if !ok {
		return &ToolResult{
			Success: false,
			Error:   fmt.Sprintf("tool not found: %s", name),
		}, fmt.Errorf("tool not found: %s", name)
	}

	// Validate required parameters
	for paramName, paramDef := range tool.Parameters {
		if paramDef.Required {
			if _, exists := params[paramName]; !exists {
				return &ToolResult{
					Success: false,
					Error:   fmt.Sprintf("missing required parameter: %s", paramName),
				}, fmt.Errorf("missing required parameter: %s", paramName)
			}
		}
	}

	return tool.Handler(ctx, params, execCtx)
}

// ToAPITools converts all registered tools to OpenAI API format
func (r *Registry) ToAPITools() []APITool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	apiTools := make([]APITool, 0, len(r.tools))
	for _, t := range r.tools {
		apiTools = append(apiTools, t.ToAPITool())
	}
	return apiTools
}

// ToAPIToolsByCategory converts tools of specific categories to API format
func (r *Registry) ToAPIToolsByCategory(categories ...string) []APITool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	catSet := make(map[string]bool)
	for _, c := range categories {
		catSet[c] = true
	}

	var apiTools []APITool
	for _, t := range r.tools {
		if catSet[t.Category] {
			apiTools = append(apiTools, t.ToAPITool())
		}
	}
	return apiTools
}

// Count returns the number of registered tools
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.tools)
}

// InitBuiltinTools registers all built-in tools
func InitBuiltinTools() {
	// SSH tools
	GlobalRegistry.Register(&executeCommandTool)
	GlobalRegistry.Register(&readFileTool)
	GlobalRegistry.Register(&writeFileTool)
	GlobalRegistry.Register(&listDirectoryTool)
	GlobalRegistry.Register(&createDirectoryTool)
	GlobalRegistry.Register(&deleteFileTool)

	// Builtin tools
	GlobalRegistry.Register(&getSystemInfoTool)
	GlobalRegistry.Register(&searchFilesTool)
}
