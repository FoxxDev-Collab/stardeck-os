package api

import (
	"net/http"
	"strconv"
	"syscall"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/models"
	"stardeckos-backend/internal/system"
)

// Health check
func healthCheck(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status": "ok",
	})
}

// Process handlers
func listProcesses(c echo.Context) error {
	processes, err := system.ListProcesses()
	if err != nil {
		c.Logger().Error("list processes error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list processes",
		})
	}
	return c.JSON(http.StatusOK, processes)
}

func killProcess(c echo.Context) error {
	pidStr := c.Param("pid")
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid PID",
		})
	}

	// Get signal from query param, default to SIGTERM (15)
	signalStr := c.QueryParam("signal")
	signal := syscall.SIGTERM
	if signalStr != "" {
		sigNum, err := strconv.Atoi(signalStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "invalid signal",
			})
		}
		signal = syscall.Signal(sigNum)
	}

	err = system.KillProcess(pid, signal)
	if err != nil {
		c.Logger().Error("kill process error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Log process kill
	Audit.LogFromContext(c, models.ActionProcessKill, pidStr, map[string]interface{}{
		"pid":    pid,
		"signal": int(signal),
	})

	return c.JSON(http.StatusOK, map[string]string{
		"status": "signal sent",
		"pid":    pidStr,
	})
}

// Service handlers
func listServices(c echo.Context) error {
	services, err := system.ListServices()
	if err != nil {
		c.Logger().Error("list services error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list services",
		})
	}
	return c.JSON(http.StatusOK, services)
}

func getService(c echo.Context) error {
	name := c.Param("name")
	if name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "service name required",
		})
	}

	service, err := system.GetService(name)
	if err != nil {
		c.Logger().Error("get service error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, service)
}

func serviceAction(c echo.Context) error {
	name := c.Param("name")
	action := c.Param("action")

	if name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "service name required",
		})
	}

	if action == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "action required",
		})
	}

	err := system.ServiceControl(name, action)
	if err != nil {
		c.Logger().Error("service action error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Log service action
	var auditAction string
	switch action {
	case "start":
		auditAction = models.ActionServiceStart
	case "stop":
		auditAction = models.ActionServiceStop
	case "restart":
		auditAction = models.ActionServiceRestart
	case "reload":
		auditAction = models.ActionServiceReload
	case "enable":
		auditAction = models.ActionServiceEnable
	case "disable":
		auditAction = models.ActionServiceDisable
	default:
		auditAction = "service." + action
	}
	Audit.LogFromContext(c, auditAction, name, map[string]string{
		"service": name,
		"action":  action,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"status":  "success",
		"service": name,
		"action":  action,
	})
}

// Update handlers
func getAvailableUpdates(c echo.Context) error {
	updates, err := system.GetAvailableUpdates()
	if err != nil {
		c.Logger().Error("get updates error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to check for updates",
		})
	}
	return c.JSON(http.StatusOK, updates)
}

func applyUpdates(c echo.Context) error {
	// Parse request body for optional package list
	var req struct {
		Packages []string `json:"packages"`
	}
	c.Bind(&req)

	result, err := system.ApplyUpdates(req.Packages)
	if err != nil {
		c.Logger().Error("apply updates error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to apply updates",
		})
	}

	if !result.Success {
		return c.JSON(http.StatusInternalServerError, result)
	}

	// Log update apply
	Audit.LogFromContext(c, models.ActionUpdateApply, "system", map[string]interface{}{
		"packages":         req.Packages,
		"packages_updated": result.PackagesUpdated,
	})

	return c.JSON(http.StatusOK, result)
}

func getUpdateHistory(c echo.Context) error {
	history, err := system.GetUpdateHistory()
	if err != nil {
		c.Logger().Error("get update history error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get update history",
		})
	}
	return c.JSON(http.StatusOK, history)
}

// Storage handlers
func getDisks(c echo.Context) error {
	disks, err := system.GetDisks()
	if err != nil {
		c.Logger().Error("get disks error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get disk information",
		})
	}
	return c.JSON(http.StatusOK, disks)
}

func getMounts(c echo.Context) error {
	mounts, err := system.GetMounts()
	if err != nil {
		c.Logger().Error("get mounts error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get mount information",
		})
	}
	return c.JSON(http.StatusOK, mounts)
}

func getLVM(c echo.Context) error {
	lvm, err := system.GetLVM()
	if err != nil {
		c.Logger().Error("get LVM error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get LVM information",
		})
	}
	return c.JSON(http.StatusOK, lvm)
}
