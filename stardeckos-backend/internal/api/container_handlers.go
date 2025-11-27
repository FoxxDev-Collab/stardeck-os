package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
	"stardeckos-backend/internal/system"
)

var (
	containerRepo *database.ContainerRepo
	templateRepo  *database.TemplateRepo
	metricsRepo   *database.ContainerMetricsRepo
	envVarRepo    *database.ContainerEnvVarRepo
	podmanService *system.PodmanService
)

// InitContainerRepos initializes container-related repositories
func InitContainerRepos() {
	containerRepo = database.NewContainerRepo()
	templateRepo = database.NewTemplateRepo()
	metricsRepo = database.NewContainerMetricsRepo()
	envVarRepo = database.NewContainerEnvVarRepo()
	podmanService = system.NewPodmanService()
}

// checkPodmanHandler verifies Podman is available
func checkPodmanHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	version, err := podmanService.CheckPodman(ctx)
	if err != nil {
		// Check if podman-compose is available
		composeAvailable := podmanService.CheckPodmanCompose(ctx)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"available":         false,
			"compose_available": composeAvailable,
			"error":             err.Error(),
			"mode":              podmanService.GetMode(),
			"target_user":       podmanService.GetTargetUser(),
			"running_as_root":   podmanService.IsRunningAsRoot(),
		})
	}

	// Check if podman-compose is available
	composeAvailable := podmanService.CheckPodmanCompose(ctx)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"available":         true,
		"version":           version,
		"compose_available": composeAvailable,
		"mode":              podmanService.GetMode(),
		"target_user":       podmanService.GetTargetUser(),
		"running_as_root":   podmanService.IsRunningAsRoot(),
	})
}

// installPodmanHandler installs Podman and related packages via WebSocket for streaming output
func installPodmanHandler(c echo.Context) error {
	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	user := c.Get("user").(*models.User)

	// Send status updates
	sendStatus := func(step, message string, isError bool) {
		ws.WriteJSON(map[string]interface{}{
			"step":    step,
			"message": message,
			"error":   isError,
		})
	}

	// Helper to install package with streaming output
	installPackage := func(step, packageName string) error {
		sendStatus(step, "Installing "+packageName+"...", false)

		ctx := c.Request().Context()
		outputChan := make(chan string, 100)

		// Start goroutine to read output and send to WebSocket
		done := make(chan error, 1)
		go func() {
			done <- podmanService.InstallPackage(ctx, packageName, outputChan)
			close(outputChan)
		}()

		// Stream output lines
		for line := range outputChan {
			ws.WriteJSON(map[string]interface{}{
				"step":   step,
				"output": line,
			})
		}

		return <-done
	}

	// Step 1: Install EPEL release
	if err := installPackage("epel", "epel-release"); err != nil {
		sendStatus("epel", "Failed to install EPEL release: "+err.Error(), true)
		// Continue anyway, might already be installed or not needed
	} else {
		sendStatus("epel", "EPEL release installed successfully", false)
	}

	// Step 2: Install Podman
	if err := installPackage("podman", "podman"); err != nil {
		sendStatus("podman", "Failed to install Podman: "+err.Error(), true)
		ws.WriteJSON(map[string]interface{}{
			"complete": true,
			"success":  false,
			"error":    "Failed to install Podman: " + err.Error(),
		})
		return nil
	}
	sendStatus("podman", "Podman installed successfully", false)

	// Step 3: Install podman-compose
	if err := installPackage("compose", "podman-compose"); err != nil {
		sendStatus("compose", "Failed to install podman-compose: "+err.Error(), true)
		// Not critical, continue
	} else {
		sendStatus("compose", "podman-compose installed successfully", false)
	}

	// Verify installation
	sendStatus("verify", "Verifying installation...", false)
	ctx := c.Request().Context()
	version, err := podmanService.CheckPodman(ctx)
	if err != nil {
		sendStatus("verify", "Verification failed: "+err.Error(), true)
		ws.WriteJSON(map[string]interface{}{
			"complete": true,
			"success":  false,
			"error":    "Installation verification failed",
		})
		return nil
	}

	// Audit log
	logAudit(user, "podman.install", "podman", map[string]interface{}{
		"version": version,
	})

	sendStatus("verify", "Podman v"+version+" installed and verified", false)
	ws.WriteJSON(map[string]interface{}{
		"complete": true,
		"success":  true,
		"version":  version,
	})

	return nil
}

// listContainersHandler returns all containers
func listContainersHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	// Get live container data from Podman
	containers, err := podmanService.ListContainers(ctx)
	if err != nil {
		c.Logger().Error("Failed to list containers: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list containers: " + err.Error(),
		})
	}

	// Collect container IDs for bulk database lookup
	containerIDs := make([]string, len(containers))
	for i, container := range containers {
		containerIDs[i] = container.ContainerID
	}

	// Bulk fetch Stardeck metadata from database (single query instead of N queries)
	dbContainers, err := containerRepo.GetByContainerIDs(containerIDs)
	if err != nil {
		c.Logger().Warn("Failed to fetch container metadata from database: ", err)
		// Continue without database enrichment
	}

	// Enrich with Stardeck metadata from database
	if dbContainers != nil {
		for i := range containers {
			if dbContainer, ok := dbContainers[containers[i].ContainerID]; ok {
				containers[i].ID = dbContainer.ID
				containers[i].HasWebUI = dbContainer.HasWebUI
				containers[i].Icon = dbContainer.Icon
				containers[i].CreatedAt = dbContainer.CreatedAt
			}
		}
	}

	c.Logger().Info("Returning ", len(containers), " containers")
	return c.JSON(http.StatusOK, containers)
}

