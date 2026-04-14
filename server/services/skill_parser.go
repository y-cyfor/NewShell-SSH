package services

import (
	"regexp"
	"strings"

	"newshell-server/models"
)

// SkillMetadata represents the YAML frontmatter of a SKILL.md
type SkillMetadata struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Version     string         `json:"version"`
	Author      string         `json:"author"`
	Tags        []string       `json:"tags"`
	Requires    SkillRequires  `json:"requires"`
	OS          []string       `json:"os"`
	Install     []SkillInstall `json:"install"`
}

type SkillRequires struct {
	Bins []string `json:"bins"`
}

type SkillInstall struct {
	Type    string `json:"type"`
	Command string `json:"command"`
}

// ParsedSkill represents a fully parsed SKILL.md
type ParsedSkill struct {
	Metadata SkillMetadata
	Content  string // Markdown body (after frontmatter)
	Raw      string // Full raw content
}

// ParseSkillMD parses a SKILL.md content
func ParseSkillMD(content string) (*ParsedSkill, error) {
	re := regexp.MustCompile(`(?s)^---\s*\n(.*?)\n---\s*\n(.*)$`)
	matches := re.FindStringSubmatch(content)

	if len(matches) < 3 {
		return &ParsedSkill{
			Content: content,
			Raw:     content,
			Metadata: SkillMetadata{
				Name:        "unknown",
				Description: "",
			},
		}, nil
	}

	frontmatter := matches[1]
	body := matches[2]

	metadata := parseSimpleYAML(frontmatter)

	skill := &ParsedSkill{
		Metadata: SkillMetadata{
			Name:        getOrDefault(metadata, "name", "unknown"),
			Description: getOrDefault(metadata, "description", ""),
			Version:     getOrDefault(metadata, "version", "1.0.0"),
			Author:      getOrDefault(metadata, "author", ""),
		},
		Content: body,
		Raw:     content,
	}

	return skill, nil
}

func parseSimpleYAML(yaml string) map[string]string {
	result := make(map[string]string)
	lines := strings.Split(yaml, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			result[key] = val
		}
	}
	return result
}

func getOrDefault(m map[string]string, key string, defaultVal string) string {
	if v, ok := m[key]; ok {
		return strings.Trim(v, "\"'")
	}
	return defaultVal
}

// SkillToPrompt converts a skill to a system prompt snippet
func SkillToPrompt(skill *ParsedSkill) string {
	var sb strings.Builder
	sb.WriteString("\n## Skill: " + skill.Metadata.Name + "\n")
	sb.WriteString(skill.Metadata.Description + "\n")
	sb.WriteString("\n" + skill.Content + "\n")
	return sb.String()
}

// SkillToTool converts a skill to a tool definition
func SkillToTool(skill *ParsedSkill) map[string]interface{} {
	return map[string]interface{}{
		"name":        skill.Metadata.Name,
		"description": skill.Metadata.Description,
		"content":     skill.Content,
	}
}

// MarketItemFromDetail converts a SkillDetail to a SkillMarketItem
func MarketItemFromDetail(detail models.SkillDetail, installed bool, isUpdate bool) models.SkillMarketItem {
	return models.SkillMarketItem{
		Source:      detail.Source,
		Slug:        detail.Slug,
		Name:        detail.Name,
		Description: detail.Description,
		Version:     detail.Version,
		Author:      detail.Author,
		Downloads:   detail.Downloads,
		Tags:        detail.Tags,
		Icon:        detail.Icon,
		Installed:   installed,
		IsUpdate:    isUpdate,
	}
}
