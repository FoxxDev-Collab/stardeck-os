package system

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// PackageUpdate represents an available package update
type PackageUpdate struct {
	Name           string `json:"name"`
	CurrentVersion string `json:"current_version"`
	NewVersion     string `json:"new_version"`
	Repository     string `json:"repository"`
	Size           string `json:"size"`
	SecurityUpdate bool   `json:"security_update"`
}

// UpdateHistory represents a past update transaction
type UpdateHistory struct {
	ID           int       `json:"id"`
	Date         time.Time `json:"date"`
	Action       string    `json:"action"` // Install, Update, Remove, etc.
	PackageCount int       `json:"package_count"`
	Packages     []string  `json:"packages,omitempty"`
}

// UpdateResult represents the result of an update operation
type UpdateResult struct {
	Success         bool     `json:"success"`
	PackagesUpdated int      `json:"packages_updated"`
	Message         string   `json:"message"`
	UpdatedPackages []string `json:"updated_packages,omitempty"`
}

// GetAvailableUpdates checks for available package updates using dnf
func GetAvailableUpdates() ([]PackageUpdate, error) {
	updates := make([]PackageUpdate, 0)

	// Check for updates using dnf
	cmd := exec.Command("dnf", "check-update", "-q")
	output, _ := cmd.Output()
	// Note: dnf check-update returns exit code 100 if updates are available

	// Parse output
	// Format: package_name.arch    version    repository
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" ||
			strings.HasPrefix(line, "Last metadata") ||
			strings.HasPrefix(line, "Obsoleting") ||
			strings.HasPrefix(line, "Security:") ||
			strings.HasPrefix(line, "Bugfix:") ||
			strings.HasPrefix(line, "Enhancement:") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) >= 3 {
			// Parse package name (remove .arch suffix)
			pkgFull := fields[0]
			// Skip if it looks like an advisory ID (contains colon)
			if strings.Contains(pkgFull, ":") {
				continue
			}

			nameParts := strings.Split(pkgFull, ".")
			name := nameParts[0]

			update := PackageUpdate{
				Name:       name,
				NewVersion: fields[1],
				Repository: fields[2],
			}

			updates = append(updates, update)
		}
	}

	// Check for security updates
	secCmd := exec.Command("dnf", "updateinfo", "list", "security", "-q")
	secOutput, _ := secCmd.Output()

	securityPkgs := make(map[string]bool)
	secScanner := bufio.NewScanner(strings.NewReader(string(secOutput)))
	for secScanner.Scan() {
		fields := strings.Fields(secScanner.Text())
		if len(fields) >= 3 {
			// Extract package name from the advisory line
			pkgName := fields[2]
			nameParts := strings.Split(pkgName, ".")
			securityPkgs[nameParts[0]] = true
		}
	}

	// Mark security updates
	for i := range updates {
		if securityPkgs[updates[i].Name] {
			updates[i].SecurityUpdate = true
		}
	}

	// Get current versions for each package
	for i := range updates {
		currentVersion := getCurrentPackageVersion(updates[i].Name)
		updates[i].CurrentVersion = currentVersion
	}

	return updates, nil
}

// getCurrentPackageVersion gets the currently installed version of a package
func getCurrentPackageVersion(name string) string {
	cmd := exec.Command("rpm", "-q", "--qf", "%{VERSION}-%{RELEASE}", name)
	output, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(output))
}