// getContainerHandler returns details for a specific container
func getContainerHandler(c echo.Context) error {
	id := c.Param("id")
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	// Try to get from database first (by Stardeck ID or Podman ID)
	dbContainer, err := containerRepo.GetByID(id)
	if err == sql.ErrNoRows {
		dbContainer, err = containerRepo.GetByContainerID(id)
	}

	// Get live data from Podman
	containerID := id
	if dbContainer != nil {
		containerID = dbContainer.ContainerID
	}

	inspect, err := podmanService.InspectContainer(ctx, containerID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Container not found: " + err.Error(),
		})
	}

	// Build response
	response := map[string]interface{}{
		"container_id": inspect.ID,
		"name":         inspect.Name,
		"image":        inspect.Config.Image,
		"status":       inspect.State.Status,
		"running":      inspect.State.Running,
		"created":      inspect.Created,
		"started_at":   inspect.State.StartedAt,
		"finished_at":  inspect.State.FinishedAt,
		"exit_code":    inspect.State.ExitCode,
		"pid":          inspect.State.Pid,
		"hostname":     inspect.Config.Hostname,
		"user":         inspect.Config.User,
		"working_dir":  inspect.Config.WorkingDir,
		"entrypoint":   inspect.Config.Entrypoint,
		"cmd":          inspect.Config.Cmd,
		"env":          inspect.Config.Env,
		"labels":       inspect.Config.Labels,
		"restart_policy": map[string]interface{}{
			"name":        inspect.HostConfig.RestartPolicy.Name,
			"max_retries": inspect.HostConfig.RestartPolicy.MaximumRetryCount,
		},
		"network_mode":  inspect.HostConfig.NetworkMode,
		"port_bindings": inspect.HostConfig.PortBindings,
		"memory_limit":  inspect.HostConfig.Memory,
		"mounts":        inspect.Mounts,
		"networks":      inspect.NetworkSettings.Networks,
	}

	// Add Stardeck metadata if available
	if dbContainer != nil {
		response["id"] = dbContainer.ID
		response["has_web_ui"] = dbContainer.HasWebUI
		response["web_ui_port"] = dbContainer.WebUIPort
		response["web_ui_path"] = dbContainer.WebUIPath
		response["icon"] = dbContainer.Icon
		response["auto_start"] = dbContainer.AutoStart
		response["stardeck_created_at"] = dbContainer.CreatedAt
	}

	return c.JSON(http.StatusOK, response)
}

