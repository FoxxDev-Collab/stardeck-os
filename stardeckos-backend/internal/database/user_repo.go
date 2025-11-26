package database

import (
	"database/sql"
	"errors"
	"time"

	"stardeckos-backend/internal/models"
)

var (
	ErrUserNotFound      = errors.New("user not found")
	ErrUserAlreadyExists = errors.New("user already exists")
)

// UserRepo handles user database operations
type UserRepo struct{}

// NewUserRepo creates a new user repository
func NewUserRepo() *UserRepo {
	return &UserRepo{}
}

// Create creates a new user
func (r *UserRepo) Create(user *models.User) error {
	result, err := DB.Exec(`
		INSERT INTO users (username, display_name, password_hash, user_type, role, auth_type, disabled)
		VALUES (?, ?, ?, 'system', ?, ?, ?)
	`, user.Username, user.DisplayName, user.PasswordHash, user.Role, user.AuthType, user.Disabled)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	user.ID = id

	return nil
}

// GetByID retrieves a user by ID
func (r *UserRepo) GetByID(id int64) (*models.User, error) {
	user := &models.User{}
	var lastLogin sql.NullTime
	var userType string // Deprecated but still in DB

	err := DB.QueryRow(`
		SELECT id, username, display_name, password_hash, user_type, role, auth_type, disabled,
		       created_at, updated_at, last_login
		FROM users WHERE id = ?
	`, id).Scan(
		&user.ID, &user.Username, &user.DisplayName, &user.PasswordHash,
		&userType, &user.Role, &user.AuthType, &user.Disabled,
		&user.CreatedAt, &user.UpdatedAt, &lastLogin,
	)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	if lastLogin.Valid {
		user.LastLogin = lastLogin.Time
	}

	return user, nil
}

// GetByUsername retrieves a user by username
func (r *UserRepo) GetByUsername(username string) (*models.User, error) {
	user := &models.User{}
	var lastLogin sql.NullTime
	var userType string // Deprecated but still in DB

	err := DB.QueryRow(`
		SELECT id, username, display_name, password_hash, user_type, role, auth_type, disabled,
		       created_at, updated_at, last_login
		FROM users WHERE username = ?
	`, username).Scan(
		&user.ID, &user.Username, &user.DisplayName, &user.PasswordHash,
		&userType, &user.Role, &user.AuthType, &user.Disabled,
		&user.CreatedAt, &user.UpdatedAt, &lastLogin,
	)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	if lastLogin.Valid {
		user.LastLogin = lastLogin.Time
	}

	return user, nil
}

// List retrieves all users
func (r *UserRepo) List() ([]*models.User, error) {
	rows, err := DB.Query(`
		SELECT id, username, display_name, password_hash, user_type, role, auth_type, disabled,
		       created_at, updated_at, last_login
		FROM users ORDER BY username
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		user := &models.User{}
		var lastLogin sql.NullTime
		var userType string // Deprecated but still in DB

		err := rows.Scan(
			&user.ID, &user.Username, &user.DisplayName, &user.PasswordHash,
			&userType, &user.Role, &user.AuthType, &user.Disabled,
			&user.CreatedAt, &user.UpdatedAt, &lastLogin,
		)
		if err != nil {
			return nil, err
		}

		if lastLogin.Valid {
			user.LastLogin = lastLogin.Time
		}

		users = append(users, user)
	}

	return users, nil
}

// Update updates a user
func (r *UserRepo) Update(user *models.User) error {
	user.UpdatedAt = time.Now()

	result, err := DB.Exec(`
		UPDATE users SET
			display_name = ?,
			password_hash = ?,
			role = ?,
			disabled = ?,
			updated_at = ?
		WHERE id = ?
	`, user.DisplayName, user.PasswordHash, user.Role, user.Disabled, user.UpdatedAt, user.ID)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}

	return nil
}

// Delete deletes a user
func (r *UserRepo) Delete(id int64) error {
	result, err := DB.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}

	return nil
}

// UpdateLastLogin updates the user's last login timestamp
func (r *UserRepo) UpdateLastLogin(id int64) error {
	_, err := DB.Exec("UPDATE users SET last_login = ? WHERE id = ?", time.Now(), id)
	return err
}

// Count returns the total number of users
func (r *UserRepo) Count() (int, error) {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count, err
}

// ExistsByUsername checks if a user with the given username exists
func (r *UserRepo) ExistsByUsername(username string) (bool, error) {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&count)
	return count > 0, err
}
