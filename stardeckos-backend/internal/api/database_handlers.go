package api

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
	"stardeckos-backend/internal/system"
)

var (
	managedDBRepo   *database.ManagedDatabaseRepo
	databaseService *system.DatabaseService
)

// InitDatabaseRepos initializes database management repositories
func InitDatabaseRepos() {
	managedDBRepo = database.NewManagedDatabaseRepo()
	databaseService = system.NewDatabaseService(podmanService)
}

// listDatabasesHandler returns all managed databases
func listDatabasesHandler(c echo.Context) error {
	databases, err := managedDBRepo.ListWithConnectionCount()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list databases: " + err.Error(),
		})
	}

	if databases == nil {
		databases = []*models.ManagedDatabaseListItem{}
	}

	return c.JSON(http.StatusOK, databases)
}

// getDatabaseHandler returns a single managed database by ID
func getDatabaseHandler(c echo.Context) error {
	id := c.Param("id")

	info, err := databaseService.GetDatabaseInfo(id)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "Database not found",
			})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get database: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, info)
}

// createDatabaseHandler creates a new managed database
func createDatabaseHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)

	var req models.CreateDatabaseRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	// Validate required fields
	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Database name is required",
		})
	}
	if req.Type == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Database type is required",
		})
	}

	// Check if name already exists
	existing, _ := managedDBRepo.GetByName(req.Name)
	if existing != nil {
		return c.JSON(http.StatusConflict, map[string]string{
			"error": "A database with this name already exists",
		})
	}

	db, err := databaseService.CreateDatabase(&req, &user.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create database: " + err.Error(),
		})
	}

	// Audit log
	logAudit(user, models.ActionDatabaseCreate, db.Name,
		map[string]interface{}{"id": db.ID, "type": db.Type})

	return c.JSON(http.StatusCreated, db)
}

// deleteDatabaseHandler removes a managed database
func deleteDatabaseHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)
	id := c.Param("id")
	removeVolume := c.QueryParam("remove_volume") == "true"

	// Get database info for audit
	db, err := managedDBRepo.GetByID(id)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "Database not found",
			})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get database: " + err.Error(),
		})
	}

	// Check for active connections
	connCount, _ := managedDBRepo.CountConnectionsByDatabase(id)
	if connCount > 0 {
		return c.JSON(http.StatusConflict, map[string]string{
			"error": "Database has active connections. Remove connections first or use force=true",
		})
	}

	if err := databaseService.DeleteDatabase(id, removeVolume); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to delete database: " + err.Error(),
		})
	}

	// Audit log
	logAudit(user, models.ActionDatabaseDelete, db.Name,
		map[string]interface{}{"id": id, "remove_volume": removeVolume})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "Database deleted successfully",
	})
}

// startDatabaseHandler starts a managed database container
func startDatabaseHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)
	id := c.Param("id")

	if err := databaseService.StartDatabase(id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to start database: " + err.Error(),
		})
	}

	// Audit log
	logAudit(user, models.ActionDatabaseStart, id, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "Database started successfully",
	})
}

// stopDatabaseHandler stops a managed database container
func stopDatabaseHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)
	id := c.Param("id")

	if err := databaseService.StopDatabase(id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to stop database: " + err.Error(),
		})
	}

	// Audit log
	logAudit(user, models.ActionDatabaseStop, id, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "Database stopped successfully",
	})
}

// detectDatabasesHandler scans for unmanaged database containers
func detectDatabasesHandler(c echo.Context) error {
	detected, err := databaseService.DetectDatabaseContainers()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to detect databases: " + err.Error(),
		})
	}

	if detected == nil {
		detected = []*models.DetectedDatabase{}
	}

	return c.JSON(http.StatusOK, detected)
}

// adoptDatabaseHandler adopts an existing database container
func adoptDatabaseHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)
	containerID := c.Param("container_id")

	var req models.AdoptDatabaseRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	req.ContainerID = containerID

	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Database name is required",
		})
	}

	db, err := databaseService.AdoptDatabase(&req, &user.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to adopt database: " + err.Error(),
		})
	}

	// Audit log
	logAudit(user, models.ActionDatabaseAdopt, db.Name,
		map[string]interface{}{"id": db.ID, "container_id": containerID})

	return c.JSON(http.StatusOK, db)
}

