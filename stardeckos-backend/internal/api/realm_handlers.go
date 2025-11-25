package api

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

var realmRepo *database.RealmRepo

// InitRealmRepo initializes the realm repository
func InitRealmRepo() {
	realmRepo = database.NewRealmRepo()
}

// listRealmsHandler handles GET /api/realms
func listRealmsHandler(c echo.Context) error {
	realms, err := realmRepo.List()
	if err != nil {
		c.Logger().Error("list realms error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list realms",
		})
	}

	return c.JSON(http.StatusOK, realms)
}

// createRealmHandler handles POST /api/realms
func createRealmHandler(c echo.Context) error {
	var req models.CreateRealmRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	// Validate required fields
	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "name is required",
		})
	}
	if req.DisplayName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "display name is required",
		})
	}

	// Check if realm exists
	exists, _ := realmRepo.ExistsByName(req.Name)
	if exists {
		return c.JSON(http.StatusConflict, map[string]string{
			"error": "realm already exists",
		})
	}

	realm := &models.Realm{
		Name:        req.Name,
		DisplayName: req.DisplayName,
		Type:        req.Type,
		Enabled:     req.Enabled,
		Config:      req.Config,
	}

	if err := realmRepo.Create(realm); err != nil {
		c.Logger().Error("create realm error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to create realm",
		})
	}

	return c.JSON(http.StatusCreated, realm)
}

// getRealmHandler handles GET /api/realms/:id
func getRealmHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid realm ID",
		})
	}

	realm, err := realmRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, database.ErrRealmNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "realm not found",
			})
		}
		c.Logger().Error("get realm error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get realm",
		})
	}

	return c.JSON(http.StatusOK, realm)
}

// updateRealmHandler handles PUT /api/realms/:id
func updateRealmHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid realm ID",
		})
	}

	// Get existing realm
	realm, err := realmRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, database.ErrRealmNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "realm not found",
			})
		}
		c.Logger().Error("get realm error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get realm",
		})
	}

	var req models.UpdateRealmRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	// Apply updates
	if req.DisplayName != nil {
		realm.DisplayName = *req.DisplayName
	}
	if req.Enabled != nil {
		realm.Enabled = *req.Enabled
	}
	if req.Config != nil {
		realm.Config = *req.Config
	}

	if err := realmRepo.Update(realm); err != nil {
		c.Logger().Error("update realm error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to update realm",
		})
	}

	return c.JSON(http.StatusOK, realm)
}

// deleteRealmHandler handles DELETE /api/realms/:id
func deleteRealmHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid realm ID",
		})
	}

	if err := realmRepo.Delete(id); err != nil {
		if errors.Is(err, database.ErrRealmNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "realm not found",
			})
		}
		c.Logger().Error("delete realm error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to delete realm",
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "realm deleted",
	})
}
