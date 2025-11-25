package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"stardeckos-backend/internal/api"
	"stardeckos-backend/internal/auth"
	"stardeckos-backend/internal/certs"
	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

//go:embed frontend_dist/*
var frontendFS embed.FS

func main() {
	// Get database path from environment or default
	dbPath := os.Getenv("STARDECK_DB_PATH")
	if dbPath == "" {
		// Default to current directory for development
		dbPath = "./stardeck.db"
	}

	// Ensure absolute path
	if !filepath.IsAbs(dbPath) {
		cwd, _ := os.Getwd()
		dbPath = filepath.Join(cwd, dbPath)
	}

	// Initialize database
	log.Printf("Initializing database at %s", dbPath)
	if err := database.Open(database.Config{Path: dbPath}); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Create default admin user if no users exist
	if err := createDefaultAdminIfNeeded(); err != nil {
		log.Printf("Warning: failed to create default admin: %v", err)
	}

	// Initialize auth service
	authSvc := auth.NewService()

	e := echo.New()
	e.HideBanner = true

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOriginFunc: func(origin string) (bool, error) {
			// Allow all origins in development
			// TODO: Restrict this in production
			return true, nil
		},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization, "X-CSRF-Token", "Upgrade", "Connection", "Sec-WebSocket-Key", "Sec-WebSocket-Version"},
		AllowCredentials: true,
	}))

	// API routes
	apiGroup := e.Group("/api")
	api.RegisterRoutes(apiGroup, authSvc)

	// Serve embedded frontend in production
	frontendContent, err := fs.Sub(frontendFS, "frontend_dist")
	if err == nil {
		e.GET("/*", echo.WrapHandler(http.FileServer(http.FS(frontendContent))))
	}

	// Get port from environment or default
	port := os.Getenv("STARDECK_PORT")
	if port == "" {
		port = "443"
	}

	// Get cert directory (next to database or from env)
	certDir := os.Getenv("STARDECK_CERT_DIR")
	if certDir == "" {
		certDir = filepath.Join(filepath.Dir(dbPath), "certs")
	}

	// Check if we should use HTTP (for development)
	useHTTP := os.Getenv("STARDECK_USE_HTTP") == "true"

	if useHTTP {
		log.Printf("Starting Stardeck backend on HTTP port %s (insecure mode)", port)
		e.Logger.Fatal(e.Start(":" + port))
	} else {
		// Ensure TLS certificates exist
		certPath, keyPath, err := certs.EnsureCertificates(certDir)
		if err != nil {
			log.Fatalf("Failed to setup TLS certificates: %v", err)
		}
		log.Printf("Using TLS certificates from %s", certDir)
		log.Printf("Starting Stardeck backend on HTTPS port %s", port)
		e.Logger.Fatal(e.StartTLS(":"+port, certPath, keyPath))
	}
}

// createDefaultAdminIfNeeded creates a default admin user if no users exist
func createDefaultAdminIfNeeded() error {
	userRepo := database.NewUserRepo()

	count, err := userRepo.Count()
	if err != nil {
		return err
	}

	if count > 0 {
		return nil // Users already exist
	}

	// Create default admin
	log.Println("Creating default admin user (admin/admin) - CHANGE THIS PASSWORD!")

	passwordHash, err := auth.HashPassword("admin")
	if err != nil {
		return err
	}

	admin := &models.User{
		Username:     "admin",
		DisplayName:  "Administrator",
		PasswordHash: passwordHash,
		Role:         models.RoleAdmin,
		AuthType:     models.AuthTypeLocal,
	}

	return userRepo.Create(admin)
}