// listDatabaseConnectionsHandler returns connections for a database
func listDatabaseConnectionsHandler(c echo.Context) error {
	id := c.Param("id")

	connections, err := managedDBRepo.GetConnectionsByDatabase(id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list connections: " + err.Error(),
		})
	}

	if connections == nil {
		connections = []*models.DatabaseConnection{}
	}

	return c.JSON(http.StatusOK, connections)
}

// createDatabaseConnectionHandler creates a new connection to a database
func createDatabaseConnectionHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)
	databaseID := c.Param("id")

	var req models.CreateDatabaseConnectionRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	req.DatabaseID = databaseID

	// Verify database exists
	db, err := managedDBRepo.GetByID(databaseID)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "Database not found",
			})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get database: " + err.Error(),
		})
	}

	// Check if database allows sharing
	if !db.IsShared {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": "This database does not allow shared connections",
		})
	}

	// Create connection record
	conn := &models.DatabaseConnection{
		DatabaseID:   databaseID,
		ContainerID:  req.ContainerID,
		DatabaseName: req.DatabaseName,
		Username:     req.Username,
		Password:     req.Password,
	}

	if err := managedDBRepo.CreateConnection(conn); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create connection: " + err.Error(),
		})
	}

	// Audit log
	logAudit(user, models.ActionDatabaseConnect, databaseID,
		map[string]interface{}{"container_id": req.ContainerID, "database_name": req.DatabaseName})

	return c.JSON(http.StatusCreated, conn)
}

// deleteDatabaseConnectionHandler removes a database connection
func deleteDatabaseConnectionHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)
	connID := c.Param("conn_id")

	// Get connection for audit
	conn, err := managedDBRepo.GetConnectionByID(connID)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "Connection not found",
			})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get connection: " + err.Error(),
		})
	}

	if err := managedDBRepo.DeleteConnection(connID); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to delete connection: " + err.Error(),
		})
	}

	// Audit log
	logAudit(user, models.ActionDatabaseDisconnect, conn.DatabaseID,
		map[string]interface{}{"connection_id": connID})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "Connection removed successfully",
	})
}

// getDatabaseTypesHandler returns available database types and their defaults
func getDatabaseTypesHandler(c echo.Context) error {
	types := []map[string]interface{}{
		{
			"type":        models.DatabaseTypePostgreSQL,
			"name":        "PostgreSQL",
			"description": "Advanced open-source relational database",
			"default_image": "postgres:16",
			"default_port":  5432,
			"popular":       true,
		},
		{
			"type":        models.DatabaseTypeMariaDB,
			"name":        "MariaDB",
			"description": "Community-developed MySQL fork",
			"default_image": "mariadb:10.11",
			"default_port":  3306,
			"popular":       true,
		},
		{
			"type":        models.DatabaseTypeMySQL,
			"name":        "MySQL",
			"description": "Popular open-source relational database",
			"default_image": "mysql:8.0",
			"default_port":  3306,
			"popular":       false,
		},
		{
			"type":        models.DatabaseTypeRedis,
			"name":        "Redis",
			"description": "In-memory data structure store",
			"default_image": "redis:7",
			"default_port":  6379,
			"popular":       false,
		},
		{
			"type":        models.DatabaseTypeMongoDB,
			"name":        "MongoDB",
			"description": "Document-oriented NoSQL database",
			"default_image": "mongo:7",
			"default_port":  27017,
			"popular":       false,
		},
	}

	return c.JSON(http.StatusOK, types)
}

// syncDatabaseStatusesHandler manually syncs database statuses from Podman
func syncDatabaseStatusesHandler(c echo.Context) error {
	if err := databaseService.SyncDatabaseStatuses(); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to sync statuses: " + err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "Database statuses synced",
	})
}
