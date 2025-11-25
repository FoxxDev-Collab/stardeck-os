package api

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/auth"
	"stardeckos-backend/internal/system"
)

// Maximum file size for text preview (1MB)
const maxPreviewSize = 1024 * 1024

// Maximum upload size (100MB)
const maxUploadSize = 100 * 1024 * 1024

// validateFilePath checks if a web user is allowed to access the given path
// Web users can only access /home/<username>/ directory
// System users have full access
func validateFilePath(c echo.Context, path string) error {
	user := auth.GetUserFromContext(c)
	if user == nil {
		return fmt.Errorf("authentication required")
	}

	// System users have unrestricted access
	if user.IsSystemUser() {
		return nil
	}

	// Web users are restricted to their home directory
	cleanPath := filepath.Clean(path)
	userHomeDir := filepath.Join("/home", user.Username)

	// Check if the path is within the user's home directory
	if !strings.HasPrefix(cleanPath, userHomeDir) {
		return fmt.Errorf("access denied: web users can only access their home directory")
	}

	return nil
}

// listFilesHandler handles GET /api/files
func listFilesHandler(c echo.Context) error {
	path := c.QueryParam("path")
	if path == "" {
		path = "/"
	}

	// Validate path access for web users
	if err := validateFilePath(c, path); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	listing, err := system.ListDirectory(path)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, listing)
}

// getFileInfoHandler handles GET /api/files/info
func getFileInfoHandler(c echo.Context) error {
	path := c.QueryParam("path")
	if path == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "path is required",
		})
	}

	// Validate path access for web users
	if err := validateFilePath(c, path); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	info, err := system.GetFileInfo(path)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, info)
}

// downloadFileHandler handles GET /api/files/download
func downloadFileHandler(c echo.Context) error {
	path := c.QueryParam("path")
	if path == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "path is required",
		})
	}

	// Validate path access for web users
	if err := validateFilePath(c, path); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	cleanPath := filepath.Clean(path)

	info, err := os.Stat(cleanPath)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "file not found",
		})
	}

	if info.IsDir() {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "cannot download directory",
		})
	}

	filename := filepath.Base(cleanPath)
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Response().Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))

	return c.File(cleanPath)
}

// previewFileHandler handles GET /api/files/preview (for text files)
func previewFileHandler(c echo.Context) error {
	path := c.QueryParam("path")
	if path == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "path is required",
		})
	}

	// Validate path access for web users
	if err := validateFilePath(c, path); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	content, err := system.ReadFileContent(path, maxPreviewSize)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	// Try to detect if it's a text file
	contentType := http.DetectContentType(content)
	if !strings.HasPrefix(contentType, "text/") && contentType != "application/json" {
		// Check if it appears to be valid UTF-8 text
		if !isValidUTF8(content) {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "file is not a text file",
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"content":      string(content),
		"content_type": contentType,
		"size":         len(content),
	})
}

// uploadFileHandler handles POST /api/files/upload
func uploadFileHandler(c echo.Context) error {
	targetPath := c.FormValue("path")
	if targetPath == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "target path is required",
		})
	}

	// Validate path access for web users
	if err := validateFilePath(c, targetPath); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	// Get the uploaded file
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "no file uploaded",
		})
	}

	// Check file size
	if file.Size > maxUploadSize {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("file too large (max %d MB)", maxUploadSize/(1024*1024)),
		})
	}

	// Open the uploaded file
	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to read uploaded file",
		})
	}
	defer src.Close()

	// Determine destination path
	destPath := filepath.Join(filepath.Clean(targetPath), file.Filename)

	// Create destination file
	dst, err := os.Create(destPath)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("cannot create file: %s", err.Error()),
		})
	}
	defer dst.Close()

	// Copy content
	if _, err = io.Copy(dst, src); err != nil {
		os.Remove(destPath)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to save file",
		})
	}

	// Get info about the new file
	info, _ := system.GetFileInfo(destPath)

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"message": "file uploaded successfully",
		"file":    info,
	})
}

