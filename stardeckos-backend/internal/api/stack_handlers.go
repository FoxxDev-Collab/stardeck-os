package api

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

var stackRepo *database.StackRepo

// InitStackRepo initializes the stack repository
func InitStackRepo() {
	stackRepo = database.NewStackRepo()
	database.InitStackTable()
}

const stacksBaseDir = "/var/lib/stardeck/stacks"

// ensureStackDir creates the stack directory if it doesn't exist
func ensureStackDir(stackName string) (string, error) {
	dir := filepath.Join(stacksBaseDir, stackName)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create stack directory: %w", err)
	}
	return dir, nil
}

// writeComposeFiles writes the compose and env files to the stack directory
func writeComposeFiles(dir, composeContent, envContent string) error {
	// Write docker-compose.yml
	composePath := filepath.Join(dir, "docker-compose.yml")
	if err := os.WriteFile(composePath, []byte(composeContent), 0644); err != nil {
		return fmt.Errorf("failed to write compose file: %w", err)
	}

	// Write .env file if provided
	if envContent != "" {
		envPath := filepath.Join(dir, ".env")
		if err := os.WriteFile(envPath, []byte(envContent), 0644); err != nil {
			return fmt.Errorf("failed to write env file: %w", err)
		}
	}

	return nil
}

// listStacksHandler returns all stacks
func listStacksHandler(c echo.Context) error {
	stacks, err := stackRepo.List()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list stacks: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	// Enrich with live container counts
	for i := range stacks {
		containers, err := podmanService.GetStackContainers(ctx, stacks[i].Name)
		if err == nil {
			stacks[i].ContainerCount = len(containers)
			runningCount := 0
			for _, cont := range containers {
				if cont.Status == models.ContainerStatusRunning {
					runningCount++
				}
			}
			stacks[i].RunningCount = runningCount

			// Update status based on container state
			if len(containers) == 0 {
				stacks[i].Status = models.StackStatusStopped
			} else if runningCount == len(containers) {
				stacks[i].Status = models.StackStatusActive
			} else if runningCount > 0 {
				stacks[i].Status = models.StackStatusPartial
			} else {
				stacks[i].Status = models.StackStatusStopped
			}
		}
	}

	return c.JSON(http.StatusOK, stacks)
}

// getStackHandler returns a stack by ID
func getStackHandler(c echo.Context) error {
	id := c.Param("id")

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	// Get live container info
	containers, _ := podmanService.GetStackContainers(ctx, stack.Name)
	stack.ContainerCount = len(containers)
	runningCount := 0
	for _, cont := range containers {
		if cont.Status == models.ContainerStatusRunning {
			runningCount++
		}
	}
	stack.RunningCount = runningCount

	return c.JSON(http.StatusOK, stack)
}

// getStackContainersHandler returns containers belonging to a stack
func getStackContainersHandler(c echo.Context) error {
	id := c.Param("id")

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	containers, err := podmanService.GetStackContainers(ctx, stack.Name)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack containers: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, containers)
}

// createStackHandler creates a new stack
func createStackHandler(c echo.Context) error {
	var req models.CreateStackRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	if req.Name == "" || req.ComposeContent == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Name and compose_content are required",
		})
	}

	// Check if stack already exists
	existing, _ := stackRepo.GetByName(req.Name)
	if existing != nil {
		return c.JSON(http.StatusConflict, map[string]string{
			"error": "Stack with this name already exists",
		})
	}

	// Create stack directory and write files
	dir, err := ensureStackDir(req.Name)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	if err := writeComposeFiles(dir, req.ComposeContent, req.EnvContent); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	user := c.Get("user").(*models.User)

	stack := &models.Stack{
		Name:           req.Name,
		Description:    req.Description,
		ComposeContent: req.ComposeContent,
		EnvContent:     req.EnvContent,
		Status:         models.StackStatusStopped,
		Path:           dir,
		CreatedBy:      &user.ID,
	}

	if err := stackRepo.Create(stack); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create stack: " + err.Error(),
		})
	}

	logAudit(user, models.ActionStackCreate, req.Name, nil)

	return c.JSON(http.StatusCreated, stack)
}

// updateStackHandler updates a stack
func updateStackHandler(c echo.Context) error {
	id := c.Param("id")

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

	var req models.UpdateStackRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	// Update fields
	if req.Name != nil {
		stack.Name = *req.Name
	}
	if req.Description != nil {
		stack.Description = *req.Description
	}
	if req.ComposeContent != nil {
		stack.ComposeContent = *req.ComposeContent
	}
	if req.EnvContent != nil {
		stack.EnvContent = *req.EnvContent
	}

	// Write updated files
	if req.ComposeContent != nil || req.EnvContent != nil {
		if err := writeComposeFiles(stack.Path, stack.ComposeContent, stack.EnvContent); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}
	}

	if err := stackRepo.Update(stack); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to update stack: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionStackUpdate, stack.Name, nil)

	return c.JSON(http.StatusOK, stack)
}

