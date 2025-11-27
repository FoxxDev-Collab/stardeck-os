package system

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"stardeckos-backend/internal/models"
)

// podmanDebug controls whether Podman command execution is logged
var podmanDebug = os.Getenv("STARDECK_PODMAN_DEBUG") == "true"

// PodmanService provides operations for Podman container management
type PodmanService struct {
	// targetUser is the user whose Podman we should query (for rootless mode)
	// If empty and running as root, will use root's Podman
	targetUser string
}

// NewPodmanService creates a new PodmanService
// Auto-detects the appropriate Podman user in this order:
// 1. STARDECK_PODMAN_USER environment variable
// 2. SUDO_USER environment variable (if run via sudo)
// 3. First user with a running Podman socket (if running as root)
func NewPodmanService() *PodmanService {
	targetUser := os.Getenv("STARDECK_PODMAN_USER")

	// If no explicit user set and running as root, try auto-detection
	if targetUser == "" && os.Getuid() == 0 {
		// First check SUDO_USER (the user who invoked sudo)
		if sudoUser := os.Getenv("SUDO_USER"); sudoUser != "" && sudoUser != "root" {
			targetUser = sudoUser
		} else {
			// Try to find a user with Podman containers by scanning /run/user/*/
			targetUser = detectPodmanUser()
		}
	}

	return &PodmanService{
		targetUser: targetUser,
	}
}

// detectPodmanUser attempts to find a user with active Podman containers
// by checking for Podman socket files in /run/user/*/
func detectPodmanUser() string {
	// Check /run/user directories for podman sockets
	entries, err := os.ReadDir("/run/user")
	if err != nil {
		return ""
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		// Check if this user has a podman socket
		socketPath := fmt.Sprintf("/run/user/%s/podman/podman.sock", entry.Name())
		if _, err := os.Stat(socketPath); err == nil {
			// Found a podman socket, get the username for this UID
			uid, err := strconv.Atoi(entry.Name())
			if err != nil {
				continue
			}

			// Get username from /etc/passwd
			cmd := exec.Command("getent", "passwd", fmt.Sprintf("%d", uid))
			output, err := cmd.Output()
			if err != nil {
				continue
			}

			// Parse passwd entry: username:x:uid:gid:...
			parts := strings.Split(string(output), ":")
			if len(parts) > 0 && parts[0] != "" {
				return parts[0]
			}
		}
	}

	return ""
}

// NewPodmanServiceWithUser creates a PodmanService targeting a specific user
func NewPodmanServiceWithUser(user string) *PodmanService {
	return &PodmanService{
		targetUser: user,
	}
}

// GetTargetUser returns the user whose Podman is being used
func (p *PodmanService) GetTargetUser() string {
	return p.targetUser
}

// GetMode returns "rootless" if targeting a user, "rootful" otherwise
func (p *PodmanService) GetMode() string {
	if p.targetUser != "" {
		return "rootless"
	}
	return "rootful"
}

// IsRunningAsRoot returns true if the process is running as root
func (p *PodmanService) IsRunningAsRoot() bool {
	return os.Getuid() == 0
}

// podmanCmd executes a podman command and returns the output
// If running as root and targetUser is set, runs the command as that user
func (p *PodmanService) podmanCmd(ctx context.Context, args ...string) ([]byte, error) {
	var cmd *exec.Cmd
	var cmdStr string

	// Check if we're running as root and have a target user configured
	if os.Getuid() == 0 && p.targetUser != "" {
		// Use sudo -u to run as the target user
		// This allows the root process to access rootless Podman containers
		sudoArgs := []string{"-u", p.targetUser, "podman"}
		sudoArgs = append(sudoArgs, args...)
		cmd = exec.CommandContext(ctx, "sudo", sudoArgs...)
		cmdStr = fmt.Sprintf("sudo -u %s podman %s", p.targetUser, strings.Join(args, " "))
	} else {
		cmd = exec.CommandContext(ctx, "podman", args...)
		cmdStr = fmt.Sprintf("podman %s", strings.Join(args, " "))
	}

	if podmanDebug {
		log.Printf("[PODMAN] Executing: %s", cmdStr)
	}

	startTime := time.Now()
	output, err := cmd.Output()
	duration := time.Since(startTime)

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if podmanDebug {
				log.Printf("[PODMAN] Command failed after %v: %s - stderr: %s", duration, cmdStr, string(exitErr.Stderr))
			}
			return nil, fmt.Errorf("podman error: %s", string(exitErr.Stderr))
		}
		if podmanDebug {
			log.Printf("[PODMAN] Command failed after %v: %s - error: %v", duration, cmdStr, err)
		}
		return nil, err
	}

	if podmanDebug {
		log.Printf("[PODMAN] Command completed in %v: %s (output: %d bytes)", duration, cmdStr, len(output))
	}

	return output, nil
}

// CheckPodman verifies Podman is installed and returns version info
func (p *PodmanService) CheckPodman(ctx context.Context) (string, error) {
	output, err := p.podmanCmd(ctx, "version", "--format", "json")
	if err != nil {
		return "", fmt.Errorf("podman not available: %w", err)
	}

	var version struct {
		Client struct {
			Version string `json:"Version"`
		} `json:"Client"`
	}
	if err := json.Unmarshal(output, &version); err != nil {
		return "", err
	}

	return version.Client.Version, nil
}

// podmanContainer represents the JSON output from podman ps
type podmanContainer struct {
	ID      string   `json:"Id"`
	Names   []string `json:"Names"`
	Image   string   `json:"Image"`
	State   string   `json:"State"`
	Status  string   `json:"Status"`
	Created int64    `json:"Created"` // Unix timestamp
	Ports   []struct {
		HostIP        string `json:"host_ip"`
		HostPort      int    `json:"host_port"`
		ContainerPort int    `json:"container_port"`
		Protocol      string `json:"protocol"`
	} `json:"Ports"`
	Labels map[string]string `json:"Labels"`
	Mounts json.RawMessage    `json:"Mounts"` // Can be string or array, ignored in list
}