// createDirectoryHandler handles POST /api/files/mkdir
func createDirectoryHandler(c echo.Context) error {
	var req struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Path == "" || req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "path and name are required",
		})
	}

	fullPath := filepath.Join(filepath.Clean(req.Path), req.Name)

	// Validate path access for web users
	if err := validateFilePath(c, fullPath); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	if err := system.CreateDirectory(fullPath, 0755); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	info, _ := system.GetFileInfo(fullPath)

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"message":   "directory created",
		"directory": info,
	})
}

// createFileHandler handles POST /api/files/create
func createFileHandler(c echo.Context) error {
	var req struct {
		Path    string `json:"path"`
		Name    string `json:"name"`
		Content string `json:"content"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Path == "" || req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "path and name are required",
		})
	}

	fullPath := filepath.Join(filepath.Clean(req.Path), req.Name)

	// Validate path access for web users
	if err := validateFilePath(c, fullPath); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	if err := system.WriteFileContent(fullPath, []byte(req.Content), 0644); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	info, _ := system.GetFileInfo(fullPath)

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"message": "file created",
		"file":    info,
	})
}

// updateFileHandler handles PUT /api/files/content
func updateFileHandler(c echo.Context) error {
	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Path == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "path is required",
		})
	}

	cleanPath := filepath.Clean(req.Path)

	// Validate path access for web users
	if err := validateFilePath(c, cleanPath); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	// Check if file exists
	info, err := os.Stat(cleanPath)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "file not found",
		})
	}

	if info.IsDir() {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "cannot write to directory",
		})
	}

	// Preserve permissions
	mode := info.Mode()

	if err := system.WriteFileContent(cleanPath, []byte(req.Content), mode); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	newInfo, _ := system.GetFileInfo(cleanPath)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "file updated",
		"file":    newInfo,
	})
}

// renameFileHandler handles POST /api/files/rename
func renameFileHandler(c echo.Context) error {
	var req struct {
		OldPath string `json:"old_path"`
		NewPath string `json:"new_path"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.OldPath == "" || req.NewPath == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "old_path and new_path are required",
		})
	}

	// Validate both paths for web users
	if err := validateFilePath(c, req.OldPath); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}
	if err := validateFilePath(c, req.NewPath); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	if err := system.RenamePath(req.OldPath, req.NewPath); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	info, _ := system.GetFileInfo(req.NewPath)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "renamed successfully",
		"file":    info,
	})
}

// copyFileHandler handles POST /api/files/copy
func copyFileHandler(c echo.Context) error {
	var req struct {
		Source      string `json:"source"`
		Destination string `json:"destination"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Source == "" || req.Destination == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "source and destination are required",
		})
	}

	// Validate both paths for web users
	if err := validateFilePath(c, req.Source); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}
	if err := validateFilePath(c, req.Destination); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	if err := system.CopyFile(req.Source, req.Destination); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	info, _ := system.GetFileInfo(req.Destination)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "file copied",
		"file":    info,
	})
}

// deleteFileHandler handles DELETE /api/files
func deleteFileHandler(c echo.Context) error {
	path := c.QueryParam("path")
	if path == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "path is required",
		})
	}

	// Validate path access for web users
	if err := validateFilePath(c, path); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	recursive := c.QueryParam("recursive") == "true"

	if err := system.DeletePath(path, recursive); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "deleted successfully",
	})
}

// changePermissionsHandler handles PATCH /api/files/permissions
func changePermissionsHandler(c echo.Context) error {
	var change system.PermissionChange

	if err := c.Bind(&change); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if change.Path == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "path is required",
		})
	}

	// Validate path access for web users
	if err := validateFilePath(c, change.Path); err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": err.Error(),
		})
	}

	if change.Mode == "" && change.Owner == "" && change.Group == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "at least one of mode, owner, or group is required",
		})
	}

	if err := system.ChangePermissions(&change); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	info, _ := system.GetFileInfo(change.Path)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "permissions changed",
		"file":    info,
	})
}

// isValidUTF8 checks if the content appears to be valid UTF-8 text
func isValidUTF8(data []byte) bool {
	// Check for null bytes (binary indicator)
	for _, b := range data {
		if b == 0 {
			return false
		}
	}
	return true
}