// ApplyUpdates installs available updates
func ApplyUpdates(packageNames []string) (*UpdateResult, error) {
	result := &UpdateResult{
		UpdatedPackages: make([]string, 0),
	}

	var cmd *exec.Cmd
	if len(packageNames) == 0 {
		// Update all packages
		cmd = exec.Command("dnf", "update", "-y")
	} else {
		// Update specific packages
		args := append([]string{"update", "-y"}, packageNames...)
		cmd = exec.Command("dnf", args...)
	}

	output, err := cmd.CombinedOutput()
	outputStr := string(output)

	if err != nil {
		result.Success = false
		result.Message = fmt.Sprintf("Update failed: %s - %s", err, outputStr)
		return result, nil
	}

	result.Success = true

	// Parse output to count updated packages
	// Look for "Upgraded:" or "Installed:" lines
	scanner := bufio.NewScanner(strings.NewReader(outputStr))
	counting := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Upgraded:") || strings.HasPrefix(line, "Installed:") {
			counting = true
			continue
		}
		if counting {
			if strings.TrimSpace(line) == "" || strings.HasPrefix(line, "Complete!") {
				counting = false
				continue
			}
			// Package lines are indented
			if strings.HasPrefix(line, "  ") {
				pkgName := strings.Fields(strings.TrimSpace(line))[0]
				result.UpdatedPackages = append(result.UpdatedPackages, pkgName)
			}
		}
	}

	result.PackagesUpdated = len(result.UpdatedPackages)
	if result.PackagesUpdated > 0 {
		result.Message = fmt.Sprintf("Successfully updated %d package(s)", result.PackagesUpdated)
	} else {
		result.Message = "No packages were updated"
	}

	return result, nil
}

// GetUpdateHistory returns the history of package updates
func GetUpdateHistory() ([]UpdateHistory, error) {
	history := make([]UpdateHistory, 0)

	// Use dnf history
	cmd := exec.Command("dnf", "history", "list", "--reverse")
	output, err := cmd.Output()
	if err != nil {
		return history, fmt.Errorf("failed to get update history: %w", err)
	}

	// Parse history output
	// Format: ID | Command line | Date and time | Action(s) | Altered
	// Skip header lines
	lines := strings.Split(string(output), "\n")
	headerPassed := false

	// Regex to match history lines
	historyRegex := regexp.MustCompile(`^\s*(\d+)\s*\|`)

	for _, line := range lines {
		if !headerPassed {
			if strings.Contains(line, "---") {
				headerPassed = true
			}
			continue
		}

		if !historyRegex.MatchString(line) {
			continue
		}

		fields := strings.Split(line, "|")
		if len(fields) < 5 {
			continue
		}

		id := 0
		fmt.Sscanf(strings.TrimSpace(fields[0]), "%d", &id)

		dateStr := strings.TrimSpace(fields[2])
		date, _ := time.Parse("2006-01-02 15:04", dateStr)

		action := strings.TrimSpace(fields[3])

		pkgCount := 0
		fmt.Sscanf(strings.TrimSpace(fields[4]), "%d", &pkgCount)

		entry := UpdateHistory{
			ID:           id,
			Date:         date,
			Action:       action,
			PackageCount: pkgCount,
		}

		history = append(history, entry)
	}

	// Return most recent first (reverse the list)
	for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
		history[i], history[j] = history[j], history[i]
	}

	// Limit to last 50 entries
	if len(history) > 50 {
		history = history[:50]
	}

	return history, nil
}

// GetHistoryDetail returns details about a specific history transaction
func GetHistoryDetail(id int) (*UpdateHistory, error) {
	cmd := exec.Command("dnf", "history", "info", fmt.Sprintf("%d", id))
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get history detail: %w", err)
	}

	detail := &UpdateHistory{
		ID:       id,
		Packages: make([]string, 0),
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	inPackages := false
	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "Begin time") {
			// Parse date
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				dateStr := strings.TrimSpace(parts[1])
				// Try multiple date formats
				for _, format := range []string{
					"Mon Jan 2 15:04:05 2006",
					"2006-01-02 15:04",
				} {
					if t, err := time.Parse(format, dateStr); err == nil {
						detail.Date = t
						break
					}
				}
			}
		}

		if strings.HasPrefix(line, "Packages Altered:") {
			inPackages = true
			continue
		}

		if inPackages {
			line = strings.TrimSpace(line)
			if line == "" {
				inPackages = false
				continue
			}
			// Parse package line: Install/Update/Erase package-version.arch
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				if detail.Action == "" {
					detail.Action = fields[0]
				}
				detail.Packages = append(detail.Packages, fields[1])
			}
		}
	}

	detail.PackageCount = len(detail.Packages)

	return detail, nil
}

