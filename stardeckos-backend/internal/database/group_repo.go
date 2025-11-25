package database

import (
	"database/sql"
	"errors"
	"time"

	"stardeckos-backend/internal/models"
)

var (
	ErrGroupNotFound      = errors.New("group not found")
	ErrGroupAlreadyExists = errors.New("group already exists")
)

// GroupRepo handles group database operations
type GroupRepo struct {
	db *sql.DB
}

// NewGroupRepo creates a new group repository
func NewGroupRepo() *GroupRepo {
	return &GroupRepo{db: DB}
}

// Create creates a new group
func (r *GroupRepo) Create(group *models.Group) error {
	query := `
		INSERT INTO groups (name, display_name, description, realm_id, system_gid, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	now := time.Now()
	result, err := r.db.Exec(query,
		group.Name,
		group.DisplayName,
		group.Description,
		group.RealmID,
		group.SystemGID,
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

	group.ID = id
	group.CreatedAt = now
	group.UpdatedAt = now

	return nil
}

// GetByID retrieves a group by ID
func (r *GroupRepo) GetByID(id int64) (*models.Group, error) {
	query := `
		SELECT id, name, display_name, description, realm_id, system_gid, created_at, updated_at
		FROM groups
		WHERE id = ?
	`

	var group models.Group

	err := r.db.QueryRow(query, id).Scan(
		&group.ID,
		&group.Name,
		&group.DisplayName,
		&group.Description,
		&group.RealmID,
		&group.SystemGID,
		&group.CreatedAt,
		&group.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, err
	}

	return &group, nil
}

// GetByName retrieves a group by name
func (r *GroupRepo) GetByName(name string) (*models.Group, error) {
	query := `
		SELECT id, name, display_name, description, realm_id, system_gid, created_at, updated_at
		FROM groups
		WHERE name = ?
	`

	var group models.Group

	err := r.db.QueryRow(query, name).Scan(
		&group.ID,
		&group.Name,
		&group.DisplayName,
		&group.Description,
		&group.RealmID,
		&group.SystemGID,
		&group.CreatedAt,
		&group.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, err
	}

	return &group, nil
}

// List retrieves all groups
func (r *GroupRepo) List() ([]*models.Group, error) {
	query := `
		SELECT id, name, display_name, description, realm_id, system_gid, created_at, updated_at
		FROM groups
		ORDER BY name
	`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.Group
	for rows.Next() {
		var group models.Group

		err := rows.Scan(
			&group.ID,
			&group.Name,
			&group.DisplayName,
			&group.Description,
			&group.RealmID,
			&group.SystemGID,
			&group.CreatedAt,
			&group.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		groups = append(groups, &group)
	}

	return groups, nil
}

// Update updates a group
func (r *GroupRepo) Update(group *models.Group) error {
	query := `
		UPDATE groups
		SET display_name = ?, description = ?, updated_at = ?
		WHERE id = ?
	`

	group.UpdatedAt = time.Now()

	result, err := r.db.Exec(query,
		group.DisplayName,
		group.Description,
		group.UpdatedAt,
		group.ID,
	)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrGroupNotFound
	}

	return nil
}

// Delete deletes a group
func (r *GroupRepo) Delete(id int64) error {
	query := `DELETE FROM groups WHERE id = ?`

	result, err := r.db.Exec(query, id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrGroupNotFound
	}

	return nil
}

// AddMember adds a user to a group
func (r *GroupRepo) AddMember(groupID, userID int64) error {
	query := `INSERT INTO user_groups (user_id, group_id, created_at) VALUES (?, ?, ?)`

	_, err := r.db.Exec(query, userID, groupID, time.Now())
	return err
}

// RemoveMember removes a user from a group
func (r *GroupRepo) RemoveMember(groupID, userID int64) error {
	query := `DELETE FROM user_groups WHERE user_id = ? AND group_id = ?`

	_, err := r.db.Exec(query, userID, groupID)
	return err
}

// GetMembers retrieves all user IDs that are members of a group
func (r *GroupRepo) GetMembers(groupID int64) ([]int64, error) {
	query := `SELECT user_id FROM user_groups WHERE group_id = ?`

	rows, err := r.db.Query(query, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userIDs []int64
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		userIDs = append(userIDs, userID)
	}

	return userIDs, nil
}

// GetUserGroups retrieves all groups a user belongs to
func (r *GroupRepo) GetUserGroups(userID int64) ([]*models.Group, error) {
	query := `
		SELECT g.id, g.name, g.display_name, g.description, g.realm_id, g.system_gid, g.created_at, g.updated_at
		FROM groups g
		INNER JOIN user_groups ug ON g.id = ug.group_id
		WHERE ug.user_id = ?
		ORDER BY g.name
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.Group
	for rows.Next() {
		var group models.Group

		err := rows.Scan(
			&group.ID,
			&group.Name,
			&group.DisplayName,
			&group.Description,
			&group.RealmID,
			&group.SystemGID,
			&group.CreatedAt,
			&group.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		groups = append(groups, &group)
	}

	return groups, nil
}

// ExistsByName checks if a group with the given name exists
func (r *GroupRepo) ExistsByName(name string) (bool, error) {
	query := `SELECT COUNT(*) FROM groups WHERE name = ?`
	var count int
	err := r.db.QueryRow(query, name).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
