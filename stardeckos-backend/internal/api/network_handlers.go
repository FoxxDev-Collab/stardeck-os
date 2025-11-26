package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/models"
	"stardeckos-backend/internal/system"
)

// ===== Network Interface Handlers =====

// listInterfacesHandler handles GET /api/network/interfaces
func listInterfacesHandler(c echo.Context) error {
	interfaces, err := system.GetNetworkInterfaces()
	if err != nil {
		c.Logger().Error("get interfaces error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get network interfaces",
		})
	}

	return c.JSON(http.StatusOK, interfaces)
}

// getInterfaceHandler handles GET /api/network/interfaces/:name
func getInterfaceHandler(c echo.Context) error {
	name := c.Param("name")

	iface, err := system.GetInterfaceByName(name)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, iface)
}

// getInterfaceStatsHandler handles GET /api/network/interfaces/:name/stats
func getInterfaceStatsHandler(c echo.Context) error {
	name := c.Param("name")

	stats, err := system.GetInterfaceStats(name)
	if err != nil {
		c.Logger().Error("get interface stats error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get interface statistics",
		})
	}

	return c.JSON(http.StatusOK, stats)
}

// setInterfaceStateHandler handles POST /api/network/interfaces/:name/state
func setInterfaceStateHandler(c echo.Context) error {
	name := c.Param("name")

	var req struct {
		State string `json:"state"` // "up" or "down"
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	up := req.State == "up"

	if err := system.SetInterfaceState(name, up); err != nil {
		c.Logger().Error("set interface state error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionNetworkConfigure, name, map[string]interface{}{
		"interface": name,
		"state":     req.State,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": fmt.Sprintf("interface %s set to %s", name, req.State),
	})
}

// ===== Firewall Handlers =====

// getFirewallStatusHandler handles GET /api/network/firewall/status
func getFirewallStatusHandler(c echo.Context) error {
	status, err := system.GetFirewallStatus()
	if err != nil {
		c.Logger().Error("get firewall status error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get firewall status",
		})
	}

	return c.JSON(http.StatusOK, status)
}

// listFirewallZonesHandler handles GET /api/network/firewall/zones
func listFirewallZonesHandler(c echo.Context) error {
	zones, err := system.GetFirewallZones()
	if err != nil {
		c.Logger().Error("get firewall zones error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get firewall zones",
		})
	}

	return c.JSON(http.StatusOK, zones)
}

// getFirewallZoneHandler handles GET /api/network/firewall/zones/:zone
func getFirewallZoneHandler(c echo.Context) error {
	zoneName := c.Param("zone")

	zone, err := system.GetFirewallZone(zoneName)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, zone)
}

// createFirewallZoneHandler handles POST /api/network/firewall/zones
func createFirewallZoneHandler(c echo.Context) error {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "zone name is required",
		})
	}

	if err := system.AddFirewallZone(req.Name); err != nil {
		c.Logger().Error("create firewall zone error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallZoneCreate, req.Name, map[string]interface{}{
		"zone": req.Name,
	})

	return c.JSON(http.StatusCreated, map[string]string{
		"message": "zone created successfully",
	})
}

// deleteFirewallZoneHandler handles DELETE /api/network/firewall/zones/:zone
func deleteFirewallZoneHandler(c echo.Context) error {
	zoneName := c.Param("zone")

	if err := system.DeleteFirewallZone(zoneName); err != nil {
		c.Logger().Error("delete firewall zone error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallZoneDelete, zoneName, map[string]interface{}{
		"zone": zoneName,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "zone deleted successfully",
	})
}

