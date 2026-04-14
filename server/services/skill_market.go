package services

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"newshell-server/models"
)

// GetSkillHubBaseDir returns the base directory for skills in the program directory
func GetSkillHubBaseDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "newshell", "skills")
	}
	return filepath.Join(home, ".newshell", "skills")
}

// MarketListResponse is the response from market listing
type MarketListResponse struct {
	Items    []models.SkillMarketItem `json:"items"`
	Total    int                      `json:"total"`
	Page     int                      `json:"page"`
	PageSize int                      `json:"page_size"`
}

// CheckSkillHubCLI checks if the skillhub CLI is installed
func CheckSkillHubCLI() bool {
	return false // Manual management only
}

// ListMarketSkills lists skills - for now returns empty since we use manual management
func ListMarketSkills(source string, query string, page int, pageSize int) (MarketListResponse, error) {
	return MarketListResponse{Items: []models.SkillMarketItem{}}, nil
}

// GetSkillDetail gets skill detail - not used in manual mode
func GetSkillDetail(source string, slug string) (models.SkillDetail, error) {
	return models.SkillDetail{}, fmt.Errorf("请使用手动导入方式管理Skill")
}

// InstallSkill installs a skill - not used in manual mode
func InstallSkill(source, slug string) error {
	return fmt.Errorf("请使用手动导入方式管理Skill")
}

// ImportSkillFromZIP imports a skill from a ZIP file
func ImportSkillFromZIP(zipPath string) error {
	baseDir := GetSkillHubBaseDir()

	// Open ZIP
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("打开ZIP文件失败：%v", err)
	}
	defer r.Close()

	// Find the root directory in ZIP
	var rootDir string
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			rootDir = f.Name
			break
		}
	}

	if rootDir == "" {
		// No directory found, use filename as directory name
		baseName := filepath.Base(zipPath)
		rootDir = strings.TrimSuffix(baseName, filepath.Ext(baseName))
	}

	// Extract to skills directory
	destDir := filepath.Join(baseDir, rootDir)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("创建目录失败：%v", err)
	}

	for _, f := range r.File {
		destPath := filepath.Join(baseDir, f.Name)

		// Security check
		if !strings.HasPrefix(destPath, filepath.Clean(baseDir)+string(os.PathSeparator)) {
			continue
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(destPath, 0755)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return fmt.Errorf("创建目录失败：%v", err)
		}

		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("打开ZIP条目失败：%v", err)
		}

		dst, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return fmt.Errorf("创建文件失败：%v", err)
		}

		_, err = io.Copy(dst, rc)
		dst.Close()
		rc.Close()
		if err != nil {
			return fmt.Errorf("写入文件失败：%v", err)
		}
	}

	// Read SKILL.md and save to database
	skillMD := ""
	if data, err := os.ReadFile(filepath.Join(destDir, "SKILL.md")); err == nil {
		skillMD = string(data)
	}

	// Parse skill name from SKILL.md or directory name
	name := rootDir
	if skillMD != "" {
		nameRe := regexp.MustCompile(`(?i)^---\s*\n.*?name:\s*(.+?)\s*\n`)
		if m := nameRe.FindStringSubmatch(skillMD); len(m) > 1 {
			name = strings.TrimSpace(m[1])
		}
	}

	skillDB := &models.SkillDB{
		Name:        name,
		Slug:        rootDir,
		Description: "从ZIP文件导入",
		Version:     "1.0.0",
		Source:      "local",
		Path:        destDir,
		LocalPath:   destDir,
		Content:     skillMD,
		Icon:        "📦",
		Author:      "local",
		Downloads:   0,
		Tags:        "[]",
		Enabled:     true,
	}

	if err := models.CreateSkill(skillDB); err != nil {
		models.UpdateSkill(skillDB.Name, map[string]interface{}{
			"slug": skillDB.Slug, "source": "local", "path": skillDB.Path,
			"local_path": skillDB.LocalPath, "content": skillDB.Content, "enabled": true,
		})
	}

	return nil
}

// ImportSkillFromFolder imports a skill from a folder
func ImportSkillFromFolder(folderPath string) error {
	baseDir := GetSkillHubBaseDir()

	// Check if folder exists
	info, err := os.Stat(folderPath)
	if err != nil {
		return fmt.Errorf("文件夹不存在：%v", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("路径不是文件夹")
	}

	folderName := filepath.Base(folderPath)
	destDir := filepath.Join(baseDir, folderName)

	// Copy folder to skills directory
	if err := copyDir(folderPath, destDir); err != nil {
		return fmt.Errorf("复制文件夹失败：%v", err)
	}

	// Read SKILL.md and save to database
	skillMD := ""
	if data, err := os.ReadFile(filepath.Join(destDir, "SKILL.md")); err == nil {
		skillMD = string(data)
	}

	// Parse skill name from SKILL.md or directory name
	name := folderName
	if skillMD != "" {
		nameRe := regexp.MustCompile(`(?i)^---\s*\n.*?name:\s*(.+?)\s*\n`)
		if m := nameRe.FindStringSubmatch(skillMD); len(m) > 1 {
			name = strings.TrimSpace(m[1])
		}
	}

	skillDB := &models.SkillDB{
		Name:        name,
		Slug:        folderName,
		Description: "从文件夹导入",
		Version:     "1.0.0",
		Source:      "local",
		Path:        destDir,
		LocalPath:   destDir,
		Content:     skillMD,
		Icon:        "📦",
		Author:      "local",
		Downloads:   0,
		Tags:        "[]",
		Enabled:     true,
	}

	if err := models.CreateSkill(skillDB); err != nil {
		models.UpdateSkill(skillDB.Name, map[string]interface{}{
			"slug": skillDB.Slug, "source": "local", "path": skillDB.Path,
			"local_path": skillDB.LocalPath, "content": skillDB.Content, "enabled": true,
		})
	}

	return nil
}

// copyDir copies a directory recursively
func copyDir(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(dst, srcInfo.Mode()); err != nil {
		return err
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}

	return nil
}

// copyFile copies a single file
func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

// UninstallSkill uninstalls a skill
func UninstallSkill(name string) error {
	skill, err := models.GetSkill(name)
	if err != nil {
		return err
	}

	// Remove local files
	if skill.LocalPath != "" {
		os.RemoveAll(skill.LocalPath)
	}

	return models.DeleteSkill(name)
}

// UpdateSkill updates an installed skill
func UpdateSkill(name string) error {
	return fmt.Errorf("请重新导入Skill以更新")
}

// GetInstalledSkillsWithMarketInfo returns installed skills
func GetInstalledSkillsWithMarketInfo() ([]models.SkillDB, error) {
	return models.GetSkills()
}
