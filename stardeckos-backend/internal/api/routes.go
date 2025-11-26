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
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage users
	users := api.Group("/users")
	users.Use(auth.RequireAuth(authSvc))
	users.Use(auth.RequireSystemUser())
	users.Use(auth.RequireWheelOrRoot(authSvc))
	users.GET("", listUsersHandler)
	users.POST("", createUserHandler)
	users.GET("/:id", getUserHandler)
	users.PUT("/:id", updateUserHandler)
	users.DELETE("/:id", deleteUserHandler)

	// Group management routes (requires wheel group or root)
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage groups
	groups := api.Group("/groups")
	groups.Use(auth.RequireAuth(authSvc))
	groups.Use(auth.RequireSystemUser())
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
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage realms
	realms := api.Group("/realms")
	realms.Use(auth.RequireAuth(authSvc))
	realms.Use(auth.RequireSystemUser())
	realms.Use(auth.RequireWheelOrRoot(authSvc))
	realms.GET("", listRealmsHandler)
	realms.POST("", createRealmHandler)
	realms.GET("/:id", getRealmHandler)
	realms.PUT("/:id", updateRealmHandler)
	realms.DELETE("/:id", deleteRealmHandler)

	// System routes (authenticated)
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot access system information
	system := api.Group("/system")
	system.Use(auth.RequireAuth(authSvc))
	system.Use(auth.RequireSystemUser())
	system.GET("/resources", getResourcesHandler)
	system.GET("/info", getSystemInfoHandler)
	system.GET("/groups", listSystemGroupsHandler) // View system groups
	system.POST("/reboot", rebootSystemHandler, auth.RequireRole(models.RoleAdmin))

	// Process routes (authenticated, kill requires operator+)
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage processes
	processes := api.Group("/processes")
	processes.Use(auth.RequireAuth(authSvc))
	processes.Use(auth.RequireSystemUser())
	processes.GET("", listProcesses)
	processes.DELETE("/:pid", killProcess, auth.RequireOperatorOrAdmin())

	// Service routes (authenticated, actions require operator+)
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage services
	services := api.Group("/services")
	services.Use(auth.RequireAuth(authSvc))
	services.Use(auth.RequireSystemUser())
	services.GET("", listServices)
	services.GET("/:name", getService)
	services.POST("/:name/:action", serviceAction, auth.RequireOperatorOrAdmin())

	// Update routes (authenticated, apply requires admin)
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage updates
	updates := api.Group("/updates")
	updates.Use(auth.RequireAuth(authSvc))
	updates.Use(auth.RequireSystemUser())
	updates.GET("/available", getAvailableUpdates)
	updates.POST("/apply", applyUpdates, auth.RequireRole(models.RoleAdmin))
	updates.GET("/history", getUpdateHistory)

	// Repository routes (authenticated, requires wheel/root)
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage repositories
	repos := api.Group("/repositories")
	repos.Use(auth.RequireAuth(authSvc))
	repos.Use(auth.RequireSystemUser())
	repos.GET("", getRepositoriesHandler, auth.RequireWheelOrRoot(authSvc))
	repos.POST("", addRepositoryHandler, auth.RequireWheelOrRoot(authSvc))
	repos.PUT("/:id", updateRepositoryHandler, auth.RequireWheelOrRoot(authSvc))
	repos.DELETE("/:id", deleteRepositoryHandler, auth.RequireWheelOrRoot(authSvc))

	// Package routes (authenticated, requires wheel/root for install/remove)
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage packages
	packages := api.Group("/packages")
	packages.Use(auth.RequireAuth(authSvc))
	packages.Use(auth.RequireSystemUser())
	packages.GET("/search", searchPackagesHandler)
	packages.GET("/:name", getPackageInfoHandler)
	packages.POST("/install", installPackagesHandler, auth.RequireWheelOrRoot(authSvc))
	packages.POST("/remove", removePackagesHandler, auth.RequireWheelOrRoot(authSvc))

	// Metadata routes (authenticated, requires wheel/root)
	// RESTRICTED TO SYSTEM USERS ONLY
	metadata := api.Group("/metadata")
	metadata.Use(auth.RequireAuth(authSvc))
	metadata.Use(auth.RequireSystemUser())
	metadata.POST("/refresh", refreshMetadataHandler, auth.RequireWheelOrRoot(authSvc))

	// Storage routes (authenticated, read-only for viewing, wheel/root for management)
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot view or manage storage
	storage := api.Group("/storage")
	storage.Use(auth.RequireAuth(authSvc))
	storage.Use(auth.RequireSystemUser())
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
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot view audit logs
	audit := api.Group("/audit")
	audit.Use(auth.RequireAuth(authSvc))
	audit.Use(auth.RequireSystemUser())
	audit.Use(auth.RequireRole(models.RoleAdmin))
	audit.GET("", listAuditLogsHandler)
	audit.GET("/actions", getAuditActionsHandler)
	audit.GET("/stats", getAuditStatsHandler)
	audit.GET("/:id", getAuditLogHandler)

	// Terminal WebSocket route (authentication handled inside handler due to WebSocket limitations)
	api.GET("/terminal/ws", HandleTerminalWebSocket)

	// Network management routes
	// RESTRICTED TO SYSTEM USERS ONLY - Web users cannot manage network
	network := api.Group("/network")
	network.Use(auth.RequireAuth(authSvc))
	network.Use(auth.RequireSystemUser())

	// Interface routes (read: all system users, write: admin only)
	network.GET("/interfaces", listInterfacesHandler)
	network.GET("/interfaces/:name", getInterfaceHandler)
	network.GET("/interfaces/:name/stats", getInterfaceStatsHandler)
	network.POST("/interfaces/:name/state", setInterfaceStateHandler, auth.RequireRole(models.RoleAdmin))

	// Firewall routes (read: all system users, write: admin only)
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

	// Route management (read: all system users, write: admin only)
	network.GET("/routes", listRoutesHandler)
	network.POST("/routes", addRouteHandler, auth.RequireRole(models.RoleAdmin))
	network.DELETE("/routes/:destination", deleteRouteHandler, auth.RequireRole(models.RoleAdmin))

	// DNS configuration (read-only)
	network.GET("/dns", getDNSConfigHandler)

	// Active connections (read-only)
	network.GET("/connections", listConnectionsHandler)
}
