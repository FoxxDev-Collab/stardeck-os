package models

import "time"

// UserPreferences represents stored user preferences including themes
type UserPreferences struct {
	UserID      int64     `json:"user_id"`
	Preferences string    `json:"preferences"` // JSON string containing all preferences
	UpdatedAt   time.Time `json:"updated_at"`
}

// UpdatePreferencesRequest represents the request body for updating preferences
type UpdatePreferencesRequest struct {
	Preferences map[string]interface{} `json:"preferences" validate:"required"`
}