// addFirewallServiceHandler handles POST /api/network/firewall/zones/:zone/services
func addFirewallServiceHandler(c echo.Context) error {
	zoneName := c.Param("zone")

	var req struct {
		Service   string `json:"service"`
		Permanent bool   `json:"permanent"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Service == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "service name is required",
		})
	}

	if err := system.AddFirewallService(zoneName, req.Service, req.Permanent); err != nil {
		c.Logger().Error("add firewall service error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallRuleCreate, zoneName+"/"+req.Service, map[string]interface{}{
		"zone":      zoneName,
		"service":   req.Service,
		"permanent": req.Permanent,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "service added successfully",
	})
}

// removeFirewallServiceHandler handles DELETE /api/network/firewall/zones/:zone/services/:service
func removeFirewallServiceHandler(c echo.Context) error {
	zoneName := c.Param("zone")
	service := c.Param("service")
	permanent := c.QueryParam("permanent") == "true"

	if err := system.RemoveFirewallService(zoneName, service, permanent); err != nil {
		c.Logger().Error("remove firewall service error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallRuleDelete, zoneName+"/"+service, map[string]interface{}{
		"zone":      zoneName,
		"service":   service,
		"permanent": permanent,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "service removed successfully",
	})
}

// addFirewallPortHandler handles POST /api/network/firewall/zones/:zone/ports
func addFirewallPortHandler(c echo.Context) error {
	zoneName := c.Param("zone")

	var req struct {
		Port      int    `json:"port"`
		Protocol  string `json:"protocol"` // tcp or udp
		Permanent bool   `json:"permanent"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Port <= 0 || req.Port > 65535 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid port number",
		})
	}

	if req.Protocol != "tcp" && req.Protocol != "udp" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "protocol must be tcp or udp",
		})
	}

	if err := system.AddFirewallPort(zoneName, req.Port, req.Protocol, req.Permanent); err != nil {
		c.Logger().Error("add firewall port error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallRuleCreate, fmt.Sprintf("%s/%d/%s", zoneName, req.Port, req.Protocol), map[string]interface{}{
		"zone":      zoneName,
		"port":      req.Port,
		"protocol":  req.Protocol,
		"permanent": req.Permanent,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "port added successfully",
	})
}

// removeFirewallPortHandler handles DELETE /api/network/firewall/zones/:zone/ports/:port
func removeFirewallPortHandler(c echo.Context) error {
	zoneName := c.Param("zone")
	portParam := c.Param("port") // format: "port/protocol" e.g., "8080/tcp"

	// Parse port/protocol
	var port int
	var protocol string
	_, err := fmt.Sscanf(portParam, "%d/%s", &port, &protocol)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid port format, expected port/protocol (e.g., 8080/tcp)",
		})
	}

	permanent := c.QueryParam("permanent") == "true"

	if err := system.RemoveFirewallPort(zoneName, port, protocol, permanent); err != nil {
		c.Logger().Error("remove firewall port error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallRuleDelete, fmt.Sprintf("%s/%d/%s", zoneName, port, protocol), map[string]interface{}{
		"zone":      zoneName,
		"port":      port,
		"protocol":  protocol,
		"permanent": permanent,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "port removed successfully",
	})
}

// addFirewallRichRuleHandler handles POST /api/network/firewall/zones/:zone/rules
func addFirewallRichRuleHandler(c echo.Context) error {
	zoneName := c.Param("zone")

	var req struct {
		Rule      string `json:"rule"`
		Permanent bool   `json:"permanent"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Rule == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "rule is required",
		})
	}

	if err := system.AddFirewallRichRule(zoneName, req.Rule, req.Permanent); err != nil {
		c.Logger().Error("add firewall rich rule error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallRuleCreate, zoneName, map[string]interface{}{
		"zone":      zoneName,
		"rule":      req.Rule,
		"permanent": req.Permanent,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "rich rule added successfully",
	})
}

// removeFirewallRichRuleHandler handles DELETE /api/network/firewall/zones/:zone/rules
func removeFirewallRichRuleHandler(c echo.Context) error {
	zoneName := c.Param("zone")

	var req struct {
		Rule      string `json:"rule"`
		Permanent bool   `json:"permanent"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Rule == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "rule is required",
		})
	}

	if err := system.RemoveFirewallRichRule(zoneName, req.Rule, req.Permanent); err != nil {
		c.Logger().Error("remove firewall rich rule error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallRuleDelete, zoneName, map[string]interface{}{
		"zone":      zoneName,
		"rule":      req.Rule,
		"permanent": req.Permanent,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "rich rule removed successfully",
	})
}

