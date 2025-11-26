package api

import (
	"bufio"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

// PackageOperationMessage represents a message sent during package operations
type PackageOperationMessage struct {
	Type       string   `json:"type"`                  // "status", "progress", "output", "complete", "error"
	Message    string   `json:"message"`
	Phase      string   `json:"phase,omitempty"`       // "checking", "downloading", "installing", "verifying", "complete"
	Progress   int      `json:"progress,omitempty"`    // 0-100
	Package    string   `json:"package,omitempty"`     // Current package being processed
	TotalPkgs  int      `json:"total_pkgs,omitempty"`  // Total packages to process
	CurrentPkg int      `json:"current_pkg,omitempty"` // Current package number
	Packages   []string `json:"packages,omitempty"`    // List of packages (for final result)
	Success    bool     `json:"success,omitempty"`
}

// HandlePackageOperationWebSocket handles WebSocket connections for streaming package operations
func HandlePackageOperationWebSocket(c echo.Context) error {
	// Validate authentication from query parameter
	token := c.QueryParam("token")
	if token == "" {
		return echo.NewHTTPError(401, "No authentication token")
	}

	// Validate token
	user, _, err := authService.ValidateToken(token)
	if err != nil {
		return echo.NewHTTPError(401, "Invalid authentication token")
	}

	log.Printf("Package Operation WebSocket: User %s connecting...", user.Username)

	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	ws, err := upgrader.Upgrade(c.Response().Writer, c.Request(), nil)
	if err != nil {
		log.Printf("Failed to upgrade to WebSocket: %v", err)
		return err
	}
	defer ws.Close()

	log.Printf("Package Operation WebSocket: User %s connected", user.Username)

	// Read the operation request
	var req struct {
		Operation string   `json:"operation"` // "update", "install", "remove", "refresh"
		Packages  []string `json:"packages,omitempty"`
	}

	if err := ws.ReadJSON(&req); err != nil {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "error",
			Message: "Invalid request: " + err.Error(),
		})
		return nil
	}

	log.Printf("Package Operation: %s, packages: %v", req.Operation, req.Packages)

	// Execute the operation with streaming output
	switch req.Operation {
	case "update":
		streamDNFOperation(ws, "update", req.Packages)
	case "install":
		streamDNFOperation(ws, "install", req.Packages)
	case "remove":
		streamDNFOperation(ws, "remove", req.Packages)
	case "refresh":
		streamMetadataRefresh(ws)
	default:
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "error",
			Message: "Unknown operation: " + req.Operation,
		})
	}

	return nil
}

func sendPackageMessage(ws *websocket.Conn, msg PackageOperationMessage) {
	if err := ws.WriteJSON(msg); err != nil {
		log.Printf("Failed to send WebSocket message: %v", err)
	}
}