// deleteStackHandler deletes a stack
func deleteStackHandler(c echo.Context) error {
	id := c.Param("id")
	removeVolumes := c.QueryParam("volumes") == "true"

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 60*time.Second)
	defer cancel()

	// Stop and remove containers
	if stack.Path != "" {
		podmanService.ComposeDown(ctx, stack.Path, stack.Name, removeVolumes, nil)
	}

	// Remove stack directory
	if stack.Path != "" {
		os.RemoveAll(stack.Path)
	}

	// Delete from database
	if err := stackRepo.Delete(id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to delete stack: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionStackDelete, stack.Name, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "deleted",
	})
}

// deployStackHandler deploys a stack via WebSocket for streaming output
func deployStackHandler(c echo.Context) error {
	id := c.Param("id")

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

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

	// Update status
	stackRepo.UpdateStatus(stack.ID, models.StackStatusDeploying)

	// Send status updates
	sendStatus := func(message string, isError bool) {
		ws.WriteJSON(map[string]interface{}{
			"message": message,
			"error":   isError,
		})
	}

	ctx := c.Request().Context()
	outputChan := make(chan string, 100)

	// Start goroutine to send output
	done := make(chan error, 1)
	go func() {
		done <- podmanService.ComposeUp(ctx, stack.Path, stack.Name, outputChan)
		close(outputChan)
	}()

	// Stream output
	for line := range outputChan {
		ws.WriteJSON(map[string]interface{}{
			"output": line,
		})
	}

	deployErr := <-done

	if deployErr != nil {
		stackRepo.UpdateStatus(stack.ID, models.StackStatusError)
		sendStatus("Deployment failed: "+deployErr.Error(), true)
		ws.WriteJSON(map[string]interface{}{
			"complete": true,
			"success":  false,
			"error":    deployErr.Error(),
		})
		return nil
	}

	stackRepo.UpdateStatus(stack.ID, models.StackStatusActive)
	logAudit(user, models.ActionStackDeploy, stack.Name, nil)

	sendStatus("Stack deployed successfully", false)
	ws.WriteJSON(map[string]interface{}{
		"complete": true,
		"success":  true,
	})

	return nil
}

// stopStackHandler stops a stack
func stopStackHandler(c echo.Context) error {
	id := c.Param("id")

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 60*time.Second)
	defer cancel()

	if err := podmanService.ComposeStop(ctx, stack.Path, stack.Name); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to stop stack: " + err.Error(),
		})
	}

	stackRepo.UpdateStatus(stack.ID, models.StackStatusStopped)

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionStackStop, stack.Name, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "stopped",
	})
}

// startStackHandler starts a stopped stack
func startStackHandler(c echo.Context) error {
	id := c.Param("id")

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 60*time.Second)
	defer cancel()

	if err := podmanService.ComposeStart(ctx, stack.Path, stack.Name); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to start stack: " + err.Error(),
		})
	}

	stackRepo.UpdateStatus(stack.ID, models.StackStatusActive)

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionStackDeploy, stack.Name, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "started",
	})
}

// restartStackHandler restarts a stack
func restartStackHandler(c echo.Context) error {
	id := c.Param("id")

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 120*time.Second)
	defer cancel()

	if err := podmanService.ComposeRestart(ctx, stack.Path, stack.Name); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to restart stack: " + err.Error(),
		})
	}

	stackRepo.UpdateStatus(stack.ID, models.StackStatusActive)

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionStackDeploy, stack.Name, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "restarted",
	})
}

// pullStackHandler pulls latest images for a stack via WebSocket
func pullStackHandler(c echo.Context) error {
	id := c.Param("id")

	stack, err := stackRepo.GetByID(id)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Stack not found",
		})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get stack: " + err.Error(),
		})
	}

	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	ctx := c.Request().Context()
	outputChan := make(chan string, 100)

	done := make(chan error, 1)
	go func() {
		done <- podmanService.ComposePull(ctx, stack.Path, stack.Name, outputChan)
		close(outputChan)
	}()

	for line := range outputChan {
		ws.WriteJSON(map[string]interface{}{
			"output": line,
		})
	}

	pullErr := <-done

	if pullErr != nil {
		ws.WriteJSON(map[string]interface{}{
			"complete": true,
			"success":  false,
			"error":    pullErr.Error(),
		})
		return nil
	}

	ws.WriteJSON(map[string]interface{}{
		"complete": true,
		"success":  true,
	})

	return nil
}