// Repository represents a DNF repository configuration
type Repository struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	BaseURL     string `json:"baseurl,omitempty"`
	MirrorList  string `json:"mirrorlist,omitempty"`
	MetaLink    string `json:"metalink,omitempty"`
	Enabled     bool   `json:"enabled"`
	GPGCheck    bool   `json:"gpgcheck"`
	GPGKey      string `json:"gpgkey,omitempty"`
	Description string `json:"description,omitempty"`
}

// PackageSearchResult represents a package from search results
type PackageSearchResult struct {
	Name        string `json:"name"`
	Arch        string `json:"arch"`
	Version     string `json:"version"`
	Repository  string `json:"repository"`
	Summary     string `json:"summary"`
	Description string `json:"description,omitempty"`
	Size        int64  `json:"size,omitempty"`
	InstallSize int64  `json:"install_size,omitempty"`
	License     string `json:"license,omitempty"`
	URL         string `json:"url,omitempty"`
}

// GetRepositories returns all configured DNF repositories
func GetRepositories() ([]Repository, error) {
	repos := make([]Repository, 0)

	// Read from /etc/yum.repos.d/
	repoDir := "/etc/yum.repos.d"
	files, err := os.ReadDir(repoDir)
	if err != nil {
		return repos, fmt.Errorf("failed to read repo directory: %w", err)
	}

	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".repo") {
			continue
		}

		filePath := filepath.Join(repoDir, file.Name())
		fileRepos, err := parseRepoFile(filePath)
		if err != nil {
			// Log error but continue with other files
			continue
		}
		repos = append(repos, fileRepos...)
	}

	return repos, nil
}

// parseRepoFile parses a .repo file and returns repositories
func parseRepoFile(filePath string) ([]Repository, error) {
	repos := make([]Repository, 0)

	content, err := os.ReadFile(filePath)
	if err != nil {
		return repos, err
	}

	var currentRepo *Repository
	lines := strings.Split(string(content), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip comments and empty lines
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Section header [repo-id]
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			if currentRepo != nil {
				repos = append(repos, *currentRepo)
			}
			repoID := strings.Trim(line, "[]")
			currentRepo = &Repository{
				ID:       repoID,
				Enabled:  true, // Default
				GPGCheck: true, // Default
			}
			continue
		}

		if currentRepo == nil {
			continue
		}

		// Parse key=value
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])

		switch key {
		case "name":
			currentRepo.Name = value
		case "baseurl":
			currentRepo.BaseURL = value
		case "mirrorlist":
			currentRepo.MirrorList = value
		case "metalink":
			currentRepo.MetaLink = value
		case "enabled":
			currentRepo.Enabled = value == "1"
		case "gpgcheck":
			currentRepo.GPGCheck = value == "1"
		case "gpgkey":
			currentRepo.GPGKey = value
		}
	}

	// Add last repo
	if currentRepo != nil {
		repos = append(repos, *currentRepo)
	}

	return repos, nil
}

// AddRepository creates a new repository configuration
func AddRepository(repo Repository) error {
	if repo.ID == "" {
		return fmt.Errorf("repository ID is required")
	}
	if repo.Name == "" {
		return fmt.Errorf("repository name is required")
	}
	if repo.BaseURL == "" && repo.MirrorList == "" && repo.MetaLink == "" {
		return fmt.Errorf("repository must have baseurl, mirrorlist, or metalink")
	}

	// Check if repo already exists
	existing, err := GetRepositories()
	if err != nil {
		return err
	}
	for _, r := range existing {
		if r.ID == repo.ID {
			return fmt.Errorf("repository %s already exists", repo.ID)
		}
	}

	// Create repo file
	repoPath := filepath.Join("/etc/yum.repos.d", repo.ID+".repo")
	content := formatRepoFile(repo)

	err = os.WriteFile(repoPath, []byte(content), 0644)
	if err != nil {
		return fmt.Errorf("failed to write repo file: %w", err)
	}

	return nil
}

// EditRepository updates an existing repository configuration
func EditRepository(repo Repository) error {
	if repo.ID == "" {
		return fmt.Errorf("repository ID is required")
	}

	// Find the file containing this repo
	repoPath := filepath.Join("/etc/yum.repos.d", repo.ID+".repo")

	// Check if file exists
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		return fmt.Errorf("repository %s not found", repo.ID)
	}

	// Update repo file
	content := formatRepoFile(repo)
	err := os.WriteFile(repoPath, []byte(content), 0644)
	if err != nil {
		return fmt.Errorf("failed to update repo file: %w", err)
	}

	return nil
}

