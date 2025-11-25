package system

import (
	"fmt"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// FileInfo represents information about a file or directory
type FileInfo struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	IsDir       bool      `json:"is_dir"`
	Size        int64     `json:"size"`
	Mode        string    `json:"mode"`
	Permissions string    `json:"permissions"`
	Owner       string    `json:"owner"`
	Group       string    `json:"group"`
	OwnerUID    int       `json:"owner_uid"`
	GroupGID    int       `json:"group_gid"`
	ModTime     time.Time `json:"mod_time"`
	IsSymlink   bool      `json:"is_symlink"`
	LinkTarget  string    `json:"link_target,omitempty"`
	Extension   string    `json:"extension,omitempty"`
	MimeType    string    `json:"mime_type,omitempty"`
}

// DirectoryListing represents a directory's contents
type DirectoryListing struct {
	Path     string     `json:"path"`
	Parent   string     `json:"parent"`
	Files    []FileInfo `json:"files"`
	Total    int        `json:"total"`
	CanWrite bool       `json:"can_write"`
}

// PermissionChange represents a permission change request
type PermissionChange struct {
	Path       string `json:"path"`
	Mode       string `json:"mode"`       // e.g., "755" or "rwxr-xr-x"
	Owner      string `json:"owner"`      // username or uid
	Group      string `json:"group"`      // group name or gid
	Recursive  bool   `json:"recursive"`
}

// ListDirectory lists the contents of a directory
func ListDirectory(path string) (*DirectoryListing, error) {
	// Clean and validate path
	cleanPath := filepath.Clean(path)
	if cleanPath == "" {
		cleanPath = "/"
	}

	// Check if path exists and is a directory
	info, err := os.Stat(cleanPath)
	if err != nil {
		return nil, fmt.Errorf("path not found: %s", cleanPath)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("path is not a directory: %s", cleanPath)
	}

	// Read directory entries
	entries, err := os.ReadDir(cleanPath)
	if err != nil {
		return nil, fmt.Errorf("cannot read directory: %w", err)
	}

	files := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		fullPath := filepath.Join(cleanPath, entry.Name())
		fileInfo, err := getFileInfo(fullPath, entry.Name())
		if err != nil {
			// Skip files we can't stat
			continue
		}
		files = append(files, *fileInfo)
	}

	// Check if we can write to this directory
	canWrite := false
	if f, err := os.OpenFile(filepath.Join(cleanPath, ".stardeck_write_test"), os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		f.Close()
		os.Remove(filepath.Join(cleanPath, ".stardeck_write_test"))
		canWrite = true
	}

	// Get parent directory
	parent := filepath.Dir(cleanPath)
	if parent == cleanPath {
		parent = ""
	}

	return &DirectoryListing{
		Path:     cleanPath,
		Parent:   parent,
		Files:    files,
		Total:    len(files),
		CanWrite: canWrite,
	}, nil
}

// GetFileInfo returns detailed information about a file
func GetFileInfo(path string) (*FileInfo, error) {
	cleanPath := filepath.Clean(path)
	name := filepath.Base(cleanPath)
	return getFileInfo(cleanPath, name)
}

func getFileInfo(path, name string) (*FileInfo, error) {
	// Use Lstat to detect symlinks
	linfo, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}

	info := linfo
	isSymlink := linfo.Mode()&os.ModeSymlink != 0
	linkTarget := ""

	if isSymlink {
		// Get link target
		linkTarget, _ = os.Readlink(path)
		// Follow the symlink for actual file info
		if realInfo, err := os.Stat(path); err == nil {
			info = realInfo
		}
	}

	// Get owner and group
	var ownerUID, groupGID int
	var ownerName, groupName string

	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		ownerUID = int(stat.Uid)
		groupGID = int(stat.Gid)

		if u, err := user.LookupId(strconv.Itoa(ownerUID)); err == nil {
			ownerName = u.Username
		} else {
			ownerName = strconv.Itoa(ownerUID)
		}

		if g, err := user.LookupGroupId(strconv.Itoa(groupGID)); err == nil {
			groupName = g.Name
		} else {
			groupName = strconv.Itoa(groupGID)
		}
	}

	// Get extension for files
	ext := ""
	if !info.IsDir() {
		ext = strings.TrimPrefix(filepath.Ext(name), ".")
	}

	// Determine MIME type hint based on extension
	mimeType := getMimeType(ext, info.IsDir())

	return &FileInfo{
		Name:        name,
		Path:        path,
		IsDir:       info.IsDir(),
		Size:        info.Size(),
		Mode:        info.Mode().String(),
		Permissions: formatPermissions(info.Mode()),
		Owner:       ownerName,
		Group:       groupName,
		OwnerUID:    ownerUID,
		GroupGID:    groupGID,
		ModTime:     info.ModTime(),
		IsSymlink:   isSymlink,
		LinkTarget:  linkTarget,
		Extension:   ext,
		MimeType:    mimeType,
	}, nil
}

