package api

import (
	"context"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
)

// PortInfo represents information about a port in use
type PortInfo struct {
	Port          int    `json:"port"`
	Protocol      string `json:"protocol"`
	ContainerID   string `json:"container_id"`
	ContainerName string `json:"container_name"`
}

// listUsedPortsHandler returns all ports currently in use by containers
func listUsedPortsHandler(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	// Get all containers
	containers, err := podmanService.ListContainers(ctx)
	if err != nil {
		c.Logger().Error("Failed to list containers for ports: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to retrieve port information",
		})
	}

	// Collect all used ports
	usedPorts := make([]PortInfo, 0)
	portMap := make(map[string]bool) // To deduplicate

	for _, container := range containers {
		for _, port := range container.Ports {
			if port.HostPort > 0 {
				key := string(rune(port.HostPort)) + port.Protocol
				if !portMap[key] {
					portMap[key] = true
					usedPorts = append(usedPorts, PortInfo{
						Port:          port.HostPort,
						Protocol:      port.Protocol,
						ContainerID:   container.ContainerID,
						ContainerName: container.Name,
					})
				}
			}
		}
	}

	return c.JSON(http.StatusOK, usedPorts)
}
