package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

// getUserPreferencesHandler handles GET /api/user/preferences
func getUserPreferencesHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)

	var prefsJSON string
	var updatedAt time.Time

	err := database.DB.QueryRow(
		"SELECT preferences, updated_at FROM user_preferences WHERE user_id = ?",
		user.ID,
	).Scan(&prefsJSON, &updatedAt)

	if err != nil {
		// No preferences found, return empty object
		return c.JSON(http.StatusOK, map[string]interface{}{
			"preferences": map[string]interface{}{},
			"updated_at":  nil,
		})
	}

	// Parse the JSON string into a map
	var preferences map[string]interface{}
	if err := json.Unmarshal([]byte(prefsJSON), &preferences); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to parse preferences",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"preferences": preferences,
		"updated_at":  updatedAt,
	})
}

// updateUserPreferencesHandler handles PUT /api/user/preferences
func updateUserPreferencesHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)

	var req models.UpdatePreferencesRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Preferences == nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "preferences object is required",
		})
	}

	// Convert preferences to JSON string
	prefsJSON, err := json.Marshal(req.Preferences)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to serialize preferences",
		})
	}

	// Upsert preferences (INSERT or UPDATE)
	_, err = database.DB.Exec(`
		INSERT INTO user_preferences (user_id, preferences, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET
			preferences = excluded.preferences,
			updated_at = CURRENT_TIMESTAMP
	`, user.ID, string(prefsJSON))

	if err != nil {
		c.Logger().Error("failed to save preferences: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to save preferences",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":     "preferences saved",
		"preferences": req.Preferences,
	})
}

// patchUserPreferencesHandler handles PATCH /api/user/preferences
// Merges the provided preferences with existing ones
func patchUserPreferencesHandler(c echo.Context) error {
	user := c.Get("user").(*models.User)

	var req models.UpdatePreferencesRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Preferences == nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "preferences object is required",
		})
	}

	// Get existing preferences
	var existingJSON string
	err := database.DB.QueryRow(
		"SELECT preferences FROM user_preferences WHERE user_id = ?",
		user.ID,
	).Scan(&existingJSON)

	existingPrefs := make(map[string]interface{})
	if err == nil {
		json.Unmarshal([]byte(existingJSON), &existingPrefs)
	}

	// Merge new preferences into existing
	for key, value := range req.Preferences {
		existingPrefs[key] = value
	}

	// Convert merged preferences to JSON string
	prefsJSON, err := json.Marshal(existingPrefs)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to serialize preferences",
		})
	}

	// Upsert preferences
	_, err = database.DB.Exec(`
		INSERT INTO user_preferences (user_id, preferences, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET
			preferences = excluded.preferences,
			updated_at = CURRENT_TIMESTAMP
	`, user.ID, string(prefsJSON))

	if err != nil {
		c.Logger().Error("failed to save preferences: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to save preferences",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":     "preferences saved",
		"preferences": existingPrefs,
	})
}