// CreateDirectory creates a new directory
func CreateDirectory(path string, mode os.FileMode) error {
	cleanPath := filepath.Clean(path)
	return os.MkdirAll(cleanPath, mode)
}

// CreateFile creates a new empty file
func CreateFile(path string) error {
	cleanPath := filepath.Clean(path)
	f, err := os.Create(cleanPath)
	if err != nil {
		return err
	}
	return f.Close()
}

// DeletePath deletes a file or directory (recursively for directories)
func DeletePath(path string, recursive bool) error {
	cleanPath := filepath.Clean(path)

	// Safety check - don't allow deleting root or system directories
	dangerousPaths := []string{"/", "/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/sbin", "/sys", "/usr", "/var"}
	for _, dp := range dangerousPaths {
		if cleanPath == dp {
			return fmt.Errorf("cannot delete system directory: %s", cleanPath)
		}
	}

	info, err := os.Stat(cleanPath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		if recursive {
			return os.RemoveAll(cleanPath)
		}
		return os.Remove(cleanPath)
	}

	return os.Remove(cleanPath)
}

// RenamePath renames or moves a file/directory
func RenamePath(oldPath, newPath string) error {
	cleanOld := filepath.Clean(oldPath)
	cleanNew := filepath.Clean(newPath)
	return os.Rename(cleanOld, cleanNew)
}

// CopyFile copies a file from src to dst
func CopyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	srcInfo, err := srcFile.Stat()
	if err != nil {
		return err
	}

	dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

// ChangePermissions changes the permissions of a file or directory
func ChangePermissions(change *PermissionChange) error {
	cleanPath := filepath.Clean(change.Path)

	// Parse mode if provided
	if change.Mode != "" {
		mode, err := parseMode(change.Mode)
		if err != nil {
			return fmt.Errorf("invalid mode: %w", err)
		}

		if change.Recursive {
			err = filepath.Walk(cleanPath, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return err
				}
				return os.Chmod(path, mode)
			})
		} else {
			err = os.Chmod(cleanPath, mode)
		}
		if err != nil {
			return err
		}
	}

	// Change owner/group if provided
	if change.Owner != "" || change.Group != "" {
		uid := -1
		gid := -1

		if change.Owner != "" {
			if u, err := user.Lookup(change.Owner); err == nil {
				uid, _ = strconv.Atoi(u.Uid)
			} else if id, err := strconv.Atoi(change.Owner); err == nil {
				uid = id
			} else {
				return fmt.Errorf("unknown user: %s", change.Owner)
			}
		}

		if change.Group != "" {
			if g, err := user.LookupGroup(change.Group); err == nil {
				gid, _ = strconv.Atoi(g.Gid)
			} else if id, err := strconv.Atoi(change.Group); err == nil {
				gid = id
			} else {
				return fmt.Errorf("unknown group: %s", change.Group)
			}
		}

		if change.Recursive {
			return filepath.Walk(cleanPath, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return err
				}
				return os.Chown(path, uid, gid)
			})
		}
		return os.Chown(cleanPath, uid, gid)
	}

	return nil
}