func streamDNFOperation(ws *websocket.Conn, operation string, packages []string) {
	sendPackageMessage(ws, PackageOperationMessage{
		Type:    "status",
		Message: "Starting " + operation + " operation...",
		Phase:   "starting",
	})

	var args []string
	switch operation {
	case "update":
		args = append([]string{"update", "-y"}, packages...)
	case "install":
		args = append([]string{"install", "-y"}, packages...)
	case "remove":
		args = append([]string{"remove", "-y"}, packages...)
	}

	cmd := exec.Command("dnf", args...)

	// Get stdout and stderr pipes
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "error",
			Message: "Failed to create stdout pipe: " + err.Error(),
		})
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "error",
			Message: "Failed to create stderr pipe: " + err.Error(),
		})
		return
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "error",
			Message: "Failed to start dnf: " + err.Error(),
		})
		return
	}

	sendPackageMessage(ws, PackageOperationMessage{
		Type:    "status",
		Message: "DNF process started",
		Phase:   "checking",
	})

	var wg sync.WaitGroup
	var mu sync.Mutex
	var updatedPackages []string
	currentPhase := "checking"
	totalPkgs := 0
	currentPkg := 0

	// Parse and stream stdout
	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		inPackageList := false
		for scanner.Scan() {
			line := scanner.Text()

			mu.Lock()
			// Detect phase changes and progress
			newPhase := currentPhase
			progress := 0

			if strings.Contains(line, "Dependencies resolved") {
				newPhase = "downloading"
			} else if strings.Contains(line, "Downloading Packages:") {
				newPhase = "downloading"
			} else if strings.Contains(line, "Running transaction") {
				newPhase = "installing"
			} else if strings.Contains(line, "Verifying") {
				newPhase = "verifying"
			} else if strings.Contains(line, "Installed:") || strings.Contains(line, "Upgraded:") || strings.Contains(line, "Removed:") {
				newPhase = "complete"
				inPackageList = true
			} else if strings.Contains(line, "Complete!") {
				inPackageList = false
			}

			// Parse progress from DNF output
			// Example: "(1/10): package-name"
			if strings.Contains(line, "): ") && strings.HasPrefix(strings.TrimSpace(line), "(") {
				var cur, total int
				if parseProgress(line, &cur, &total) && total > 0 {
					totalPkgs = total
					currentPkg = cur
					progress = (cur * 100) / total
				}
			}

			// Track updated packages
			if inPackageList && strings.HasPrefix(line, "  ") {
				fields := strings.Fields(line)
				if len(fields) > 0 {
					updatedPackages = append(updatedPackages, fields[0])
				}
			}

			if newPhase != currentPhase {
				currentPhase = newPhase
			}

			curPhase := currentPhase
			curTotal := totalPkgs
			curCurrent := currentPkg
			mu.Unlock()

			sendPackageMessage(ws, PackageOperationMessage{
				Type:       "output",
				Message:    line,
				Phase:      curPhase,
				Progress:   progress,
				TotalPkgs:  curTotal,
				CurrentPkg: curCurrent,
			})
		}
	}()

	// Stream stderr
	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			mu.Lock()
			curPhase := currentPhase
			mu.Unlock()
			sendPackageMessage(ws, PackageOperationMessage{
				Type:    "output",
				Message: line,
				Phase:   curPhase,
			})
		}
	}()

	// Wait for output processing
	wg.Wait()

	// Wait for command to finish
	err = cmd.Wait()

	mu.Lock()
	pkgCount := len(updatedPackages)
	pkgList := make([]string, len(updatedPackages))
	copy(pkgList, updatedPackages)
	mu.Unlock()

	if err != nil {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "complete",
			Message: "Operation failed: " + err.Error(),
			Phase:   "error",
			Success: false,
		})
	} else {
		var msg string
		switch operation {
		case "update":
			msg = "Updated"
		case "install":
			msg = "Installed"
		case "remove":
			msg = "Removed"
		}

		if pkgCount > 0 {
			msg = msg + " " + itoa(pkgCount) + " package(s)"
		} else {
			msg = "No packages were modified"
		}

		sendPackageMessage(ws, PackageOperationMessage{
			Type:     "complete",
			Message:  msg,
			Phase:    "complete",
			Success:  true,
			Packages: pkgList,
			Progress: 100,
		})
	}
}

func parseProgress(line string, current, total *int) bool {
	// Parse "(1/10):" format
	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, "(") {
		return false
	}
	end := strings.Index(line, "):")
	if end == -1 {
		end = strings.Index(line, ")")
		if end == -1 {
			return false
		}
	}
	parts := strings.Split(line[1:end], "/")
	if len(parts) != 2 {
		return false
	}
	*current = atoi(parts[0])
	*total = atoi(parts[1])
	return *total > 0
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		}
	}
	return n
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

func streamMetadataRefresh(ws *websocket.Conn) {
	sendPackageMessage(ws, PackageOperationMessage{
		Type:    "status",
		Message: "Cleaning metadata...",
		Phase:   "cleaning",
	})

	// Clean metadata
	cleanCmd := exec.Command("dnf", "clean", "metadata")
	cleanOutput, err := cleanCmd.CombinedOutput()
	if err != nil {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "error",
			Message: "Failed to clean metadata: " + err.Error(),
		})
		return
	}

	for _, line := range strings.Split(string(cleanOutput), "\n") {
		if line != "" {
			sendPackageMessage(ws, PackageOperationMessage{
				Type:    "output",
				Message: line,
				Phase:   "cleaning",
			})
		}
	}

	sendPackageMessage(ws, PackageOperationMessage{
		Type:     "status",
		Message:  "Building cache...",
		Phase:    "caching",
		Progress: 50,
	})

	// Make cache
	cacheCmd := exec.Command("dnf", "makecache")
	stdout, _ := cacheCmd.StdoutPipe()
	stderr, _ := cacheCmd.StderrPipe()

	if err := cacheCmd.Start(); err != nil {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "error",
			Message: "Failed to start makecache: " + err.Error(),
		})
		return
	}

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			sendPackageMessage(ws, PackageOperationMessage{
				Type:    "output",
				Message: scanner.Text(),
				Phase:   "caching",
			})
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			sendPackageMessage(ws, PackageOperationMessage{
				Type:    "output",
				Message: scanner.Text(),
				Phase:   "caching",
			})
		}
	}()

	wg.Wait()
	err = cacheCmd.Wait()

	if err != nil {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:    "complete",
			Message: "Metadata refresh failed: " + err.Error(),
			Phase:   "error",
			Success: false,
		})
	} else {
		sendPackageMessage(ws, PackageOperationMessage{
			Type:     "complete",
			Message:  "Metadata refreshed successfully",
			Phase:    "complete",
			Success:  true,
			Progress: 100,
		})
	}
}