// ListContainers returns all containers (running and stopped)
func (p *PodmanService) ListContainers(ctx context.Context) ([]models.ContainerListItem, error) {
	output, err := p.podmanCmd(ctx, "ps", "-a", "--format", "json")
	if err != nil {
		return nil, err
	}

	var containers []podmanContainer
	if err := json.Unmarshal(output, &containers); err != nil {
		return nil, fmt.Errorf("failed to parse container list: %w", err)
	}

	result := make([]models.ContainerListItem, 0, len(containers))
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = c.Names[0]
		}

		ports := make([]models.PortMapping, 0, len(c.Ports))
		for _, port := range c.Ports {
			ports = append(ports, models.PortMapping{
				HostIP:        port.HostIP,
				HostPort:      port.HostPort,
				ContainerPort: port.ContainerPort,
				Protocol:      port.Protocol,
			})
		}

		// Check for Stardeck labels
		hasWebUI := false
		icon := ""
		if c.Labels != nil {
			if val, ok := c.Labels["stardeck.webui"]; ok && val == "true" {
				hasWebUI = true
			}
			if val, ok := c.Labels["stardeck.icon"]; ok {
				icon = val
			}
		}

		result = append(result, models.ContainerListItem{
			ContainerID: c.ID,
			Name:        name,
			Image:       c.Image,
			Status:      mapPodmanStatus(c.State),
			HasWebUI:    hasWebUI,
			Icon:        icon,
			Ports:       ports,
			Uptime:      c.Status,
		})
	}

	return result, nil
}

// normalizeImageName ensures image names have a registry prefix
// If no registry is specified, defaults to docker.io
func normalizeImageName(image string) string {
	// Check if image already has a registry (contains /)
	// Examples:
	// - "nginx" -> "docker.io/nginx"
	// - "nginx:latest" -> "docker.io/nginx:latest"
	// - "docker.io/nginx" -> "docker.io/nginx" (unchanged)
	// - "ghcr.io/user/image" -> "ghcr.io/user/image" (unchanged)
	// - "localhost:5000/myimage" -> "localhost:5000/myimage" (unchanged)

	parts := strings.Split(image, "/")

	// If there's only one part (no slashes) or the first part doesn't look like a registry
	// (doesn't contain a dot or colon), prepend docker.io/
	if len(parts) == 1 {
		// Simple name like "nginx" or "nginx:latest"
		return "docker.io/" + image
	}

	// Check if first part looks like a registry (has . or :)
	firstPart := parts[0]
	if !strings.Contains(firstPart, ".") && !strings.Contains(firstPart, ":") {
		// First part is likely a namespace, not a registry
		// Example: "library/nginx" -> "docker.io/library/nginx"
		return "docker.io/" + image
	}

	// Already has a registry prefix
	return image
}

// mapPodmanStatus maps Podman state strings to our ContainerStatus type
func mapPodmanStatus(state string) models.ContainerStatus {
	switch strings.ToLower(state) {
	case "created":
		return models.ContainerStatusCreated
	case "running":
		return models.ContainerStatusRunning
	case "paused":
		return models.ContainerStatusPaused
	case "restarting":
		return models.ContainerStatusRestarting
	case "removing":
		return models.ContainerStatusRemoving
	case "exited":
		return models.ContainerStatusExited
	case "dead":
		return models.ContainerStatusDead
	default:
		return models.ContainerStatusUnknown
	}
}

// podmanInspect represents detailed container information
type podmanInspect struct {
	ID      string `json:"Id"`
	Created string `json:"Created"`
	Name    string `json:"Name"`
	State   struct {
		Status     string `json:"Status"`
		Running    bool   `json:"Running"`
		Paused     bool   `json:"Paused"`
		Restarting bool   `json:"Restarting"`
		OOMKilled  bool   `json:"OOMKilled"`
		Dead       bool   `json:"Dead"`
		Pid        int    `json:"Pid"`
		ExitCode   int    `json:"ExitCode"`
		Error      string `json:"Error"`
		StartedAt  string `json:"StartedAt"`
		FinishedAt string `json:"FinishedAt"`
	} `json:"State"`
	Config struct {
		Hostname   string            `json:"Hostname"`
		User       string            `json:"User"`
		Env        []string          `json:"Env"`
		Cmd        []string          `json:"Cmd"`
		Image      string            `json:"Image"`
		WorkingDir string            `json:"WorkingDir"`
		Entrypoint []string          `json:"Entrypoint"`
		Labels     map[string]string `json:"Labels"`
	} `json:"Config"`
	HostConfig struct {
		RestartPolicy struct {
			Name              string `json:"Name"`
			MaximumRetryCount int    `json:"MaximumRetryCount"`
		} `json:"RestartPolicy"`
		PortBindings map[string][]struct {
			HostIP   string `json:"HostIp"`
			HostPort string `json:"HostPort"`
		} `json:"PortBindings"`
		Binds       []string `json:"Binds"`
		NetworkMode string   `json:"NetworkMode"`
		Memory      int64    `json:"Memory"`
		NanoCpus    int64    `json:"NanoCpus"`
	} `json:"HostConfig"`
	Mounts []struct {
		Type        string `json:"Type"`
		Source      string `json:"Source"`
		Destination string `json:"Destination"`
		RW          bool   `json:"RW"`
	} `json:"Mounts"`
	NetworkSettings struct {
		Networks map[string]struct {
			IPAddress string `json:"IPAddress"`
			Gateway   string `json:"Gateway"`
			MacAddr   string `json:"MacAddress"`
		} `json:"Networks"`
	} `json:"NetworkSettings"`
}

