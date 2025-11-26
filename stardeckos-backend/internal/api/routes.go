package api

import (
	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/auth"
	"stardeckos-backend/internal/models"
)

// RegisterRoutes sets up all API routes
func RegisterRoutes(api *echo.Group, authSvc *auth.Service) {
	// Initialize services
	InitAuthService()
	InitUserRepo()
	InitGroupRepo()
	InitRealmRepo()
	InitAuditRepo()
	InitContainerRepos()
	InitStackRepo()

	// Store authSvc for use in handlers
	authService = authSvc

	// Health check (public)
	api.GET("/health", healthCheck)

	// Auth routes (public - no auth required for login)
	authGroup := api.Group("/auth")
	authGroup.POST("/login", loginHandler, auth.LoginRateLimiter.Middleware())
	authGroup.POST("/logout", logoutHandler)
	authGroup.POST("/refresh", refreshTokenHandler)
	authGroup.GET("/me", getCurrentUser)

	// Protected auth routes
	authProtected := authGroup.Group("")
	authProtected.Use(auth.RequireAuth(authSvc))
	authProtected.GET("/sessions", getUserSessions)
	authProtected.DELETE("/sessions/:id", revokeSession)

	// User management routes (requires wheel group or root for PAM users, admin for local users)
	users := api.Group("/users")
	users.Use(auth.RequireAuth(authSvc))
	users.Use(auth.RequireWheelOrRoot(authSvc))
	users.GET("", listUsersHandler)
	users.POST("", createUserHandler)
	users.GET("/:id", getUserHandler)
	users.PUT("/:id", updateUserHandler)
	users.DELETE("/:id", deleteUserHandler)

	// Group management routes (requires wheel group or root)
	groups := api.Group("/groups")
	groups.Use(auth.RequireAuth(authSvc))
	groups.Use(auth.RequireWheelOrRoot(authSvc))
	groups.GET("", listGroupsHandler)
	groups.POST("", createGroupHandler)
	groups.GET("/:id", getGroupHandler)
	groups.PUT("/:id", updateGroupHandler)
	groups.DELETE("/:id", deleteGroupHandler)
	groups.POST("/:id/members", addGroupMembersHandler)
	groups.DELETE("/:id/members/:userId", removeGroupMemberHandler)
	groups.GET("/:id/members", listGroupMembersHandler)

	// Realm management routes (requires wheel group or root)
	realms := api.Group("/realms")
	realms.Use(auth.RequireAuth(authSvc))
	realms.Use(auth.RequireWheelOrRoot(authSvc))
	realms.GET("", listRealmsHandler)
	realms.POST("", createRealmHandler)
	realms.GET("/:id", getRealmHandler)
	realms.PUT("/:id", updateRealmHandler)
	realms.DELETE("/:id", deleteRealmHandler)

	// System routes (authenticated, admin for critical operations)
	system := api.Group("/system")
	system.Use(auth.RequireAuth(authSvc))
	system.GET("/resources", getResourcesHandler)
	system.GET("/info", getSystemInfoHandler)
	system.GET("/groups", listSystemGroupsHandler) // View system groups
	system.POST("/reboot", rebootSystemHandler, auth.RequireRole(models.RoleAdmin))

	// Process routes (authenticated, kill requires operator+)
	processes := api.Group("/processes")
	processes.Use(auth.RequireAuth(authSvc))
	processes.GET("", listProcesses)
	processes.DELETE("/:pid", killProcess, auth.RequireOperatorOrAdmin())

	// Service routes (authenticated, actions require operator+)
	services := api.Group("/services")
	services.Use(auth.RequireAuth(authSvc))
	services.GET("", listServices)
	services.GET("/:name", getService)
	services.POST("/:name/:action", serviceAction, auth.RequireOperatorOrAdmin())

	// Update routes (authenticated, apply requires admin)
	updates := api.Group("/updates")
	updates.Use(auth.RequireAuth(authSvc))
	updates.GET("/available", getAvailableUpdates)
	updates.POST("/apply", applyUpdates, auth.RequireRole(models.RoleAdmin))
	updates.GET("/history", getUpdateHistory)

	// Repository routes (authenticated, requires wheel/root)
	repos := api.Group("/repositories")
	repos.Use(auth.RequireAuth(authSvc))
	repos.GET("", getRepositoriesHandler, auth.RequireWheelOrRoot(authSvc))
	repos.POST("", addRepositoryHandler, auth.RequireWheelOrRoot(authSvc))
	repos.PUT("/:id", updateRepositoryHandler, auth.RequireWheelOrRoot(authSvc))
	repos.DELETE("/:id", deleteRepositoryHandler, auth.RequireWheelOrRoot(authSvc))

	// Package routes (authenticated, requires wheel/root for install/remove)
	packages := api.Group("/packages")
	packages.Use(auth.RequireAuth(authSvc))
	packages.GET("/search", searchPackagesHandler)
	packages.GET("/:name", getPackageInfoHandler)
	packages.POST("/install", installPackagesHandler, auth.RequireWheelOrRoot(authSvc))
	packages.POST("/remove", removePackagesHandler, auth.RequireWheelOrRoot(authSvc))

	// Metadata routes (authenticated, requires wheel/root)
	metadata := api.Group("/metadata")
	metadata.Use(auth.RequireAuth(authSvc))
	metadata.POST("/refresh", refreshMetadataHandler, auth.RequireWheelOrRoot(authSvc))

	// Storage routes (authenticated, read-only for viewing, wheel/root for management)
	storage := api.Group("/storage")
	storage.Use(auth.RequireAuth(authSvc))
	storage.GET("/disks", getDisks)
	storage.GET("/mounts", getMounts)
	storage.GET("/lvm", getLVM)
	// Storage management (requires wheel/root)
	storage.GET("/partitions/:device", getPartitionTableHandler, auth.RequireWheelOrRoot(authSvc))
	storage.POST("/partitions", createPartitionHandler, auth.RequireWheelOrRoot(authSvc))
	storage.DELETE("/partitions", deletePartitionHandler, auth.RequireWheelOrRoot(authSvc))
	storage.POST("/format", formatPartitionHandler, auth.RequireWheelOrRoot(authSvc))
	storage.POST("/mount", mountHandler, auth.RequireWheelOrRoot(authSvc))
	storage.POST("/unmount", unmountHandler, auth.RequireWheelOrRoot(authSvc))

	// File browser routes (authenticated)
	files := api.Group("/files")
	files.Use(auth.RequireAuth(authSvc))
	files.GET("", listFilesHandler)
	files.GET("/info", getFileInfoHandler)
	files.GET("/download", downloadFileHandler)
	files.GET("/preview", previewFileHandler)
	files.POST("/upload", uploadFileHandler)
	files.POST("/mkdir", createDirectoryHandler)
	files.POST("/create", createFileHandler)
	files.PUT("/content", updateFileHandler)
	files.POST("/rename", renameFileHandler)
	files.POST("/copy", copyFileHandler)
	files.DELETE("", deleteFileHandler)
	files.PATCH("/permissions", changePermissionsHandler)

	// Audit log routes (requires admin)
	audit := api.Group("/audit")
	audit.Use(auth.RequireAuth(authSvc))
	audit.Use(auth.RequireRole(models.RoleAdmin))
	audit.GET("", listAuditLogsHandler)
	audit.GET("/actions", getAuditActionsHandler)
	audit.GET("/stats", getAuditStatsHandler)
	audit.GET("/:id", getAuditLogHandler)

	// Terminal WebSocket route (authentication handled inside handler due to WebSocket limitations)
	api.GET("/terminal/ws", HandleTerminalWebSocket)

	// Package operation WebSocket route (streaming DNF output)
	api.GET("/packages/ws", HandlePackageOperationWebSocket)

	// Network management routes
	network := api.Group("/network")
	network.Use(auth.RequireAuth(authSvc))

	// Interface routes (read: all users, write: admin only)
	network.GET("/interfaces", listInterfacesHandler)
	network.GET("/interfaces/:name", getInterfaceHandler)
	network.GET("/interfaces/:name/stats", getInterfaceStatsHandler)
	network.POST("/interfaces/:name/state", setInterfaceStateHandler, auth.RequireRole(models.RoleAdmin))

	// Firewall routes (read: all users, write: admin only)
	network.GET("/firewall/status", getFirewallStatusHandler)
	network.GET("/firewall/zones", listFirewallZonesHandler)
	network.GET("/firewall/zones/:zone", getFirewallZoneHandler)
	network.GET("/firewall/services", getAvailableServicesHandler)
	network.POST("/firewall/zones", createFirewallZoneHandler, auth.RequireRole(models.RoleAdmin))
	network.DELETE("/firewall/zones/:zone", deleteFirewallZoneHandler, auth.RequireRole(models.RoleAdmin))
	network.POST("/firewall/zones/:zone/services", addFirewallServiceHandler, auth.RequireRole(models.RoleAdmin))
	network.DELETE("/firewall/zones/:zone/services/:service", removeFirewallServiceHandler, auth.RequireRole(models.RoleAdmin))
	network.POST("/firewall/zones/:zone/ports", addFirewallPortHandler, auth.RequireRole(models.RoleAdmin))
	network.DELETE("/firewall/zones/:zone/ports/:port", removeFirewallPortHandler, auth.RequireRole(models.RoleAdmin))
	network.POST("/firewall/zones/:zone/rules", addFirewallRichRuleHandler, auth.RequireRole(models.RoleAdmin))
	network.DELETE("/firewall/zones/:zone/rules", removeFirewallRichRuleHandler, auth.RequireRole(models.RoleAdmin))
	network.POST("/firewall/reload", reloadFirewallHandler, auth.RequireRole(models.RoleAdmin))
	network.POST("/firewall/default-zone", setDefaultZoneHandler, auth.RequireRole(models.RoleAdmin))

	// Route management (read: all users, write: admin only)
	network.GET("/routes", listRoutesHandler)
	network.POST("/routes", addRouteHandler, auth.RequireRole(models.RoleAdmin))
	network.DELETE("/routes/:destination", deleteRouteHandler, auth.RequireRole(models.RoleAdmin))

	// DNS configuration (read-only)
	network.GET("/dns", getDNSConfigHandler)

	// Active connections (read-only)
	network.GET("/connections", listConnectionsHandler)

	// Docker Hub image search (public endpoint with auth)
	api.GET("/dockerhub/search", searchDockerHubHandler, auth.RequireAuth(authSvc))

	// Port information endpoint (requires auth)
	api.GET("/ports/used", listUsedPortsHandler, auth.RequireAuth(authSvc))

	// Container management routes (Phase 2B)
	containers := api.Group("/containers")
	containers.Use(auth.RequireAuth(authSvc))

	// Podman availability check
	containers.GET("/check", checkPodmanHandler)

	// Podman installation WebSocket (admin only)
	containers.GET("/install", installPodmanHandler)

	// Container operations (read: all, write: operator+, create/delete: admin)
	containers.GET("", listContainersHandler)
	containers.GET("/:id", getContainerHandler)
	containers.POST("", createContainerHandler, auth.RequireRole(models.RoleAdmin))
	containers.POST("/validate", validateContainerHandler, auth.RequireRole(models.RoleAdmin))
	containers.GET("/deploy", deployContainerHandler, auth.RequireRole(models.RoleAdmin)) // WebSocket
	containers.PUT("/:id", updateContainerHandler, auth.RequireRole(models.RoleAdmin))
	containers.DELETE("/:id", removeContainerHandler, auth.RequireRole(models.RoleAdmin))
	containers.POST("/:id/start", startContainerHandler, auth.RequireOperatorOrAdmin())
	containers.POST("/:id/stop", stopContainerHandler, auth.RequireOperatorOrAdmin())
	containers.POST("/:id/restart", restartContainerHandler, auth.RequireOperatorOrAdmin())
	containers.GET("/:id/logs", getContainerLogsHandler)
	containers.GET("/:id/stats", getContainerStatsHandler)
	containers.GET("/:id/metrics", getContainerMetricsHandler)

	// Container web UI proxy (proxies to container's web interface)
	containers.Any("/:id/proxy", proxyContainerWebUIHandler)
	containers.Any("/:id/proxy/*", proxyContainerWebUIHandler)

	// Image management (read: all, write: admin)
	images := api.Group("/images")
	images.Use(auth.RequireAuth(authSvc))
	images.GET("", listImagesHandler)
	images.GET("/inspect", inspectImageHandler)           // Check if image exists and get config
	images.GET("/inspect/ws", inspectImageWSHandler)      // WebSocket: pull + inspect with progress
	images.POST("/pull", pullImageHandler, auth.RequireRole(models.RoleAdmin))
	images.DELETE("/:id", removeImageHandler, auth.RequireRole(models.RoleAdmin))

	// Volume management (read: all, write: admin)
	volumes := api.Group("/volumes")
	volumes.Use(auth.RequireAuth(authSvc))
	volumes.GET("", listVolumesHandler)
	volumes.POST("", createVolumeHandler, auth.RequireRole(models.RoleAdmin))
	volumes.DELETE("/:name", removeVolumeHandler, auth.RequireRole(models.RoleAdmin))

	// Bind mounts endpoint (aggregates bind mounts from all containers)
	api.GET("/bind-mounts", listBindMountsHandler, auth.RequireAuth(authSvc))

	// Podman network management (read: all, write: admin)
	podmanNetworks := api.Group("/podman-networks")
	podmanNetworks.Use(auth.RequireAuth(authSvc))
	podmanNetworks.GET("", listPodmanNetworksHandler)
	podmanNetworks.POST("", createPodmanNetworkHandler, auth.RequireRole(models.RoleAdmin))
	podmanNetworks.DELETE("/:name", removePodmanNetworkHandler, auth.RequireRole(models.RoleAdmin))

	// Template management (read: all, write: admin)
	templates := api.Group("/templates")
	templates.Use(auth.RequireAuth(authSvc))
	templates.GET("", listTemplatesHandler)
	templates.GET("/:id", getTemplateHandler)
	templates.POST("", createTemplateHandler, auth.RequireRole(models.RoleAdmin))
	templates.DELETE("/:id", deleteTemplateHandler, auth.RequireRole(models.RoleAdmin))

	// Stack management (compose-based deployments)
	stacks := api.Group("/stacks")
	stacks.Use(auth.RequireAuth(authSvc))
	stacks.GET("", listStacksHandler)
	stacks.GET("/:id", getStackHandler)
	stacks.GET("/:id/containers", getStackContainersHandler)
	stacks.POST("", createStackHandler, auth.RequireRole(models.RoleAdmin))
	stacks.PUT("/:id", updateStackHandler, auth.RequireRole(models.RoleAdmin))
	stacks.DELETE("/:id", deleteStackHandler, auth.RequireRole(models.RoleAdmin))
	stacks.GET("/:id/deploy", deployStackHandler, auth.RequireRole(models.RoleAdmin)) // WebSocket
	stacks.POST("/:id/start", startStackHandler, auth.RequireOperatorOrAdmin())
	stacks.POST("/:id/stop", stopStackHandler, auth.RequireOperatorOrAdmin())
	stacks.POST("/:id/restart", restartStackHandler, auth.RequireOperatorOrAdmin())
	stacks.GET("/:id/pull", pullStackHandler, auth.RequireRole(models.RoleAdmin)) // WebSocket

	// Desktop apps endpoint (containers with web UIs)
	api.GET("/desktop-apps", listDesktopAppsHandler, auth.RequireAuth(authSvc))
}