// ValidationResult holds a single validation check result
type ValidationResult struct {
	Check   string `json:"check"`
	Status  string `json:"status"` // "ok", "warning", "error"
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// validateContainerHandler validates container configuration before creation
func validateContainerHandler(c echo.Context) error {
	var req models.CreateContainerRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	results := []ValidationResult{}

	// 1. Validate container name
	if req.Name == "" {
		results = append(results, ValidationResult{
			Check:   "container_name",
			Status:  "warning",
			Message: "No container name specified",
			Details: "A random name will be generated",
		})
	} else {
		// Check if name already exists
		exists, _ := podmanService.ContainerExists(ctx, req.Name)
		if exists {
			results = append(results, ValidationResult{
				Check:   "container_name",
				Status:  "error",
				Message: "Container name already exists",
				Details: fmt.Sprintf("A container named '%s' already exists", req.Name),
			})
		} else {
			results = append(results, ValidationResult{
				Check:   "container_name",
				Status:  "ok",
				Message: "Container name is available",
			})
		}
	}

	// 2. Validate image
	if req.Image == "" {
		results = append(results, ValidationResult{
			Check:   "image",
			Status:  "error",
			Message: "No image specified",
			Details: "An image is required to create a container",
		})
	} else {
		// Check if image exists locally
		imageExists := podmanService.ImageExists(ctx, req.Image)
		if imageExists {
			results = append(results, ValidationResult{
				Check:   "image",
				Status:  "ok",
				Message: "Image found locally",
				Details: req.Image,
			})
		} else {
			results = append(results, ValidationResult{
				Check:   "image",
				Status:  "warning",
				Message: "Image not found locally",
				Details: "Image will be pulled from registry during deployment",
			})
		}
	}

	// 3. Validate ports
	usedPorts := []string{}
	containers, _ := podmanService.ListContainers(ctx)
	for _, container := range containers {
		for _, port := range container.Ports {
			if port.HostPort > 0 {
				usedPorts = append(usedPorts, fmt.Sprintf("%d/%s", port.HostPort, port.Protocol))
			}
		}
	}

	portConflicts := []string{}
	for _, port := range req.Ports {
		portKey := fmt.Sprintf("%d/%s", port.HostPort, port.Protocol)
		for _, used := range usedPorts {
			if portKey == used {
				portConflicts = append(portConflicts, fmt.Sprintf("%d", port.HostPort))
			}
		}
	}

	if len(portConflicts) > 0 {
		results = append(results, ValidationResult{
			Check:   "ports",
			Status:  "error",
			Message: "Port conflicts detected",
			Details: fmt.Sprintf("Ports already in use: %v", portConflicts),
		})
	} else if len(req.Ports) > 0 {
		results = append(results, ValidationResult{
			Check:   "ports",
			Status:  "ok",
			Message: fmt.Sprintf("%d port mapping(s) configured", len(req.Ports)),
		})
	}

	// 4. Validate volumes
	volumeErrors := []string{}
	volumeWarnings := []string{}
	for _, vol := range req.Volumes {
		if vol.Source == "" || vol.Target == "" {
			volumeErrors = append(volumeErrors, "Both source and target paths are required for all volumes")
			break
		}
		// Check if host directory exists
		if !filepath.IsAbs(vol.Source) {
			volumeWarnings = append(volumeWarnings, fmt.Sprintf("'%s' is not an absolute path", vol.Source))
		} else if _, err := os.Stat(vol.Source); os.IsNotExist(err) {
			volumeWarnings = append(volumeWarnings, fmt.Sprintf("'%s' does not exist (will be created)", vol.Source))
		}
	}

	if len(volumeErrors) > 0 {
		results = append(results, ValidationResult{
			Check:   "volumes",
			Status:  "error",
			Message: "Invalid volume configuration",
			Details: volumeErrors[0],
		})
	} else if len(volumeWarnings) > 0 {
		results = append(results, ValidationResult{
			Check:   "volumes",
			Status:  "warning",
			Message: "Volume paths need attention",
			Details: volumeWarnings[0],
		})
	} else if len(req.Volumes) > 0 {
		results = append(results, ValidationResult{
			Check:   "volumes",
			Status:  "ok",
			Message: fmt.Sprintf("%d volume mount(s) configured", len(req.Volumes)),
		})
	}

	// 5. Check overall validity
	hasErrors := false
	for _, r := range results {
		if r.Status == "error" {
			hasErrors = true
			break
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"valid":   !hasErrors,
		"results": results,
	})
}

// deployContainerHandler creates and starts a container with WebSocket streaming
func deployContainerHandler(c echo.Context) error {
	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	// Read the container config from WebSocket
	_, message, err := ws.ReadMessage()
	if err != nil {
		return err
	}

	var req models.CreateContainerRequest
	if err := json.Unmarshal(message, &req); err != nil {
		ws.WriteJSON(map[string]interface{}{
			"step":    "error",
			"message": "Invalid configuration: " + err.Error(),
			"error":   true,
		})
		return nil
	}

	user := c.Get("user").(*models.User)

	// Helper to send status updates
	sendStatus := func(step, message string, isError bool, details map[string]interface{}) {
		payload := map[string]interface{}{
			"step":    step,
			"message": message,
			"error":   isError,
		}
		for k, v := range details {
			payload[k] = v
		}
		ws.WriteJSON(payload)
	}

	ctx := context.Background()

	// Step 1: Validate configuration
	sendStatus("validate", "Validating configuration...", false, nil)
	time.Sleep(300 * time.Millisecond) // Brief pause for UX

	if req.Image == "" {
		sendStatus("validate", "No image specified", true, nil)
		return nil
	}

	// Check container name
	if req.Name != "" {
		exists, _ := podmanService.ContainerExists(ctx, req.Name)
		if exists {
			sendStatus("validate", fmt.Sprintf("Container name '%s' already exists", req.Name), true, nil)
			return nil
		}
	}

	sendStatus("validate", "Configuration validated", false, map[string]interface{}{"complete": true})

	// Step 2: Check/Pull image
	sendStatus("pull", "Checking for image...", false, nil)

	imageExists := podmanService.ImageExists(ctx, req.Image)
	if imageExists {
		sendStatus("pull", "Image found locally", false, map[string]interface{}{"complete": true})
	} else {
		sendStatus("pull", "Pulling image from registry...", false, map[string]interface{}{
			"pulling": true,
		})

		// Pull with streaming output
		outputChan := make(chan string, 100)
		errChan := make(chan error, 1)

		go func() {
			errChan <- podmanService.PullImageWithProgress(ctx, req.Image, outputChan)
		}()

		// Stream pull output
		for line := range outputChan {
			sendStatus("pull", line, false, map[string]interface{}{"output": true})
		}

		if err := <-errChan; err != nil {
			sendStatus("pull", "Failed to pull image: "+err.Error(), true, nil)
			return nil
		}

		sendStatus("pull", "Image pulled successfully", false, map[string]interface{}{"complete": true})
	}

	// Step 3: Create volume directories
	if len(req.Volumes) > 0 {
		sendStatus("volumes", "Creating volume directories...", false, nil)
		for _, vol := range req.Volumes {
			if vol.Source != "" && filepath.IsAbs(vol.Source) {
				if _, err := os.Stat(vol.Source); os.IsNotExist(err) {
					if err := os.MkdirAll(vol.Source, 0755); err != nil {
						sendStatus("volumes", fmt.Sprintf("Failed to create directory '%s': %s", vol.Source, err.Error()), true, nil)
						return nil
					}
				}
			}
		}
		sendStatus("volumes", "Volume directories ready", false, map[string]interface{}{"complete": true})
	}

	// Step 4: Create container
	sendStatus("create", "Creating container...", false, nil)

	containerID, err := podmanService.CreateContainer(ctx, &req)
	if err != nil {
		sendStatus("create", "Failed to create container: "+err.Error(), true, nil)
		return nil
	}

	sendStatus("create", "Container created", false, map[string]interface{}{
		"complete":     true,
		"container_id": containerID,
	})

	// Store in database
	dbContainer := &models.Container{
		ContainerID: containerID,
		Name:        req.Name,
		Image:       req.Image,
		Status:      models.ContainerStatusCreated,
		HasWebUI:    req.HasWebUI,
		WebUIPort:   req.WebUIPort,
		WebUIPath:   req.WebUIPath,
		Icon:        req.Icon,
		AutoStart:   req.AutoStart,
		CreatedBy:   &user.ID,
	}

	if req.Labels != nil {
		labelsJSON, _ := json.Marshal(req.Labels)
		dbContainer.Labels = string(labelsJSON)
	}

	containerRepo.Create(dbContainer)

	// Step 5: Start container (if auto-start enabled)
	if req.AutoStart {
		sendStatus("start", "Starting container...", false, nil)

		if err := podmanService.StartContainer(ctx, containerID); err != nil {
			sendStatus("start", "Failed to start container: "+err.Error(), true, nil)
			return nil
		}

		sendStatus("start", "Container started", false, map[string]interface{}{"complete": true})
	}

	// Final success
	sendStatus("complete", "Container deployed successfully!", false, map[string]interface{}{
		"container_id":   containerID,
		"container_name": req.Name,
		"complete":       true,
	})

	// Audit log
	logAudit(user, models.ActionContainerCreate, req.Name, map[string]interface{}{
		"image":        req.Image,
		"container_id": containerID,
	})

	return nil
}

// createContainerHandler creates a new container
func createContainerHandler(c echo.Context) error {
	var req models.CreateContainerRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 60*time.Second)
	defer cancel()

	// Create container via Podman
	containerID, err := podmanService.CreateContainer(ctx, &req)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create container: " + err.Error(),
		})
	}

	// Get user from context
	user := c.Get("user").(*models.User)

	// Store in database
	dbContainer := &models.Container{
		ContainerID: containerID,
		Name:        req.Name,
		Image:       req.Image,
		Status:      models.ContainerStatusCreated,
		HasWebUI:    req.HasWebUI,
		WebUIPort:   req.WebUIPort,
		WebUIPath:   req.WebUIPath,
		Icon:        req.Icon,
		AutoStart:   req.AutoStart,
		CreatedBy:   &user.ID,
	}

	if req.Labels != nil {
		labelsJSON, _ := json.Marshal(req.Labels)
		dbContainer.Labels = string(labelsJSON)
	}

	if err := containerRepo.Create(dbContainer); err != nil {
		// Container was created in Podman but failed to save metadata
		// Log but don't fail the request
		c.Logger().Errorf("Failed to save container metadata: %v", err)
	}

	// Audit log
	logAudit(user, models.ActionContainerCreate, req.Name, map[string]interface{}{
		"image":        req.Image,
		"container_id": containerID,
	})

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"id":           dbContainer.ID,
		"container_id": containerID,
		"name":         req.Name,
		"status":       "created",
	})
}