// InspectContainer returns detailed information about a container
func (p *PodmanService) InspectContainer(ctx context.Context, containerID string) (*podmanInspect, error) {
	output, err := p.podmanCmd(ctx, "inspect", containerID, "--format", "json")
	if err != nil {
		return nil, err
	}

	var containers []podmanInspect
	if err := json.Unmarshal(output, &containers); err != nil {
		return nil, fmt.Errorf("failed to parse container inspect: %w", err)
	}

	if len(containers) == 0 {
		return nil, fmt.Errorf("container not found: %s", containerID)
	}

	return &containers[0], nil
}

// CreateContainer creates a new container
func (p *PodmanService) CreateContainer(ctx context.Context, req *models.CreateContainerRequest) (string, error) {
	args := []string{"create", "--name", req.Name}

	// Add port mappings
	for _, port := range req.Ports {
		portArg := fmt.Sprintf("%d:%d", port.HostPort, port.ContainerPort)
		if port.HostIP != "" {
			portArg = fmt.Sprintf("%s:%s", port.HostIP, portArg)
		}
		if port.Protocol != "" && port.Protocol != "tcp" {
			portArg = fmt.Sprintf("%s/%s", portArg, port.Protocol)
		}
		args = append(args, "-p", portArg)
	}

	// Add volume mounts
	for _, vol := range req.Volumes {
		volArg := fmt.Sprintf("%s:%s", vol.Source, vol.Target)
		if vol.ReadOnly {
			volArg += ":ro"
		}
		args = append(args, "-v", volArg)
	}

	// Add environment variables
	for key, value := range req.Environment {
		args = append(args, "-e", fmt.Sprintf("%s=%s", key, value))
	}

	// Add labels
	for key, value := range req.Labels {
		args = append(args, "--label", fmt.Sprintf("%s=%s", key, value))
	}

	// Add Stardeck labels
	if req.HasWebUI {
		args = append(args, "--label", "stardeck.webui=true")
		if req.WebUIPort > 0 {
			args = append(args, "--label", fmt.Sprintf("stardeck.webui.port=%d", req.WebUIPort))
		}
		if req.WebUIPath != "" {
			args = append(args, "--label", fmt.Sprintf("stardeck.webui.path=%s", req.WebUIPath))
		}
	}
	if req.Icon != "" {
		args = append(args, "--label", fmt.Sprintf("stardeck.icon=%s", req.Icon))
	}

	// Restart policy
	if req.RestartPolicy != "" {
		args = append(args, "--restart", req.RestartPolicy)
	}

	// Resource limits
	if req.CPULimit > 0 {
		args = append(args, "--cpus", fmt.Sprintf("%.2f", req.CPULimit))
	}
	if req.MemoryLimit > 0 {
		args = append(args, "--memory", fmt.Sprintf("%d", req.MemoryLimit))
	}

	// Network mode
	if req.NetworkMode != "" {
		args = append(args, "--network", req.NetworkMode)
	}

	// Hostname
	if req.Hostname != "" {
		args = append(args, "--hostname", req.Hostname)
	}

	// User
	if req.User != "" {
		args = append(args, "--user", req.User)
	}

	// Working directory
	if req.WorkDir != "" {
		args = append(args, "--workdir", req.WorkDir)
	}

	// Entrypoint
	if len(req.Entrypoint) > 0 {
		args = append(args, "--entrypoint", strings.Join(req.Entrypoint, " "))
	}

	// Image - normalize to include registry prefix
	normalizedImage := normalizeImageName(req.Image)
	args = append(args, normalizedImage)

	// Command
	if len(req.Command) > 0 {
		args = append(args, req.Command...)
	}

	output, err := p.podmanCmd(ctx, args...)
	if err != nil {
		return "", err
	}

	containerID := strings.TrimSpace(string(output))
	return containerID, nil
}

// StartContainer starts a stopped container
func (p *PodmanService) StartContainer(ctx context.Context, containerID string) error {
	_, err := p.podmanCmd(ctx, "start", containerID)
	return err
}

