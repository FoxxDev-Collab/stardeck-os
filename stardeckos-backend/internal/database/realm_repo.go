package database

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"stardeckos-backend/internal/models"
)

var (
	ErrRealmNotFound      = errors.New("realm not found")
	ErrRealmAlreadyExists = errors.New("realm already exists")
)

// RealmRepo handles realm database operations
type RealmRepo struct {
	db *sql.DB
}

// NewRealmRepo creates a new realm repository
func NewRealmRepo() *RealmRepo {
	return &RealmRepo{db: DB}
}

// Create creates a new realm
func (r *RealmRepo) Create(realm *models.Realm) error {
	configJSON, err := json.Marshal(realm.Config)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO realms (name, display_name, type, enabled, config, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	now := time.Now()
	result, err := r.db.Exec(query,
		realm.Name,
		realm.DisplayName,
		realm.Type,
		realm.Enabled,
		configJSON,
		now,
		now,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	realm.ID = id
	realm.CreatedAt = now
	realm.UpdatedAt = now

	return nil
}

// GetByID retrieves a realm by ID
func (r *RealmRepo) GetByID(id int64) (*models.Realm, error) {
	query := `
		SELECT id, name, display_name, type, enabled, config, created_at, updated_at
		FROM realms
		WHERE id = ?
	`

	var realm models.Realm
	var configJSON string

	err := r.db.QueryRow(query, id).Scan(
		&realm.ID,
		&realm.Name,
		&realm.DisplayName,
		&realm.Type,
		&realm.Enabled,
		&configJSON,
		&realm.CreatedAt,
		&realm.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrRealmNotFound
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal([]byte(configJSON), &realm.Config); err != nil {
		return nil, err
	}

	return &realm, nil
}

// GetByName retrieves a realm by name
func (r *RealmRepo) GetByName(name string) (*models.Realm, error) {
	query := `
		SELECT id, name, display_name, type, enabled, config, created_at, updated_at
		FROM realms
		WHERE name = ?
	`

	var realm models.Realm
	var configJSON string

	err := r.db.QueryRow(query, name).Scan(
		&realm.ID,
		&realm.Name,
		&realm.DisplayName,
		&realm.Type,
		&realm.Enabled,
		&configJSON,
		&realm.CreatedAt,
		&realm.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrRealmNotFound
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal([]byte(configJSON), &realm.Config); err != nil {
		return nil, err
	}

	return &realm, nil
}

// List retrieves all realms
func (r *RealmRepo) List() ([]*models.Realm, error) {
	query := `
		SELECT id, name, display_name, type, enabled, config, created_at, updated_at
		FROM realms
		ORDER BY name
	`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var realms []*models.Realm
	for rows.Next() {
		var realm models.Realm
		var configJSON string

		err := rows.Scan(
			&realm.ID,
			&realm.Name,
			&realm.DisplayName,
			&realm.Type,
			&realm.Enabled,
			&configJSON,
			&realm.CreatedAt,
			&realm.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if err := json.Unmarshal([]byte(configJSON), &realm.Config); err != nil {
			return nil, err
		}

		realms = append(realms, &realm)
	}

	return realms, nil
}

// Update updates a realm
func (r *RealmRepo) Update(realm *models.Realm) error {
	configJSON, err := json.Marshal(realm.Config)
	if err != nil {
		return err
	}

	query := `
		UPDATE realms
		SET display_name = ?, enabled = ?, config = ?, updated_at = ?
		WHERE id = ?
	`

	realm.UpdatedAt = time.Now()

	result, err := r.db.Exec(query,
		realm.DisplayName,
		realm.Enabled,
		configJSON,
		realm.UpdatedAt,
		realm.ID,
	)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrRealmNotFound
	}

	return nil
}

// Delete deletes a realm
func (r *RealmRepo) Delete(id int64) error {
	query := `DELETE FROM realms WHERE id = ?`

	result, err := r.db.Exec(query, id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrRealmNotFound
	}

	return nil
}

// ExistsByName checks if a realm with the given name exists
func (r *RealmRepo) ExistsByName(name string) (bool, error) {
	query := `SELECT COUNT(*) FROM realms WHERE name = ?`
	var count int
	err := r.db.QueryRow(query, name).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
