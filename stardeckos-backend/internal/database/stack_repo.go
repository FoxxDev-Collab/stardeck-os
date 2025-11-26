package database

import (
	"database/sql"
	"time"

	"github.com/google/uuid"

	"stardeckos-backend/internal/models"
)

// StackRepo handles database operations for stacks
type StackRepo struct{}

// NewStackRepo creates a new StackRepo
func NewStackRepo() *StackRepo {
	return &StackRepo{}
}

// InitStackTable creates the stacks table if it doesn't exist
func InitStackTable() error {
	query := `
		CREATE TABLE IF NOT EXISTS stacks (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			description TEXT DEFAULT '',
			compose_content TEXT NOT NULL,
			env_content TEXT DEFAULT '',
			status TEXT DEFAULT 'stopped',
			path TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			created_by INTEGER,
			FOREIGN KEY (created_by) REFERENCES users(id)
		)
	`
	_, err := DB.Exec(query)
	return err
}

// List returns all stacks
func (r *StackRepo) List() ([]models.StackListItem, error) {
	query := `
		SELECT id, name, description, status, created_at, updated_at
		FROM stacks
		ORDER BY created_at DESC
	`

	rows, err := DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stacks []models.StackListItem
	for rows.Next() {
		var s models.StackListItem
		var status string
		if err := rows.Scan(&s.ID, &s.Name, &s.Description, &status, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		s.Status = models.StackStatus(status)
		stacks = append(stacks, s)
	}

	return stacks, rows.Err()
}

// GetByID returns a stack by ID
func (r *StackRepo) GetByID(id string) (*models.Stack, error) {
	query := `
		SELECT id, name, description, compose_content, env_content, status, path, created_at, updated_at, created_by
		FROM stacks
		WHERE id = ?
	`

	var s models.Stack
	var status string
	var createdBy sql.NullInt64
	err := DB.QueryRow(query, id).Scan(
		&s.ID, &s.Name, &s.Description, &s.ComposeContent, &s.EnvContent,
		&status, &s.Path, &s.CreatedAt, &s.UpdatedAt, &createdBy,
	)
	if err != nil {
		return nil, err
	}

	s.Status = models.StackStatus(status)
	if createdBy.Valid {
		s.CreatedBy = &createdBy.Int64
	}

	return &s, nil
}

// GetByName returns a stack by name
func (r *StackRepo) GetByName(name string) (*models.Stack, error) {
	query := `
		SELECT id, name, description, compose_content, env_content, status, path, created_at, updated_at, created_by
		FROM stacks
		WHERE name = ?
	`

	var s models.Stack
	var status string
	var createdBy sql.NullInt64
	err := DB.QueryRow(query, name).Scan(
		&s.ID, &s.Name, &s.Description, &s.ComposeContent, &s.EnvContent,
		&status, &s.Path, &s.CreatedAt, &s.UpdatedAt, &createdBy,
	)
	if err != nil {
		return nil, err
	}

	s.Status = models.StackStatus(status)
	if createdBy.Valid {
		s.CreatedBy = &createdBy.Int64
	}

	return &s, nil
}

// Create creates a new stack
func (r *StackRepo) Create(s *models.Stack) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	s.CreatedAt = time.Now()
	s.UpdatedAt = time.Now()

	query := `
		INSERT INTO stacks (id, name, description, compose_content, env_content, status, path, created_at, updated_at, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := DB.Exec(query,
		s.ID, s.Name, s.Description, s.ComposeContent, s.EnvContent,
		string(s.Status), s.Path, s.CreatedAt, s.UpdatedAt, s.CreatedBy,
	)
	return err
}

// Update updates an existing stack
func (r *StackRepo) Update(s *models.Stack) error {
	s.UpdatedAt = time.Now()

	query := `
		UPDATE stacks
		SET name = ?, description = ?, compose_content = ?, env_content = ?, status = ?, path = ?, updated_at = ?
		WHERE id = ?
	`

	_, err := DB.Exec(query,
		s.Name, s.Description, s.ComposeContent, s.EnvContent,
		string(s.Status), s.Path, s.UpdatedAt, s.ID,
	)
	return err
}

// UpdateStatus updates only the status of a stack
func (r *StackRepo) UpdateStatus(id string, status models.StackStatus) error {
	query := `UPDATE stacks SET status = ?, updated_at = ? WHERE id = ?`
	_, err := DB.Exec(query, string(status), time.Now(), id)
	return err
}

// Delete deletes a stack by ID
func (r *StackRepo) Delete(id string) error {
	_, err := DB.Exec("DELETE FROM stacks WHERE id = ?", id)
	return err
}