// StopContainer stops a running container
func (p *PodmanService) StopContainer(ctx context.Context, containerID string, timeout int) error {
	args := []string{"stop"}
	if timeout > 0 {
		args = append(args, "-t", strconv.Itoa(timeout))
	}
	args = append(args, containerID)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// RestartContainer restarts a container
func (p *PodmanService) RestartContainer(ctx context.Context, containerID string, timeout int) error {
	args := []string{"restart"}
	if timeout > 0 {
		args = append(args, "-t", strconv.Itoa(timeout))
	}
	args = append(args, containerID)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// RemoveContainer removes a container
func (p *PodmanService) RemoveContainer(ctx context.Context, containerID string, force bool) error {
	args := []string{"rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, containerID)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// GetContainerLogs streams container logs
func (p *PodmanService) GetContainerLogs(ctx context.Context, containerID string, tail int, follow bool) (io.ReadCloser, error) {
	args := []string{"logs"}
	if tail > 0 {
		args = append(args, "--tail", strconv.Itoa(tail))
	}
	if follow {
		args = append(args, "-f")
	}
	args = append(args, "--timestamps", containerID)

	// Build command with rootless support
	var cmd *exec.Cmd
	if os.Getuid() == 0 && p.targetUser != "" {
		sudoArgs := []string{"-u", p.targetUser, "podman"}
		sudoArgs = append(sudoArgs, args...)
		cmd = exec.CommandContext(ctx, "sudo", sudoArgs...)
	} else {
		cmd = exec.CommandContext(ctx, "podman", args...)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	// Return a combined reader that also handles cleanup
	return &logReader{
		reader: stdout,
		cmd:    cmd,
	}, nil
}

type logReader struct {
	reader io.ReadCloser
	cmd    *exec.Cmd
}

func (l *logReader) Read(p []byte) (int, error) {
	return l.reader.Read(p)
}

func (l *logReader) Close() error {
	l.reader.Close()
	return l.cmd.Wait()
}

// GetContainerStats gets real-time stats for a container
func (p *PodmanService) GetContainerStats(ctx context.Context, containerID string) (*models.ContainerStats, error) {
	output, err := p.podmanCmd(ctx, "stats", containerID, "--no-stream", "--format", "json")
	if err != nil {
		return nil, err
	}

	var stats []struct {
		ContainerID string `json:"ContainerID"`
		Name        string `json:"Name"`
		CPUPerc     string `json:"CPU"`
		MemUsage    string `json:"MemUsage"`
		MemPerc     string `json:"Mem"`
		NetIO       string `json:"NetIO"`
		BlockIO     string `json:"BlockIO"`
		PIDs        string `json:"PIDs"`
	}
	if err := json.Unmarshal(output, &stats); err != nil {
		return nil, fmt.Errorf("failed to parse stats: %w", err)
	}

	if len(stats) == 0 {
		return nil, fmt.Errorf("no stats available for container: %s", containerID)
	}

	s := stats[0]
	result := &models.ContainerStats{
		ContainerID: containerID,
	}

	// Parse CPU percentage (e.g., "2.5%")
	result.CPUPercent = parsePercentage(s.CPUPerc)

	// Parse memory (e.g., "100MiB / 1GiB")
	result.MemoryUsed, result.MemoryLimit = parseMemoryUsage(s.MemUsage)
	result.MemoryPct = parsePercentage(s.MemPerc)

	// Parse network I/O (e.g., "1.2kB / 3.4kB")
	result.NetworkRx, result.NetworkTx = parseIOStats(s.NetIO)

	// Parse block I/O
	result.BlockRead, result.BlockWrite = parseIOStats(s.BlockIO)

	// Parse PIDs
	result.PIDs, _ = strconv.Atoi(s.PIDs)

	return result, nil
}

// parsePercentage parses a percentage string like "2.5%" into a float64
func parsePercentage(s string) float64 {
	s = strings.TrimSuffix(s, "%")
	val, _ := strconv.ParseFloat(s, 64)
	return val
}

// parseMemoryUsage parses memory usage strings like "100MiB / 1GiB"
func parseMemoryUsage(s string) (used, limit int64) {
	parts := strings.Split(s, "/")
	if len(parts) == 2 {
		used = parsePodmanBytes(strings.TrimSpace(parts[0]))
		limit = parsePodmanBytes(strings.TrimSpace(parts[1]))
	}
	return
}

// parseIOStats parses I/O stats strings like "1.2kB / 3.4kB"
func parseIOStats(s string) (rx, tx int64) {
	parts := strings.Split(s, "/")
	if len(parts) == 2 {
		rx = parsePodmanBytes(strings.TrimSpace(parts[0]))
		tx = parsePodmanBytes(strings.TrimSpace(parts[1]))
	}
	return
}

// parsePodmanBytes parses byte strings like "1.2kB", "100MiB", "1GiB"
func parsePodmanBytes(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "--" || s == "" {
		return 0
	}

	multipliers := map[string]int64{
		"B":   1,
		"kB":  1000,
		"KB":  1000,
		"KiB": 1024,
		"MB":  1000 * 1000,
		"MiB": 1024 * 1024,
		"GB":  1000 * 1000 * 1000,
		"GiB": 1024 * 1024 * 1024,
		"TB":  1000 * 1000 * 1000 * 1000,
		"TiB": 1024 * 1024 * 1024 * 1024,
	}

	for suffix, mult := range multipliers {
		if strings.HasSuffix(s, suffix) {
			numStr := strings.TrimSuffix(s, suffix)
			val, _ := strconv.ParseFloat(numStr, 64)
			return int64(val * float64(mult))
		}
	}

	// Try parsing as plain number
	val, _ := strconv.ParseInt(s, 10, 64)
	return val
}

// Image operations

// podmanImage represents a container image
type podmanImage struct {
	ID         string   `json:"Id"`
	Repository string   `json:"Repository,omitempty"`
	Tag        string   `json:"Tag,omitempty"`
	RepoTags   []string `json:"RepoTags"`
	Size       int64    `json:"Size"`
	Created    int64    `json:"Created"`
	Containers int      `json:"Containers"`
}

// ListImages returns all container images
func (p *PodmanService) ListImages(ctx context.Context) ([]models.Image, error) {
	output, err := p.podmanCmd(ctx, "images", "--format", "json")
	if err != nil {
		return nil, err
	}

	var images []podmanImage
	if err := json.Unmarshal(output, &images); err != nil {
		return nil, fmt.Errorf("failed to parse image list: %w", err)
	}

	result := make([]models.Image, 0, len(images))
	for _, img := range images {
		repo := img.Repository
		tag := img.Tag
		if len(img.RepoTags) > 0 {
			parts := strings.Split(img.RepoTags[0], ":")
			if len(parts) == 2 {
				repo = parts[0]
				tag = parts[1]
			}
		}

		result = append(result, models.Image{
			ID:         img.ID,
			Repository: repo,
			Tag:        tag,
			Size:       img.Size,
			Created:    time.Unix(img.Created, 0),
			Containers: img.Containers,
		})
	}

	return result, nil
}

// PullImage pulls an image from a registry
func (p *PodmanService) PullImage(ctx context.Context, image string) error {
	// Normalize image name to include registry prefix
	normalizedImage := normalizeImageName(image)
	_, err := p.podmanCmd(ctx, "pull", normalizedImage)
	return err
}

// PullImageWithProgress pulls an image and streams progress to a channel
func (p *PodmanService) PullImageWithProgress(ctx context.Context, image string, output chan<- string) error {
	normalizedImage := normalizeImageName(image)

	// Build command with rootless support
	var cmd *exec.Cmd
	if os.Getuid() == 0 && p.targetUser != "" {
		cmd = exec.CommandContext(ctx, "sudo", "-u", p.targetUser, "podman", "pull", normalizedImage)
	} else {
		cmd = exec.CommandContext(ctx, "podman", "pull", normalizedImage)
	}

	// Get stdout and stderr pipes
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		close(output)
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		close(output)
		return err
	}

	if err := cmd.Start(); err != nil {
		close(output)
		return err
	}

	// Read both stdout and stderr with context awareness
	go func() {
		scanner := bufio.NewScanner(io.MultiReader(stdout, stderr))
		for scanner.Scan() {
			select {
			case <-ctx.Done():
				close(output)
				return
			default:
				line := scanner.Text()
				if line != "" {
					select {
					case output <- line:
					case <-ctx.Done():
						close(output)
						return
					}
				}
			}
		}
		close(output)
	}()

	// Handle context cancellation
	go func() {
		<-ctx.Done()
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
	}()

	return cmd.Wait()
}

// ContainerExists checks if a container with the given name exists
func (p *PodmanService) ContainerExists(ctx context.Context, name string) (bool, error) {
	output, err := p.podmanCmd(ctx, "ps", "-a", "--filter", fmt.Sprintf("name=^%s$", name), "--format", "{{.Names}}")
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(string(output)) != "", nil
}

// ImageExists checks if an image exists locally
func (p *PodmanService) ImageExists(ctx context.Context, image string) bool {
	normalizedImage := normalizeImageName(image)
	_, err := p.podmanCmd(ctx, "image", "exists", normalizedImage)
	return err == nil
}

// RemoveImage removes an image
func (p *PodmanService) RemoveImage(ctx context.Context, imageID string, force bool) error {
	args := []string{"rmi"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, imageID)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// Volume operations

// ListVolumes returns all Podman volumes
func (p *PodmanService) ListVolumes(ctx context.Context) ([]models.Volume, error) {
	output, err := p.podmanCmd(ctx, "volume", "ls", "--format", "json")
	if err != nil {
		return nil, err
	}

	var volumes []struct {
		Name       string            `json:"Name"`
		Driver     string            `json:"Driver"`
		MountPoint string            `json:"Mountpoint"`
		CreatedAt  string            `json:"CreatedAt"`
		Labels     map[string]string `json:"Labels"`
		Scope      string            `json:"Scope"`
		Options    map[string]string `json:"Options"`
	}
	if err := json.Unmarshal(output, &volumes); err != nil {
		return nil, fmt.Errorf("failed to parse volume list: %w", err)
	}

	result := make([]models.Volume, 0, len(volumes))
	for _, v := range volumes {
		createdAt, _ := time.Parse(time.RFC3339, v.CreatedAt)
		result = append(result, models.Volume{
			Name:       v.Name,
			Driver:     v.Driver,
			MountPoint: v.MountPoint,
			CreatedAt:  createdAt,
			Labels:     v.Labels,
			Scope:      v.Scope,
			Options:    v.Options,
		})
	}

	return result, nil
}

// CreateVolume creates a new volume
func (p *PodmanService) CreateVolume(ctx context.Context, req *models.CreateVolumeRequest) error {
	args := []string{"volume", "create"}

	if req.Driver != "" {
		args = append(args, "--driver", req.Driver)
	}

	for key, value := range req.Labels {
		args = append(args, "--label", fmt.Sprintf("%s=%s", key, value))
	}

	for key, value := range req.Options {
		args = append(args, "--opt", fmt.Sprintf("%s=%s", key, value))
	}

	args = append(args, req.Name)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// RemoveVolume removes a volume
func (p *PodmanService) RemoveVolume(ctx context.Context, name string, force bool) error {
	args := []string{"volume", "rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, name)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// Network operations

// ListNetworks returns all Podman networks
func (p *PodmanService) ListNetworks(ctx context.Context) ([]models.Network, error) {
	output, err := p.podmanCmd(ctx, "network", "ls", "--format", "json")
	if err != nil {
		return nil, err
	}

	var networks []struct {
		ID        string            `json:"Id"`
		Name      string            `json:"Name"`
		Driver    string            `json:"Driver"`
		Labels    map[string]string `json:"Labels"`
		Internal  bool              `json:"Internal"`
		IPv6      bool              `json:"IPv6"`
		CreatedAt string            `json:"Created"`
		Subnets   []struct {
			Subnet  string `json:"Subnet"`
			Gateway string `json:"Gateway"`
		} `json:"Subnets"`
	}
	if err := json.Unmarshal(output, &networks); err != nil {
		return nil, fmt.Errorf("failed to parse network list: %w", err)
	}

	result := make([]models.Network, 0, len(networks))
	for _, n := range networks {
		createdAt, _ := time.Parse(time.RFC3339, n.CreatedAt)
		subnet := ""
		gateway := ""
		if len(n.Subnets) > 0 {
			subnet = n.Subnets[0].Subnet
			gateway = n.Subnets[0].Gateway
		}
		result = append(result, models.Network{
			ID:        n.ID,
			Name:      n.Name,
			Driver:    n.Driver,
			Subnet:    subnet,
			Gateway:   gateway,
			Internal:  n.Internal,
			IPv6:      n.IPv6,
			Labels:    n.Labels,
			CreatedAt: createdAt,
		})
	}

	return result, nil
}

// CreateNetwork creates a new network
func (p *PodmanService) CreateNetwork(ctx context.Context, req *models.CreateNetworkRequest) error {
	args := []string{"network", "create"}

	if req.Driver != "" {
		args = append(args, "--driver", req.Driver)
	}

	if req.Subnet != "" {
		args = append(args, "--subnet", req.Subnet)
	}

	if req.Gateway != "" {
		args = append(args, "--gateway", req.Gateway)
	}

	if req.Internal {
		args = append(args, "--internal")
	}

	if req.IPv6 {
		args = append(args, "--ipv6")
	}

	for key, value := range req.Labels {
		args = append(args, "--label", fmt.Sprintf("%s=%s", key, value))
	}

	args = append(args, req.Name)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// RemoveNetwork removes a network
func (p *PodmanService) RemoveNetwork(ctx context.Context, name string, force bool) error {
	args := []string{"network", "rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, name)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// Exec runs a command inside a container
func (p *PodmanService) Exec(ctx context.Context, containerID string, cmd []string, interactive bool) ([]byte, error) {
	args := []string{"exec"}
	if interactive {
		args = append(args, "-it")
	}
	args = append(args, containerID)
	args = append(args, cmd...)

	return p.podmanCmd(ctx, args...)
}

// StreamLogs streams logs to a channel (for WebSocket)
func (p *PodmanService) StreamLogs(ctx context.Context, containerID string, tail int, logChan chan<- models.ContainerLog) error {
	args := []string{"logs", "-f", "--timestamps"}
	if tail > 0 {
		args = append(args, "--tail", strconv.Itoa(tail))
	}
	args = append(args, containerID)

	// Build command with rootless support
	var cmd *exec.Cmd
	if os.Getuid() == 0 && p.targetUser != "" {
		sudoArgs := []string{"-u", p.targetUser, "podman"}
		sudoArgs = append(sudoArgs, args...)
		cmd = exec.CommandContext(ctx, "sudo", sudoArgs...)
	} else {
		cmd = exec.CommandContext(ctx, "podman", args...)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	// Use a done channel to signal when goroutines complete
	done := make(chan struct{}, 2)

	// Read stdout with context awareness
	go func() {
		defer func() { done <- struct{}{} }()
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
				line := scanner.Text()
				ts, msg := parseLogLine(line)
				select {
				case logChan <- models.ContainerLog{
					Timestamp: ts,
					Stream:    "stdout",
					Message:   msg,
				}:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	// Read stderr with context awareness
	go func() {
		defer func() { done <- struct{}{} }()
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
				line := scanner.Text()
				ts, msg := parseLogLine(line)
				select {
				case logChan <- models.ContainerLog{
					Timestamp: ts,
					Stream:    "stderr",
					Message:   msg,
				}:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	// Wait for context cancellation or command completion
	go func() {
		<-ctx.Done()
		// Kill the process when context is cancelled
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
	}()

	// Wait for both goroutines to complete
	<-done
	<-done

	// Wait for command to finish (will return error if killed)
	cmd.Wait()
	return ctx.Err()
}

// parseLogLine parses a timestamp-prefixed log line
func parseLogLine(line string) (time.Time, string) {
	// Format: 2024-01-15T12:34:56.789Z message
	if len(line) > 30 {
		tsStr := line[:30]
		ts, err := time.Parse(time.RFC3339Nano, tsStr)
		if err == nil {
			return ts, strings.TrimSpace(line[30:])
		}
	}
	return time.Now(), line
}

// CheckPodmanCompose checks if podman-compose is available
func (p *PodmanService) CheckPodmanCompose(ctx context.Context) bool {
	cmd := exec.CommandContext(ctx, "podman-compose", "version")
	err := cmd.Run()
	return err == nil
}

// InstallPackage installs a package via dnf and streams output
func (p *PodmanService) InstallPackage(ctx context.Context, packageName string, outputChan chan<- string) error {
	cmd := exec.CommandContext(ctx, "sudo", "dnf", "install", "-y", packageName)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %w", err)
	}

	// Read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			outputChan <- scanner.Text()
		}
	}()

	// Read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			outputChan <- scanner.Text()
		}
	}()

	return cmd.Wait()
}

// PauseContainer pauses a running container
func (p *PodmanService) PauseContainer(ctx context.Context, containerID string) error {
	_, err := p.podmanCmd(ctx, "pause", containerID)
	return err
}

// UnpauseContainer unpauses a paused container
func (p *PodmanService) UnpauseContainer(ctx context.Context, containerID string) error {
	_, err := p.podmanCmd(ctx, "unpause", containerID)
	return err
}

// Compose operations

// ComposeUp deploys a compose stack
func (p *PodmanService) ComposeUp(ctx context.Context, projectDir string, projectName string, outputChan chan<- string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "up", "-d")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start compose up: %w", err)
	}

	// Read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	// Read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	return cmd.Wait()
}

// ComposeDown stops and removes a compose stack
func (p *PodmanService) ComposeDown(ctx context.Context, projectDir string, projectName string, removeVolumes bool, outputChan chan<- string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "down")
	if removeVolumes {
		args = append(args, "-v")
	}

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start compose down: %w", err)
	}

	// Read output
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	return cmd.Wait()
}

// ComposeStop stops a compose stack (without removing)
func (p *PodmanService) ComposeStop(ctx context.Context, projectDir string, projectName string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "stop")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir
	return cmd.Run()
}

// ComposeStart starts a stopped compose stack
func (p *PodmanService) ComposeStart(ctx context.Context, projectDir string, projectName string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "start")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir
	return cmd.Run()
}

// ComposeRestart restarts a compose stack
func (p *PodmanService) ComposeRestart(ctx context.Context, projectDir string, projectName string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "restart")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir
	return cmd.Run()
}

// ComposePull pulls images for a compose stack
func (p *PodmanService) ComposePull(ctx context.Context, projectDir string, projectName string, outputChan chan<- string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "pull")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start compose pull: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	return cmd.Wait()
}

// ImageConfig represents the configuration hints extracted from an image
type ImageConfig struct {
	ExposedPorts []ImagePort       `json:"exposed_ports"`
	Environment  []ImageEnvVar     `json:"environment"`
	Volumes      []string          `json:"volumes"`
	Labels       map[string]string `json:"labels"`
	WorkingDir   string            `json:"working_dir"`
	User         string            `json:"user"`
	Entrypoint   []string          `json:"entrypoint"`
	Cmd          []string          `json:"cmd"`
}

// ImagePort represents an exposed port from an image
type ImagePort struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
}

// ImageEnvVar represents an environment variable from an image
type ImageEnvVar struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	HasValue bool   `json:"has_value"` // false if just a key with no default
}

// podmanImageInspect represents the JSON output from podman image inspect
type podmanImageInspect struct {
	ID      string `json:"Id"`
	Digest  string `json:"Digest"`
	RepoTags []string `json:"RepoTags"`
	Config  struct {
		User         string              `json:"User"`
		ExposedPorts map[string]struct{} `json:"ExposedPorts"`
		Env          []string            `json:"Env"`
		Cmd          []string            `json:"Cmd"`
		Volumes      map[string]struct{} `json:"Volumes"`
		WorkingDir   string              `json:"WorkingDir"`
		Entrypoint   []string            `json:"Entrypoint"`
		Labels       map[string]string   `json:"Labels"`
	} `json:"Config"`
}

// InspectImage inspects an image and returns its configuration hints
// If the image doesn't exist locally and pull is true, it will pull it first
func (p *PodmanService) InspectImage(ctx context.Context, image string, pull bool) (*ImageConfig, error) {
	normalizedImage := normalizeImageName(image)

	// Check if image exists locally
	if !p.ImageExists(ctx, image) {
		if !pull {
			return nil, fmt.Errorf("image not found locally: %s", image)
		}
		// Pull the image first
		if err := p.PullImage(ctx, image); err != nil {
			return nil, fmt.Errorf("failed to pull image: %w", err)
		}
	}

	// Inspect the image
	output, err := p.podmanCmd(ctx, "image", "inspect", normalizedImage, "--format", "json")
	if err != nil {
		return nil, fmt.Errorf("failed to inspect image: %w", err)
	}

	var images []podmanImageInspect
	if err := json.Unmarshal(output, &images); err != nil {
		return nil, fmt.Errorf("failed to parse image inspect: %w", err)
	}

	if len(images) == 0 {
		return nil, fmt.Errorf("image not found: %s", image)
	}

	img := images[0]
	config := &ImageConfig{
		ExposedPorts: make([]ImagePort, 0),
		Environment:  make([]ImageEnvVar, 0),
		Volumes:      make([]string, 0),
		Labels:       img.Config.Labels,
		WorkingDir:   img.Config.WorkingDir,
		User:         img.Config.User,
		Entrypoint:   img.Config.Entrypoint,
		Cmd:          img.Config.Cmd,
	}

	// Parse exposed ports (format: "80/tcp" or "53/udp")
	for portSpec := range img.Config.ExposedPorts {
		parts := strings.Split(portSpec, "/")
		if len(parts) >= 1 {
			port, err := strconv.Atoi(parts[0])
			if err != nil {
				continue
			}
			protocol := "tcp"
			if len(parts) >= 2 {
				protocol = parts[1]
			}
			config.ExposedPorts = append(config.ExposedPorts, ImagePort{
				Port:     port,
				Protocol: protocol,
			})
		}
	}

	// Parse environment variables (format: "KEY=value" or just "KEY")
	for _, env := range img.Config.Env {
		parts := strings.SplitN(env, "=", 2)
		envVar := ImageEnvVar{
			Key:      parts[0],
			HasValue: len(parts) > 1,
		}
		if len(parts) > 1 {
			envVar.Value = parts[1]
		}
		config.Environment = append(config.Environment, envVar)
	}

	// Parse volumes
	for volPath := range img.Config.Volumes {
		config.Volumes = append(config.Volumes, volPath)
	}

	return config, nil
}

// InspectImageWithProgress inspects an image with streaming progress for pull
func (p *PodmanService) InspectImageWithProgress(ctx context.Context, image string, pull bool, outputChan chan<- string) (*ImageConfig, error) {
	normalizedImage := normalizeImageName(image)

	// Check if image exists locally
	if !p.ImageExists(ctx, image) {
		if !pull {
			return nil, fmt.Errorf("image not found locally: %s", image)
		}
		// Pull the image with progress
		if err := p.PullImageWithProgress(ctx, image, outputChan); err != nil {
			return nil, fmt.Errorf("failed to pull image: %w", err)
		}
	}

	// Inspect the image
	output, err := p.podmanCmd(ctx, "image", "inspect", normalizedImage, "--format", "json")
	if err != nil {
		return nil, fmt.Errorf("failed to inspect image: %w", err)
	}

	var images []podmanImageInspect
	if err := json.Unmarshal(output, &images); err != nil {
		return nil, fmt.Errorf("failed to parse image inspect: %w", err)
	}

	if len(images) == 0 {
		return nil, fmt.Errorf("image not found: %s", image)
	}

	img := images[0]
	config := &ImageConfig{
		ExposedPorts: make([]ImagePort, 0),
		Environment:  make([]ImageEnvVar, 0),
		Volumes:      make([]string, 0),
		Labels:       img.Config.Labels,
		WorkingDir:   img.Config.WorkingDir,
		User:         img.Config.User,
		Entrypoint:   img.Config.Entrypoint,
		Cmd:          img.Config.Cmd,
	}

	// Parse exposed ports
	for portSpec := range img.Config.ExposedPorts {
		parts := strings.Split(portSpec, "/")
		if len(parts) >= 1 {
			port, err := strconv.Atoi(parts[0])
			if err != nil {
				continue
			}
			protocol := "tcp"
			if len(parts) >= 2 {
				protocol = parts[1]
			}
			config.ExposedPorts = append(config.ExposedPorts, ImagePort{
				Port:     port,
				Protocol: protocol,
			})
		}
	}

	// Parse environment variables
	for _, env := range img.Config.Env {
		parts := strings.SplitN(env, "=", 2)
		envVar := ImageEnvVar{
			Key:      parts[0],
			HasValue: len(parts) > 1,
		}
		if len(parts) > 1 {
			envVar.Value = parts[1]
		}
		config.Environment = append(config.Environment, envVar)
	}

	// Parse volumes
	for volPath := range img.Config.Volumes {
		config.Volumes = append(config.Volumes, volPath)
	}

	return config, nil
}

// GetStackContainers returns containers belonging to a compose project
func (p *PodmanService) GetStackContainers(ctx context.Context, projectName string) ([]models.StackContainer, error) {
	// List containers with the compose project label
	output, err := p.podmanCmd(ctx, "ps", "-a", "--format", "json",
		"--filter", fmt.Sprintf("label=com.docker.compose.project=%s", projectName))
	if err != nil {
		return nil, err
	}

	var containers []podmanContainer
	if err := json.Unmarshal(output, &containers); err != nil {
		return nil, fmt.Errorf("failed to parse container list: %w", err)
	}

	result := make([]models.StackContainer, 0, len(containers))
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = c.Names[0]
		}

		service := ""
		if c.Labels != nil {
			if val, ok := c.Labels["com.docker.compose.service"]; ok {
				service = val
			}
		}

		ports := make([]models.PortMapping, 0, len(c.Ports))
		for _, port := range c.Ports {
			ports = append(ports, models.PortMapping{
				HostIP:        port.HostIP,
				HostPort:      port.HostPort,
				ContainerPort: port.ContainerPort,
				Protocol:      port.Protocol,
			})
		}

		result = append(result, models.StackContainer{
			Name:    name,
			Service: service,
			Status:  mapPodmanStatus(c.State),
			Image:   c.Image,
			Ports:   ports,
		})
	}

	return result, nil
}