// ReadFileContent reads the content of a text file (limited size)
func ReadFileContent(path string, maxSize int64) ([]byte, error) {
	cleanPath := filepath.Clean(path)

	info, err := os.Stat(cleanPath)
	if err != nil {
		return nil, err
	}

	if info.IsDir() {
		return nil, fmt.Errorf("cannot read directory as file")
	}

	if info.Size() > maxSize {
		return nil, fmt.Errorf("file too large: %d bytes (max %d)", info.Size(), maxSize)
	}

	return os.ReadFile(cleanPath)
}

// WriteFileContent writes content to a file
func WriteFileContent(path string, content []byte, mode os.FileMode) error {
	cleanPath := filepath.Clean(path)
	return os.WriteFile(cleanPath, content, mode)
}

// parseMode parses a permission string (e.g., "755" or "0755")
func parseMode(s string) (os.FileMode, error) {
	// Remove leading 0 if present
	s = strings.TrimPrefix(s, "0")

	mode, err := strconv.ParseUint(s, 8, 32)
	if err != nil {
		return 0, err
	}

	return os.FileMode(mode), nil
}

// formatPermissions converts os.FileMode to rwx format
func formatPermissions(mode os.FileMode) string {
	perm := mode.Perm()
	result := ""

	for i := 8; i >= 0; i-- {
		if perm&(1<<uint(i)) != 0 {
			switch i % 3 {
			case 2:
				result += "r"
			case 1:
				result += "w"
			case 0:
				result += "x"
			}
		} else {
			result += "-"
		}
	}

	return result
}

// getMimeType returns a MIME type hint based on file extension
func getMimeType(ext string, isDir bool) string {
	if isDir {
		return "inode/directory"
	}

	ext = strings.ToLower(ext)
	mimeTypes := map[string]string{
		// Text
		"txt":  "text/plain",
		"md":   "text/markdown",
		"html": "text/html",
		"htm":  "text/html",
		"css":  "text/css",
		"js":   "application/javascript",
		"json": "application/json",
		"xml":  "application/xml",
		"yaml": "text/yaml",
		"yml":  "text/yaml",
		"csv":  "text/csv",
		"log":  "text/plain",
		"conf": "text/plain",
		"cfg":  "text/plain",
		"ini":  "text/plain",
		"sh":   "application/x-sh",
		"bash": "application/x-sh",
		"zsh":  "application/x-sh",
		"py":   "text/x-python",
		"go":   "text/x-go",
		"rs":   "text/x-rust",
		"c":    "text/x-c",
		"cpp":  "text/x-c++",
		"h":    "text/x-c",
		"java": "text/x-java",
		"ts":   "text/typescript",
		"tsx":  "text/typescript",
		"jsx":  "text/javascript",
		"vue":  "text/x-vue",
		"sql":  "application/sql",

		// Images
		"png":  "image/png",
		"jpg":  "image/jpeg",
		"jpeg": "image/jpeg",
		"gif":  "image/gif",
		"svg":  "image/svg+xml",
		"ico":  "image/x-icon",
		"webp": "image/webp",
		"bmp":  "image/bmp",

		// Archives
		"zip":  "application/zip",
		"tar":  "application/x-tar",
		"gz":   "application/gzip",
		"bz2":  "application/x-bzip2",
		"xz":   "application/x-xz",
		"7z":   "application/x-7z-compressed",
		"rar":  "application/vnd.rar",
		"rpm":  "application/x-rpm",
		"deb":  "application/vnd.debian.binary-package",

		// Documents
		"pdf":  "application/pdf",
		"doc":  "application/msword",
		"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"xls":  "application/vnd.ms-excel",
		"xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

		// Media
		"mp3":  "audio/mpeg",
		"wav":  "audio/wav",
		"ogg":  "audio/ogg",
		"mp4":  "video/mp4",
		"webm": "video/webm",
		"avi":  "video/x-msvideo",
		"mkv":  "video/x-matroska",

		// Executables
		"exe": "application/x-executable",
		"bin": "application/octet-stream",
		"so":  "application/x-sharedlib",
	}

	if mime, ok := mimeTypes[ext]; ok {
		return mime
	}

	return "application/octet-stream"
}