// startContainerHandler starts a container
func startContainerHandler(c echo.Context) error {
	id := c.Param("id")
	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	// Resolve container ID
	containerID := resolveContainerID(id)

	if err := podmanService.StartContainer(ctx, containerID); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to start container: " + err.Error(),
		})
	}

	// Update status in database
	updateContainerStatus(id, models.ContainerStatusRunning)

	// Audit log
	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionContainerStart, containerID, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "started",
	})
}

// stopContainerHandler stops a container
func stopContainerHandler(c echo.Context) error {
	id := c.Param("id")
	timeout, _ := strconv.Atoi(c.QueryParam("timeout"))
	if timeout == 0 {
		timeout = 10
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), time.Duration(timeout+5)*time.Second)
	defer cancel()

	containerID := resolveContainerID(id)

	if err := podmanService.StopContainer(ctx, containerID, timeout); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to stop container: " + err.Error(),
		})
	}

	updateContainerStatus(id, models.ContainerStatusExited)

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionContainerStop, containerID, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "stopped",
	})
}

// restartContainerHandler restarts a container
func restartContainerHandler(c echo.Context) error {
	id := c.Param("id")
	timeout, _ := strconv.Atoi(c.QueryParam("timeout"))
	if timeout == 0 {
		timeout = 10
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), time.Duration(timeout+30)*time.Second)
	defer cancel()

	containerID := resolveContainerID(id)

	if err := podmanService.RestartContainer(ctx, containerID, timeout); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to restart container: " + err.Error(),
		})
	}

	updateContainerStatus(id, models.ContainerStatusRunning)

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionContainerRestart, containerID, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "restarted",
	})
}

// removeContainerHandler removes a container
func removeContainerHandler(c echo.Context) error {
	id := c.Param("id")
	force := c.QueryParam("force") == "true"

	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	containerID := resolveContainerID(id)

	if err := podmanService.RemoveContainer(ctx, containerID, force); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to remove container: " + err.Error(),
		})
	}

	// Remove from database
	containerRepo.Delete(id)
	containerRepo.DeleteByContainerID(containerID)
	envVarRepo.DeleteByContainerID(id)

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionContainerRemove, containerID, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "removed",
	})
}

// adoptContainerHandler adopts an existing Podman container into Stardeck's database
// This allows containers created outside Stardeck to be managed and get desktop icons
func adoptContainerHandler(c echo.Context) error {
	var req models.AdoptContainerRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	if req.ContainerID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "container_id is required",
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	// Verify container exists in Podman
	containerInfo, err := podmanService.InspectContainer(ctx, req.ContainerID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Container not found in Podman: " + err.Error(),
		})
	}

	// Check if container is already in database
	existing, _ := containerRepo.GetByContainerID(containerInfo.ID)
	if existing != nil {
		return c.JSON(http.StatusConflict, map[string]string{
			"error": "Container is already managed by Stardeck",
			"id":    existing.ID,
		})
	}

	// Set defaults
	webUIPath := req.WebUIPath
	if webUIPath == "" {
		webUIPath = "/"
	}

	// Map status from Podman state
	status := models.ContainerStatusUnknown
	switch containerInfo.State.Status {
	case "running":
		status = models.ContainerStatusRunning
	case "exited":
		status = models.ContainerStatusExited
	case "paused":
		status = models.ContainerStatusPaused
	case "created":
		status = models.ContainerStatusCreated
	}

	// Create database entry
	user := c.Get("user").(*models.User)
	userID := int64(user.ID)
	dbContainer := &models.Container{
		ContainerID: containerInfo.ID,
		Name:        containerInfo.Name,
		Image:       containerInfo.Config.Image,
		Status:      status,
		HasWebUI:    req.HasWebUI,
		WebUIPort:   req.WebUIPort,
		WebUIPath:   webUIPath,
		Icon:        req.Icon,
		AutoStart:   req.AutoStart,
		CreatedBy:   &userID,
	}

	if err := containerRepo.Create(dbContainer); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to adopt container: " + err.Error(),
		})
	}

	logAudit(user, models.ActionContainerCreate, dbContainer.Name, map[string]interface{}{
		"action":       "adopt",
		"container_id": containerInfo.ID,
		"has_web_ui":   req.HasWebUI,
	})

	c.Logger().Infof("Container %s adopted by %s", containerInfo.Name, user.Username)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"id":           dbContainer.ID,
		"container_id": dbContainer.ContainerID,
		"name":         dbContainer.Name,
		"status":       "adopted",
		"has_web_ui":   dbContainer.HasWebUI,
		"web_ui_port":  dbContainer.WebUIPort,
	})
}

// updateContainerHandler updates container metadata
func updateContainerHandler(c echo.Context) error {
	id := c.Param("id")

	var req models.UpdateContainerRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	dbContainer, err := containerRepo.GetByID(id)
	if err == sql.ErrNoRows {
		dbContainer, err = containerRepo.GetByContainerID(id)
	}
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Container not found",
		})
	}

	// Update fields
	if req.Name != nil {
		dbContainer.Name = *req.Name
	}
	if req.HasWebUI != nil {
		dbContainer.HasWebUI = *req.HasWebUI
	}
	if req.WebUIPort != nil {
		dbContainer.WebUIPort = *req.WebUIPort
	}
	if req.WebUIPath != nil {
		dbContainer.WebUIPath = *req.WebUIPath
	}
	if req.Icon != nil {
		dbContainer.Icon = *req.Icon
	}
	if req.AutoStart != nil {
		dbContainer.AutoStart = *req.AutoStart
	}
	if req.Labels != nil {
		labelsJSON, _ := json.Marshal(req.Labels)
		dbContainer.Labels = string(labelsJSON)
	}

	if err := containerRepo.Update(dbContainer); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to update container: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionContainerUpdate, dbContainer.Name, nil)

	return c.JSON(http.StatusOK, dbContainer)
}

