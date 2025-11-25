package database

import (
	"strconv"
	"time"
)

// SettingsRepo handles settings database operations
type SettingsRepo struct{}

// NewSettingsRepo creates a new settings repository
func NewSettingsRepo() *SettingsRepo {
	return &SettingsRepo{}
}

// Get retrieves a setting value
func (r *SettingsRepo) Get(key string) (string, error) {
	var value string
	err := DB.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	return value, err
}

// Set sets a setting value
func (r *SettingsRepo) Set(key, value string) error {
	_, err := DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
	`, key, value, time.Now(), value, time.Now())
	return err
}

// GetBool retrieves a boolean setting
func (r *SettingsRepo) GetBool(key string) (bool, error) {
	value, err := r.Get(key)
	if err != nil {
		return false, err
	}
	return value == "true" || value == "1", nil
}

// GetInt retrieves an integer setting
func (r *SettingsRepo) GetInt(key string) (int, error) {
	value, err := r.Get(key)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(value)
}

// GetAll retrieves all settings
func (r *SettingsRepo) GetAll() (map[string]string, error) {
	rows, err := DB.Query("SELECT key, value FROM settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		settings[key] = value
	}

	return settings, nil
}

// Common settings keys
const (
	SettingAuthLocalEnabled    = "auth.local_enabled"
	SettingAuthPAMEnabled      = "auth.pam_enabled"
	SettingSessionTimeout      = "session.timeout_minutes"
	SettingSessionMaxPerUser   = "session.max_per_user"
)