// StorageConfig represents Podman storage configuration
type StorageConfig struct {
	GraphRoot  string `json:"graph_root"`
	RunRoot    string `json:"run_root"`
	Driver     string `json:"driver"`
	ConfigPath string `json:"config_path"`
	IsDefault  bool   `json:"is_default"`
}

// GetStorageConfig retrieves current Podman storage configuration
func (p *PodmanService) GetStorageConfig(ctx context.Context) (*StorageConfig, error) {
	// Use podman info to get storage configuration
	output, err := p.podmanCmd(ctx, "info", "--format", "json")
	if err != nil {
		return nil, fmt.Errorf("failed to get podman info: %w", err)
	}

	var info struct {
		Store struct {
			ConfigFile      string `json:"configFile"`
			ContainerStore  struct {
				Number int `json:"number"`
			} `json:"containerStore"`
			GraphDriverName string `json:"graphDriverName"`
			GraphRoot       string `json:"graphRoot"`
			RunRoot         string `json:"runRoot"`
		} `json:"store"`
	}

	if err := json.Unmarshal(output, &info); err != nil {
		return nil, fmt.Errorf("failed to parse podman info: %w", err)
	}

	// Check if using default location
	defaultGraphRoot := "/var/lib/containers/storage"
	isDefault := info.Store.GraphRoot == defaultGraphRoot

	return &StorageConfig{
		GraphRoot:  info.Store.GraphRoot,
		RunRoot:    info.Store.RunRoot,
		Driver:     info.Store.GraphDriverName,
		ConfigPath: info.Store.ConfigFile,
		IsDefault:  isDefault,
	}, nil
}