// getContainerLogsHandler streams container logs via WebSocket
func getContainerLogsHandler(c echo.Context) error {
	id := c.Param("id")
	tail, _ := strconv.Atoi(c.QueryParam("tail"))
	if tail == 0 {
		tail = 100
	}

	containerID := resolveContainerID(id)

	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	// Create context that cancels when WebSocket closes
	ctx, cancel := context.WithCancel(c.Request().Context())
	defer cancel()

	// Handle WebSocket close
	go func() {
		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	// Stream logs
	logChan := make(chan models.ContainerLog, 100)
	go func() {
		podmanService.StreamLogs(ctx, containerID, tail, logChan)
		close(logChan)
	}()

	for log := range logChan {
		if err := ws.WriteJSON(log); err != nil {
			return nil
		}
	}

	return nil
}

// getContainerStatsHandler returns real-time stats
func getContainerStatsHandler(c echo.Context) error {
	id := c.Param("id")
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	containerID := resolveContainerID(id)

	stats, err := podmanService.GetContainerStats(ctx, containerID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stats: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, stats)
}

// getContainerMetricsHandler returns historical metrics
func getContainerMetricsHandler(c echo.Context) error {
	id := c.Param("id")
	hours, _ := strconv.Atoi(c.QueryParam("hours"))
	if hours == 0 {
		hours = 24
	}

	metrics, err := metricsRepo.GetRecent(id, hours)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get metrics: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, metrics)
}

// Image handlers

// inspectImageHandler returns configuration hints for an image
// It can optionally pull the image if not found locally
func inspectImageHandler(c echo.Context) error {
	image := c.QueryParam("image")
	if image == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "image parameter is required",
		})
	}

	pull := c.QueryParam("pull") == "true"

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Minute)
	defer cancel()

	config, err := podmanService.InspectImage(ctx, image, pull)
	if err != nil {
		// Check if it's a "not found" error
		if !pull {
			return c.JSON(http.StatusOK, map[string]interface{}{
				"found":  false,
				"error":  err.Error(),
				"config": nil,
			})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to inspect image: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"found":  true,
		"config": config,
	})
}

// inspectImageWSHandler inspects an image with WebSocket streaming for pull progress
func inspectImageWSHandler(c echo.Context) error {
	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	// Read the request from WebSocket
	_, message, err := ws.ReadMessage()
	if err != nil {
		return err
	}

	var req struct {
		Image string `json:"image"`
		Pull  bool   `json:"pull"`
	}
	if err := json.Unmarshal(message, &req); err != nil {
		ws.WriteJSON(map[string]interface{}{
			"error": "Invalid request: " + err.Error(),
		})
		return nil
	}

	if req.Image == "" {
		ws.WriteJSON(map[string]interface{}{
			"error": "image is required",
		})
		return nil
	}

	ctx := context.Background()

	// Check if image exists locally first
	imageExists := podmanService.ImageExists(ctx, req.Image)

	if !imageExists && !req.Pull {
		ws.WriteJSON(map[string]interface{}{
			"found":  false,
			"status": "not_found",
			"error":  "Image not found locally",
		})
		return nil
	}

	if !imageExists && req.Pull {
		// Send status update
		ws.WriteJSON(map[string]interface{}{
			"status":  "pulling",
			"message": "Pulling image...",
		})

		// Pull with streaming output
		outputChan := make(chan string, 100)
		errChan := make(chan error, 1)

		go func() {
			errChan <- podmanService.PullImageWithProgress(ctx, req.Image, outputChan)
		}()

		// Stream pull output
		for line := range outputChan {
			ws.WriteJSON(map[string]interface{}{
				"status": "pulling",
				"output": line,
			})
		}

		if err := <-errChan; err != nil {
			ws.WriteJSON(map[string]interface{}{
				"status": "error",
				"error":  "Failed to pull image: " + err.Error(),
			})
			return nil
		}

		ws.WriteJSON(map[string]interface{}{
			"status":  "pulled",
			"message": "Image pulled successfully",
		})
	}

	// Now inspect the image
	ws.WriteJSON(map[string]interface{}{
		"status":  "inspecting",
		"message": "Inspecting image configuration...",
	})

	config, err := podmanService.InspectImage(ctx, req.Image, false)
	if err != nil {
		ws.WriteJSON(map[string]interface{}{
			"status": "error",
			"error":  "Failed to inspect image: " + err.Error(),
		})
		return nil
	}

	// Send the final result
	ws.WriteJSON(map[string]interface{}{
		"status": "complete",
		"found":  true,
		"config": config,
	})

	return nil
}

// listImagesHandler returns all images
func listImagesHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	images, err := podmanService.ListImages(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list images: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, images)
}

// pullImageHandler pulls an image
func pullImageHandler(c echo.Context) error {
	var req models.PullImageRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Minute)
	defer cancel()

	if err := podmanService.PullImage(ctx, req.Image); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to pull image: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionImagePull, req.Image, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "pulled",
		"image":  req.Image,
	})
}

// removeImageHandler removes an image
func removeImageHandler(c echo.Context) error {
	id := c.Param("id")
	force := c.QueryParam("force") == "true"

	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	if err := podmanService.RemoveImage(ctx, id, force); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to remove image: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionImageRemove, id, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "removed",
	})
}

// Volume handlers

// BindMount represents a bind mount from a container
type BindMount struct {
	HostPath      string `json:"host_path"`
	ContainerPath string `json:"container_path"`
	ContainerID   string `json:"container_id"`
	ContainerName string `json:"container_name"`
	ReadWrite     bool   `json:"rw"`
}