// reloadFirewallHandler handles POST /api/network/firewall/reload
func reloadFirewallHandler(c echo.Context) error {
	if err := system.ReloadFirewall(); err != nil {
		c.Logger().Error("reload firewall error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionNetworkConfigure, "firewall", map[string]interface{}{
		"action": "reload",
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "firewall reloaded successfully",
	})
}

// getAvailableServicesHandler handles GET /api/network/firewall/services
func getAvailableServicesHandler(c echo.Context) error {
	services, err := system.GetAvailableServices()
	if err != nil {
		c.Logger().Error("get available services error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get available services",
		})
	}

	return c.JSON(http.StatusOK, services)
}

// setDefaultZoneHandler handles POST /api/network/firewall/default-zone
func setDefaultZoneHandler(c echo.Context) error {
	var req struct {
		Zone string `json:"zone"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Zone == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "zone is required",
		})
	}

	if err := system.SetDefaultZone(req.Zone); err != nil {
		c.Logger().Error("set default zone error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionFirewallZoneUpdate, req.Zone, map[string]interface{}{
		"zone":   req.Zone,
		"action": "set_default",
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "default zone set successfully",
	})
}

// ===== Routing Handlers =====

// listRoutesHandler handles GET /api/network/routes
func listRoutesHandler(c echo.Context) error {
	routes, err := system.GetRoutes()
	if err != nil {
		c.Logger().Error("get routes error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get routes",
		})
	}

	return c.JSON(http.StatusOK, routes)
}

// addRouteHandler handles POST /api/network/routes
func addRouteHandler(c echo.Context) error {
	var req system.AddRouteRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Destination == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "destination is required",
		})
	}

	if err := system.AddRoute(&req); err != nil {
		c.Logger().Error("add route error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionRouteAdd, req.Destination, map[string]interface{}{
		"destination": req.Destination,
		"gateway":     req.Gateway,
		"interface":   req.Interface,
		"metric":      req.Metric,
	})

	return c.JSON(http.StatusCreated, map[string]string{
		"message": "route added successfully",
	})
}

// deleteRouteHandler handles DELETE /api/network/routes/:destination
func deleteRouteHandler(c echo.Context) error {
	destination := c.Param("destination")

	if err := system.DeleteRoute(destination); err != nil {
		c.Logger().Error("delete route error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	// Audit log
	Audit.LogFromContext(c, models.ActionRouteDelete, destination, map[string]interface{}{
		"destination": destination,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "route deleted successfully",
	})
}

// ===== DNS Handlers =====

// getDNSConfigHandler handles GET /api/network/dns
func getDNSConfigHandler(c echo.Context) error {
	config, err := system.GetDNSConfig()
	if err != nil {
		c.Logger().Error("get DNS config error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get DNS configuration",
		})
	}

	return c.JSON(http.StatusOK, config)
}

// ===== Connection Handlers =====

// listConnectionsHandler handles GET /api/network/connections
func listConnectionsHandler(c echo.Context) error {
	protocol := c.QueryParam("protocol") // tcp, udp, tcp6, udp6
	state := c.QueryParam("state")       // ESTABLISHED, LISTEN, etc.

	connections, err := system.GetConnections(protocol, state)
	if err != nil {
		c.Logger().Error("get connections error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get connections",
		})
	}

	return c.JSON(http.StatusOK, connections)
}

// Helper function to parse port from string
func parsePort(s string) (int, error) {
	return strconv.Atoi(s)
}
