package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
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
		})
	}

	// Check if podman-compose is available
	composeAvailable := podmanService.CheckPodmanCompose(ctx)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"available":         true,
		"version":           version,
		"compose_available": composeAvailable,
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

	// Enrich with Stardeck metadata from database
	for i := range containers {
		dbContainer, err := containerRepo.GetByContainerID(containers[i].ContainerID)
		if err == nil && dbContainer != nil {
			containers[i].ID = dbContainer.ID
			containers[i].HasWebUI = dbContainer.HasWebUI
			containers[i].Icon = dbContainer.Icon
			containers[i].CreatedAt = dbContainer.CreatedAt
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
		"network_mode": inspect.HostConfig.NetworkMode,
		"mounts":       inspect.Mounts,
		"networks":     inspect.NetworkSettings.Networks,
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

	// Execute request
	client := &http.Client{
		Timeout: 30 * time.Second,
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

	// Copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			c.Response().Header().Add(key, value)
		}
	}

	// Set status and copy body
	c.Response().WriteHeader(resp.StatusCode)
	io.Copy(c.Response().Writer, resp.Body)

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