// listBindMountsHandler returns all bind mounts across all containers
func listBindMountsHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	// Get all containers
	containers, err := podmanService.ListContainers(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list containers: " + err.Error(),
		})
	}

	bindMounts := []BindMount{}

	// Inspect each container to get its mounts
	for _, container := range containers {
		inspect, err := podmanService.InspectContainer(ctx, container.ContainerID)
		if err != nil {
			continue // Skip containers that can't be inspected
		}

		for _, mount := range inspect.Mounts {
			// Filter for bind mounts only
			if mount.Type == "bind" {
				bindMounts = append(bindMounts, BindMount{
					HostPath:      mount.Source,
					ContainerPath: mount.Destination,
					ContainerID:   container.ContainerID,
					ContainerName: container.Name,
					ReadWrite:     mount.RW,
				})
			}
		}
	}

	return c.JSON(http.StatusOK, bindMounts)
}

// listVolumesHandler returns all volumes
func listVolumesHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	volumes, err := podmanService.ListVolumes(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list volumes: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, volumes)
}

// createVolumeHandler creates a new volume
func createVolumeHandler(c echo.Context) error {
	var req models.CreateVolumeRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	if err := podmanService.CreateVolume(ctx, &req); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create volume: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionVolumCreate, req.Name, nil)

	return c.JSON(http.StatusCreated, map[string]string{
		"status": "created",
		"name":   req.Name,
	})
}

// removeVolumeHandler removes a volume
func removeVolumeHandler(c echo.Context) error {
	name := c.Param("name")
	force := c.QueryParam("force") == "true"

	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	if err := podmanService.RemoveVolume(ctx, name, force); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to remove volume: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionVolumeRemove, name, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "removed",
	})
}

// Network handlers

// listPodmanNetworksHandler returns all Podman networks
func listPodmanNetworksHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	networks, err := podmanService.ListNetworks(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list networks: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, networks)
}

// createPodmanNetworkHandler creates a new network
func createPodmanNetworkHandler(c echo.Context) error {
	var req models.CreateNetworkRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	if err := podmanService.CreateNetwork(ctx, &req); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create network: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionNetworkCreate, req.Name, nil)

	return c.JSON(http.StatusCreated, map[string]string{
		"status": "created",
		"name":   req.Name,
	})
}

// removePodmanNetworkHandler removes a network
func removePodmanNetworkHandler(c echo.Context) error {
	name := c.Param("name")
	force := c.QueryParam("force") == "true"

	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	if err := podmanService.RemoveNetwork(ctx, name, force); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to remove network: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionNetworkRemove, name, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "removed",
	})
}

// Template handlers

// listTemplatesHandler returns all templates
func listTemplatesHandler(c echo.Context) error {
	templates, err := templateRepo.List()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list templates: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, templates)
}

// getTemplateHandler returns a template by ID
func getTemplateHandler(c echo.Context) error {
	id := c.Param("id")

	template, err := templateRepo.GetByID(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Template not found",
		})
	}

	return c.JSON(http.StatusOK, template)
}

// createTemplateHandler creates a new template
func createTemplateHandler(c echo.Context) error {
	var req models.CreateTemplateRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)

	template := &models.Template{
		Name:           req.Name,
		Description:    req.Description,
		Author:         user.Username,
		Version:        req.Version,
		ComposeContent: req.ComposeContent,
	}

	if req.EnvDefaults != nil {
		envJSON, _ := json.Marshal(req.EnvDefaults)
		template.EnvDefaults = string(envJSON)
	}
	if req.VolumeHints != nil {
		hintsJSON, _ := json.Marshal(req.VolumeHints)
		template.VolumeHints = string(hintsJSON)
	}
	if req.Tags != nil {
		tagsJSON, _ := json.Marshal(req.Tags)
		template.Tags = string(tagsJSON)
	}

	if err := templateRepo.Create(template); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create template: " + err.Error(),
		})
	}

	logAudit(user, models.ActionTemplateCreate, req.Name, nil)

	return c.JSON(http.StatusCreated, template)
}

// deleteTemplateHandler deletes a template
func deleteTemplateHandler(c echo.Context) error {
	id := c.Param("id")

	template, err := templateRepo.GetByID(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Template not found",
		})
	}

	if err := templateRepo.Delete(id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to delete template: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionTemplateDelete, template.Name, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "deleted",
	})
}

// updateTemplateHandler updates a template
func updateTemplateHandler(c echo.Context) error {
	id := c.Param("id")

	template, err := templateRepo.GetByID(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Template not found",
		})
	}

	var req models.CreateTemplateRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	// Update fields
	if req.Name != "" {
		template.Name = req.Name
	}
	if req.Description != "" {
		template.Description = req.Description
	}
	if req.Version != "" {
		template.Version = req.Version
	}
	if req.ComposeContent != "" {
		template.ComposeContent = req.ComposeContent
	}
	if req.EnvDefaults != nil {
		envJSON, _ := json.Marshal(req.EnvDefaults)
		template.EnvDefaults = string(envJSON)
	}
	if req.VolumeHints != nil {
		hintsJSON, _ := json.Marshal(req.VolumeHints)
		template.VolumeHints = string(hintsJSON)
	}
	if req.Tags != nil {
		tagsJSON, _ := json.Marshal(req.Tags)
		template.Tags = string(tagsJSON)
	}

	if err := templateRepo.Update(template); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to update template: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, "template.update", template.Name, nil)

	return c.JSON(http.StatusOK, template)
}