// DeleteRepository removes a repository configuration
func DeleteRepository(repoID string) error {
	if repoID == "" {
		return fmt.Errorf("repository ID is required")
	}

	repoPath := filepath.Join("/etc/yum.repos.d", repoID+".repo")

	// Check if file exists
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		return fmt.Errorf("repository %s not found", repoID)
	}

	err := os.Remove(repoPath)
	if err != nil {
		return fmt.Errorf("failed to delete repo file: %w", err)
	}

	return nil
}

// formatRepoFile generates .repo file content from Repository struct
func formatRepoFile(repo Repository) string {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("[%s]\n", repo.ID))
	b.WriteString(fmt.Sprintf("name=%s\n", repo.Name))

	if repo.BaseURL != "" {
		b.WriteString(fmt.Sprintf("baseurl=%s\n", repo.BaseURL))
	}
	if repo.MirrorList != "" {
		b.WriteString(fmt.Sprintf("mirrorlist=%s\n", repo.MirrorList))
	}
	if repo.MetaLink != "" {
		b.WriteString(fmt.Sprintf("metalink=%s\n", repo.MetaLink))
	}

	if repo.Enabled {
		b.WriteString("enabled=1\n")
	} else {
		b.WriteString("enabled=0\n")
	}

	if repo.GPGCheck {
		b.WriteString("gpgcheck=1\n")
	} else {
		b.WriteString("gpgcheck=0\n")
	}

	if repo.GPGKey != "" {
		b.WriteString(fmt.Sprintf("gpgkey=%s\n", repo.GPGKey))
	}

	return b.String()
}

// SearchPackages searches for packages in repositories
func SearchPackages(query string) ([]PackageSearchResult, error) {
	results := make([]PackageSearchResult, 0)

	if query == "" {
		return results, fmt.Errorf("search query cannot be empty")
	}

	// Use dnf search
	cmd := exec.Command("dnf", "search", "--all", query)
	output, err := cmd.Output()
	if err != nil {
		return results, fmt.Errorf("search failed: %w", err)
	}

	// Parse search output
	// Format: name.arch : summary
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "=") || strings.HasPrefix(line, "Last metadata") {
			continue
		}

		// Look for package lines (contain " : ")
		if strings.Contains(line, " : ") {
			parts := strings.SplitN(line, " : ", 2)
			if len(parts) == 2 {
				nameArch := strings.TrimSpace(parts[0])
				summary := strings.TrimSpace(parts[1])

				// Split name and arch
				nameParts := strings.Split(nameArch, ".")
				name := nameArch
				arch := ""
				if len(nameParts) > 1 {
					arch = nameParts[len(nameParts)-1]
					name = strings.Join(nameParts[:len(nameParts)-1], ".")
				}

				results = append(results, PackageSearchResult{
					Name:    name,
					Arch:    arch,
					Summary: summary,
				})
			}
		}
	}

	return results, nil
}

// GetPackageInfo retrieves detailed information about a package
func GetPackageInfo(packageName string) (*PackageSearchResult, error) {
	if packageName == "" {
		return nil, fmt.Errorf("package name cannot be empty")
	}

	// Use dnf info
	cmd := exec.Command("dnf", "info", packageName)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get package info: %w", err)
	}

	pkg := &PackageSearchResult{
		Name: packageName,
	}

	// Parse dnf info output
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Parse key: value
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])

		switch key {
		case "Name":
			pkg.Name = value
		case "Arch", "Architecture":
			pkg.Arch = value
		case "Version":
			pkg.Version = value
		case "Repository", "From repo":
			pkg.Repository = value
		case "Summary":
			pkg.Summary = value
		case "Description":
			pkg.Description = value
		case "Size":
			// Parse size (e.g., "1.2 M")
			pkg.Size = parseSizeString(value)
		case "Installed Size":
			pkg.InstallSize = parseSizeString(value)
		case "License":
			pkg.License = value
		case "URL":
			pkg.URL = value
		}
	}

	return pkg, nil
}

