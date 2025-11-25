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

	// Store authSvc for use in handlers
	authService = authSvc

	// Health check (public)
	api.GET("/health", healthCheck)

	// Auth routes (public - no auth required for login)
	authGroup := api.Group("/auth")
	authGroup.POST("/login", loginHandler)
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

	// System routes (authenticated)
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

	// Terminal WebSocket route (authenticated)
	api.GET("/terminal/ws", HandleTerminalWebSocket, auth.RequireAuth(authSvc))
}