// deployTemplateHandler deploys a stack from a template
func deployTemplateHandler(c echo.Context) error {
	id := c.Param("id")

	template, err := templateRepo.GetByID(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Template not found",
		})
	}

	var req models.DeployTemplateRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	// Generate a project name if not provided
	projectName := req.ProjectName
	if projectName == "" {
		projectName = template.Name + "-" + time.Now().Format("20060102-150405")
	}

	// Parse template environment defaults and merge with request environment
	envVars := make(map[string]string)
	if template.EnvDefaults != "" {
		json.Unmarshal([]byte(template.EnvDefaults), &envVars)
	}
	// Override with request environment
	for k, v := range req.Environment {
		envVars[k] = v
	}

	// Build compose content with variable substitution
	composeContent := template.ComposeContent

	// Create a new stack from the template
	user := c.Get("user").(*models.User)
	userID := user.ID
	stack := &models.Stack{
		Name:           projectName,
		Description:    fmt.Sprintf("Deployed from template: %s", template.Name),
		ComposeContent: composeContent,
		Status:         models.StackStatusStopped,
		CreatedBy:      &userID,
	}

	// Build env content from merged variables
	var envLines []string
	for k, v := range envVars {
		envLines = append(envLines, fmt.Sprintf("%s=%s", k, v))
	}
	if len(envLines) > 0 {
		stack.EnvContent = strings.Join(envLines, "\n")
	}

	// Create the stack in the database
	if err := stackRepo.Create(stack); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create stack: " + err.Error(),
		})
	}

	// Increment template usage count
	templateRepo.IncrementUsage(id)

	logAudit(user, models.ActionTemplateDeploy, template.Name, map[string]interface{}{
		"template_id":  template.ID,
		"project_name": projectName,
		"stack_id":     stack.ID,
	})

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"status":   "created",
		"stack_id": stack.ID,
		"message":  "Stack created from template. Use the stack deploy endpoint to deploy it.",
	})
}

// exportTemplateHandler exports a template as JSON
func exportTemplateHandler(c echo.Context) error {
	id := c.Param("id")

	template, err := templateRepo.GetByID(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Template not found",
		})
	}

	// Build export object with parsed JSON fields
	export := map[string]interface{}{
		"id":              template.ID,
		"name":            template.Name,
		"description":     template.Description,
		"author":          template.Author,
		"version":         template.Version,
		"compose_content": template.ComposeContent,
		"created_at":      template.CreatedAt,
	}

	// Parse JSON fields
	if template.EnvDefaults != "" {
		var envDefaults map[string]string
		if json.Unmarshal([]byte(template.EnvDefaults), &envDefaults) == nil {
			export["env_defaults"] = envDefaults
		}
	}
	if template.VolumeHints != "" {
		var volumeHints []models.VolumeHint
		if json.Unmarshal([]byte(template.VolumeHints), &volumeHints) == nil {
			export["volume_hints"] = volumeHints
		}
	}
	if template.Tags != "" {
		var tags []string
		if json.Unmarshal([]byte(template.Tags), &tags) == nil {
			export["tags"] = tags
		}
	}

	c.Response().Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.json"`, template.Name))
	return c.JSON(http.StatusOK, export)
}

// importTemplateHandler imports a template from JSON
func importTemplateHandler(c echo.Context) error {
	var importData struct {
		Name           string              `json:"name"`
		Description    string              `json:"description"`
		Version        string              `json:"version"`
		ComposeContent string              `json:"compose_content"`
		EnvDefaults    map[string]string   `json:"env_defaults"`
		VolumeHints    []models.VolumeHint `json:"volume_hints"`
		Tags           []string            `json:"tags"`
	}

	if err := c.Bind(&importData); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid import data: " + err.Error(),
		})
	}

	if importData.Name == "" || importData.ComposeContent == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Name and compose_content are required",
		})
	}

	user := c.Get("user").(*models.User)

	template := &models.Template{
		Name:           importData.Name,
		Description:    importData.Description,
		Author:         user.Username,
		Version:        importData.Version,
		ComposeContent: importData.ComposeContent,
	}

	if importData.EnvDefaults != nil {
		envJSON, _ := json.Marshal(importData.EnvDefaults)
		template.EnvDefaults = string(envJSON)
	}
	if importData.VolumeHints != nil {
		hintsJSON, _ := json.Marshal(importData.VolumeHints)
		template.VolumeHints = string(hintsJSON)
	}
	if importData.Tags != nil {
		tagsJSON, _ := json.Marshal(importData.Tags)
		template.Tags = string(tagsJSON)
	}

	if err := templateRepo.Create(template); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to import template: " + err.Error(),
		})
	}

	logAudit(user, models.ActionTemplateCreate, template.Name, map[string]interface{}{
		"imported": true,
	})

	return c.JSON(http.StatusCreated, template)
}

// Desktop apps handler - returns containers with web UIs for desktop icons
func listDesktopAppsHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	// Get containers with web UIs from database
	dbContainers, err := containerRepo.ListWithWebUI()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list desktop apps: " + err.Error(),
		})
	}

	// Get live status from Podman
	liveContainers, _ := podmanService.ListContainers(ctx)
	liveStatus := make(map[string]models.ContainerStatus)
	for _, c := range liveContainers {
		liveStatus[c.ContainerID] = c.Status
	}

	// Build response
	apps := make([]map[string]interface{}, 0, len(dbContainers))
	for _, c := range dbContainers {
		status := c.Status
		if s, ok := liveStatus[c.ContainerID]; ok {
			status = s
		}

		apps = append(apps, map[string]interface{}{
			"id":           c.ID,
			"container_id": c.ContainerID,
			"name":         c.Name,
			"icon":         c.Icon,
			"status":       status,
			"web_ui_port":  c.WebUIPort,
			"web_ui_path":  c.WebUIPath,
		})
	}

	return c.JSON(http.StatusOK, apps)
}