// UpdateStorageConfig updates the Podman storage configuration
func (p *PodmanService) UpdateStorageConfig(ctx context.Context, graphRoot string) error {
	configPath := "/etc/containers/storage.conf"

	// Read existing config or create new one
	var content string
	existingContent, err := os.ReadFile(configPath)
	if err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("failed to read storage config: %w", err)
		}
		// Create default config with new graphroot
		content = fmt.Sprintf(`# Podman storage configuration
# Modified by Stardeck OS

[storage]
driver = "overlay"
runroot = "/run/containers/storage"
graphroot = "%s"

[storage.options]
additionalimagestores = []

[storage.options.overlay]
mountopt = "nodev,metacopy=on"
`, graphRoot)
	} else {
		// Update existing config
		content = string(existingContent)
		lines := strings.Split(content, "\n")
		var newLines []string
		graphRootSet := false
		inStorage := false

		for _, line := range lines {
			trimmed := strings.TrimSpace(line)

			// Track if we're in [storage] section
			if strings.HasPrefix(trimmed, "[storage]") && !strings.HasPrefix(trimmed, "[storage.") {
				inStorage = true
			} else if strings.HasPrefix(trimmed, "[") && !strings.HasPrefix(trimmed, "[storage") {
				inStorage = false
			}

			// Replace graphroot line
			if inStorage && strings.HasPrefix(trimmed, "graphroot") {
				newLines = append(newLines, fmt.Sprintf(`graphroot = "%s"`, graphRoot))
				graphRootSet = true
			} else {
				newLines = append(newLines, line)
			}
		}

		// If graphroot wasn't found, add it after [storage]
		if !graphRootSet {
			var finalLines []string
			for _, line := range newLines {
				finalLines = append(finalLines, line)
				if strings.TrimSpace(line) == "[storage]" {
					finalLines = append(finalLines, fmt.Sprintf(`graphroot = "%s"`, graphRoot))
				}
			}
			newLines = finalLines
		}

		content = strings.Join(newLines, "\n")
	}

	// Write the config file
	if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write storage config: %w", err)
	}

	// Reset podman storage to apply changes
	// Note: This clears existing storage data, user should be warned in UI
	_, _ = p.podmanCmd(ctx, "system", "reset", "--force")

	return nil
}