// parseSizeString converts size strings like "1.2 M" to bytes
func parseSizeString(sizeStr string) int64 {
	parts := strings.Fields(sizeStr)
	if len(parts) < 2 {
		return 0
	}

	var size float64
	fmt.Sscanf(parts[0], "%f", &size)

	unit := parts[1]
	switch unit {
	case "k", "K":
		return int64(size * 1024)
	case "M":
		return int64(size * 1024 * 1024)
	case "G":
		return int64(size * 1024 * 1024 * 1024)
	default:
		return int64(size)
	}
}

// RefreshMetadata cleans and refreshes DNF metadata
func RefreshMetadata() error {
	// Clean metadata
	cleanCmd := exec.Command("dnf", "clean", "metadata")
	if err := cleanCmd.Run(); err != nil {
		return fmt.Errorf("failed to clean metadata: %w", err)
	}

	// Make cache
	cacheCmd := exec.Command("dnf", "makecache")
	if err := cacheCmd.Run(); err != nil {
		return fmt.Errorf("failed to make cache: %w", err)
	}

	return nil
}

// InstallPackages installs one or more packages
func InstallPackages(packageNames []string) (*UpdateResult, error) {
	if len(packageNames) == 0 {
		return nil, fmt.Errorf("no packages specified")
	}

	result := &UpdateResult{
		UpdatedPackages: make([]string, 0),
	}

	// Install packages
	args := append([]string{"install", "-y"}, packageNames...)
	cmd := exec.Command("dnf", args...)

	output, err := cmd.CombinedOutput()
	outputStr := string(output)

	if err != nil {
		result.Success = false
		result.Message = fmt.Sprintf("Installation failed: %s - %s", err, outputStr)
		return result, nil
	}

	result.Success = true

	// Parse output to count installed packages
	scanner := bufio.NewScanner(strings.NewReader(outputStr))
	counting := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Installed:") {
			counting = true
			continue
		}
		if counting {
			if strings.TrimSpace(line) == "" || strings.HasPrefix(line, "Complete!") {
				counting = false
				continue
			}
			// Package lines are indented
			if strings.HasPrefix(line, "  ") {
				pkgName := strings.Fields(strings.TrimSpace(line))[0]
				result.UpdatedPackages = append(result.UpdatedPackages, pkgName)
			}
		}
	}

	result.PackagesUpdated = len(result.UpdatedPackages)
	if result.PackagesUpdated > 0 {
		result.Message = fmt.Sprintf("Successfully installed %d package(s)", result.PackagesUpdated)
	} else {
		result.Message = "No packages were installed"
	}

	return result, nil
}

// RemovePackages removes one or more packages
func RemovePackages(packageNames []string) (*UpdateResult, error) {
	if len(packageNames) == 0 {
		return nil, fmt.Errorf("no packages specified")
	}

	result := &UpdateResult{
		UpdatedPackages: make([]string, 0),
	}

	// Remove packages
	args := append([]string{"remove", "-y"}, packageNames...)
	cmd := exec.Command("dnf", args...)

	output, err := cmd.CombinedOutput()
	outputStr := string(output)

	if err != nil {
		result.Success = false
		result.Message = fmt.Sprintf("Removal failed: %s - %s", err, outputStr)
		return result, nil
	}

	result.Success = true

	// Parse output to count removed packages
	scanner := bufio.NewScanner(strings.NewReader(outputStr))
	counting := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Removed:") {
			counting = true
			continue
		}
		if counting {
			if strings.TrimSpace(line) == "" || strings.HasPrefix(line, "Complete!") {
				counting = false
				continue
			}
			// Package lines are indented
			if strings.HasPrefix(line, "  ") {
				pkgName := strings.Fields(strings.TrimSpace(line))[0]
				result.UpdatedPackages = append(result.UpdatedPackages, pkgName)
			}
		}
	}

	result.PackagesUpdated = len(result.UpdatedPackages)
	if result.PackagesUpdated > 0 {
		result.Message = fmt.Sprintf("Successfully removed %d package(s)", result.PackagesUpdated)
	} else {
		result.Message = "No packages were removed"
	}

	return result, nil
}