// proxyContainerWebUIHandler proxies requests to a container's web UI
func proxyContainerWebUIHandler(c echo.Context) error {
	containerID := c.Param("id")

	// Resolve to podman container ID
	podmanID := resolveContainerID(containerID)

	// Get container info from database to find web UI port
	container, err := containerRepo.GetByContainerID(podmanID)
	if err != nil {
		// Try by ID
		container, err = containerRepo.GetByID(containerID)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "Container not found",
			})
		}
	}

	if !container.HasWebUI || container.WebUIPort == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Container does not have a web UI configured",
		})
	}

	// Get the target path
	proxyPath := c.Param("*")
	if proxyPath == "" {
		proxyPath = container.WebUIPath
		if proxyPath == "" {
			proxyPath = "/"
		}
	}

	// Ensure path starts with /
	if !strings.HasPrefix(proxyPath, "/") {
		proxyPath = "/" + proxyPath
	}

	// Build target URL - use localhost since container port is mapped to host
	targetURL := fmt.Sprintf("http://localhost:%d%s", container.WebUIPort, proxyPath)
	if c.QueryString() != "" {
		targetURL += "?" + c.QueryString()
	}

	// Create proxy request
	req, err := http.NewRequestWithContext(
		c.Request().Context(),
		c.Request().Method,
		targetURL,
		c.Request().Body,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create proxy request: " + err.Error(),
		})
	}

	// Copy headers (except Host)
	for key, values := range c.Request().Header {
		if key != "Host" {
			for _, value := range values {
				req.Header.Add(key, value)
			}
		}
	}

	// Execute request with longer timeout for slow container apps
	client := &http.Client{
		Timeout: 60 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse // Don't follow redirects
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{
			"error": "Failed to connect to container: " + err.Error(),
		})
	}
	defer resp.Body.Close()

	// Build the proxy base path for URL rewriting
	proxyBasePath := fmt.Sprintf("/api/containers/%s/proxy", containerID)

	// Handle redirects - rewrite Location header to go through proxy
	if location := resp.Header.Get("Location"); location != "" {
		// If it's an absolute path on the container, rewrite to proxy path
		if strings.HasPrefix(location, "/") {
			resp.Header.Set("Location", proxyBasePath+location)
		}
	}

	// Copy response headers (before body)
	for key, values := range resp.Header {
		// Skip Content-Length as we may modify the body
		if key == "Content-Length" {
			continue
		}
		for _, value := range values {
			c.Response().Header().Add(key, value)
		}
	}

	// Check if this is HTML content that might need URL rewriting
	contentType := resp.Header.Get("Content-Type")
	isHTML := strings.Contains(contentType, "text/html")

	if isHTML {
		// Read the body
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Failed to read response: " + err.Error(),
			})
		}

		// Inject a <base> tag to help browsers resolve relative URLs
		// This is cleaner than rewriting all URLs in the HTML
		bodyStr := string(body)

		// Check if there's already a base tag
		if !strings.Contains(strings.ToLower(bodyStr), "<base") {
			// Find <head> and inject base tag after it
			headIdx := strings.Index(strings.ToLower(bodyStr), "<head")
			if headIdx != -1 {
				// Find the end of the head tag
				headEndIdx := strings.Index(bodyStr[headIdx:], ">")
				if headEndIdx != -1 {
					insertPos := headIdx + headEndIdx + 1
					baseTag := fmt.Sprintf(`<base href="%s/">`, proxyBasePath)
					bodyStr = bodyStr[:insertPos] + baseTag + bodyStr[insertPos:]
				}
			}
		}

		c.Response().Header().Set("Content-Length", strconv.Itoa(len(bodyStr)))
		c.Response().WriteHeader(resp.StatusCode)
		c.Response().Write([]byte(bodyStr))
	} else {
		// Non-HTML content, pass through as-is
		c.Response().WriteHeader(resp.StatusCode)
		io.Copy(c.Response().Writer, resp.Body)
	}

	return nil
}

// Helper functions

// resolveContainerID resolves a Stardeck ID or Podman ID to a Podman container ID
func resolveContainerID(id string) string {
	// Try to find in database
	if c, err := containerRepo.GetByID(id); err == nil {
		return c.ContainerID
	}
	// Assume it's already a Podman ID
	return id
}

// updateContainerStatus updates the status in the database
func updateContainerStatus(id string, status models.ContainerStatus) {
	containerRepo.UpdateStatus(id, status)
	// Also try by container ID
	if c, err := containerRepo.GetByContainerID(id); err == nil {
		containerRepo.UpdateStatus(c.ID, status)
	}
}

// logAudit logs an audit event
func logAudit(user *models.User, action, target string, details map[string]interface{}) {
	detailsJSON := ""
	if details != nil {
		b, _ := json.Marshal(details)
		detailsJSON = string(b)
	}

	auditRepo.Create(&models.AuditLog{
		UserID:   user.ID,
		Username: user.Username,
		Action:   action,
		Target:   target,
		Details:  detailsJSON,
	})
}

// Storage configuration handlers

// getStorageConfigHandler returns current Podman storage configuration
func getStorageConfigHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	config, err := podmanService.GetStorageConfig(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get storage config: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, config)
}

// UpdateStorageConfigRequest represents a request to update storage configuration
type UpdateStorageConfigRequest struct {
	GraphRoot string `json:"graph_root" validate:"required"`
}

// updateStorageConfigHandler updates Podman storage configuration
func updateStorageConfigHandler(c echo.Context) error {
	var req UpdateStorageConfigRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	if req.GraphRoot == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "graph_root is required",
		})
	}

	// Validate the path exists and is a directory
	info, err := os.Stat(req.GraphRoot)
	if err != nil {
		if os.IsNotExist(err) {
			// Try to create the directory
			if err := os.MkdirAll(req.GraphRoot, 0755); err != nil {
				return c.JSON(http.StatusBadRequest, map[string]string{
					"error": "Cannot create directory: " + err.Error(),
				})
			}
		} else {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Cannot access path: " + err.Error(),
			})
		}
	} else if !info.IsDir() {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Path is not a directory",
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	// Check if any containers are running
	containers, err := podmanService.ListContainers(ctx)
	if err == nil {
		for _, container := range containers {
			if container.Status == models.ContainerStatusRunning {
				return c.JSON(http.StatusConflict, map[string]string{
					"error": "Cannot change storage while containers are running. Stop all containers first.",
				})
			}
		}
	}

	// Update the storage config
	if err := podmanService.UpdateStorageConfig(ctx, req.GraphRoot); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to update storage config: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, "storage.config.update", req.GraphRoot, map[string]interface{}{
		"graph_root": req.GraphRoot,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"status":  "updated",
		"message": "Storage configuration updated. Podman will use the new location for volumes.",
	})
}
