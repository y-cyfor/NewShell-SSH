package handlers

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"newshell-server/services"

	"github.com/gin-gonic/gin"
)

func ListFiles(c *gin.Context) {
	connID := c.Param("id")
	path := c.Query("path")
	if path == "" {
		path = "/"
	}

	sftp, err := services.ConnectSFTP(connID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("SFTP connect failed: %v", err)})
		return
	}
	defer sftp.Close()

	files, err := sftp.ListDir(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 确保返回正确的JSON格式
	c.JSON(http.StatusOK, map[string]interface{}{
		"files": files,
	})
}

func DownloadFile(c *gin.Context) {
	connID := c.Param("id")
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path required"})
		return
	}

	sftp, err := services.ConnectSFTP(connID)
	if err != nil {
		log.Printf("[DownloadFile] SFTP connect failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("SFTP连接失败: %v", err)})
		return
	}
	defer sftp.Close()

	data, err := sftp.ReadFile(path)
	if err != nil {
		log.Printf("[DownloadFile] ReadFile failed for path %s: %v", path, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("读取文件失败: %v", err)})
		return
	}

	fileName := path[strings.LastIndex(path, "/")+1:]
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
	c.Header("Content-Length", fmt.Sprintf("%d", len(data)))
	c.Data(http.StatusOK, "application/octet-stream", data)
}

func CreateDir(c *gin.Context) {
	connID := c.Param("id")
	var req struct {
		Path string `json:"path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sftp, err := services.ConnectSFTP(connID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sftp.Close()

	if err := sftp.Mkdir(req.Path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "created"})
}

func DeleteFile(c *gin.Context) {
	connID := c.Param("id")
	var req struct {
		Path string `json:"path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sftp, err := services.ConnectSFTP(connID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sftp.Close()

	if err := sftp.Remove(req.Path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func RenameFile(c *gin.Context) {
	connID := c.Param("id")
	var req struct {
		OldPath string `json:"old_path" binding:"required"`
		NewPath string `json:"new_path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sftp, err := services.ConnectSFTP(connID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer sftp.Close()

	if err := sftp.Rename(req.OldPath, req.NewPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "renamed"})
}

func UploadFile(c *gin.Context) {
	connID := c.Param("id")
	targetPath := c.PostForm("path")
	if targetPath == "" {
		targetPath = "/"
	}

	// 获取上传的文件
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("获取文件失败: %v", err)})
		return
	}
	defer file.Close()

	// SEC-9: 文件大小限制 (500MB)
	const maxUploadSize = 500 * 1024 * 1024
	if header.Size > maxUploadSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件过大 (最大500MB)"})
		return
	}

	// 连接SFTP
	sftp, err := services.ConnectSFTP(connID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("SFTP连接失败: %v", err)})
		return
	}
	defer sftp.Close()

	// SEC-10: 路径穿越防护
	safeFilename := filepath.Base(header.Filename)
	destPath := filepath.Join(targetPath, safeFilename)
	if !strings.HasPrefix(destPath, targetPath) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件路径"})
		return
	}

	// SEC-9: 流式传输而非全部读入内存
	destFile, err := sftp.WriteFileStream(destPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("创建文件失败: %v", err)})
		return
	}
	defer destFile.Close()

	written, err := io.Copy(destFile, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("写入文件失败: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "上传成功",
		"path":    destPath,
		"size":    written,
	})
}
