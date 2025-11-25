package database

import (
	"database/sql"
	"encoding/json"
	"time"

	"stardeckos-backend/internal/models"
)

// AuditRepo handles audit log database operations
type AuditRepo struct{}

// NewAuditRepo creates a new audit repository
func NewAuditRepo() *AuditRepo {
	return &AuditRepo{}
}

// Create creates a new audit log entry
func (r *AuditRepo) Create(log *models.AuditLog) error {
	result, err := DB.Exec(`
		INSERT INTO audit_logs (timestamp, user_id, username, action, target, details, ip_address)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, log.Timestamp, log.UserID, log.Username, log.Action, log.Target, log.Details, log.IPAddress)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	log.ID = id
	return nil
}

// Log is a convenience method to create an audit log entry with current timestamp
func (r *AuditRepo) Log(userID int64, username, action, target string, details interface{}, ipAddress string) error {
	var detailsJSON string
	if details != nil {
		b, err := json.Marshal(details)
		if err != nil {
			detailsJSON = "{}"
		} else {
			detailsJSON = string(b)
		}
	}

	log := &models.AuditLog{
		Timestamp: time.Now(),
		UserID:    userID,
		Username:  username,
		Action:    action,
		Target:    target,
		Details:   detailsJSON,
		IPAddress: ipAddress,
	}
	return r.Create(log)
}

// List retrieves audit logs with pagination and optional filters
func (r *AuditRepo) List(filter models.AuditFilter) ([]*models.AuditLog, int, error) {
	// Build query
	baseQuery := "FROM audit_logs WHERE 1=1"
	args := []interface{}{}

	if filter.UserID != nil {
		baseQuery += " AND user_id = ?"
		args = append(args, *filter.UserID)
	}
	if filter.Action != "" {
		baseQuery += " AND action = ?"
		args = append(args, filter.Action)
	}
	if filter.ActionPrefix != "" {
		baseQuery += " AND action LIKE ?"
		args = append(args, filter.ActionPrefix+"%")
	}
	if !filter.StartTime.IsZero() {
		baseQuery += " AND timestamp >= ?"
		args = append(args, filter.StartTime)
	}
	if !filter.EndTime.IsZero() {
		baseQuery += " AND timestamp <= ?"
		args = append(args, filter.EndTime)
	}

	// Get total count
	var total int
	countQuery := "SELECT COUNT(*) " + baseQuery
	err := DB.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Get paginated results
	query := "SELECT id, timestamp, user_id, username, action, target, details, ip_address " + baseQuery
	query += " ORDER BY timestamp DESC"

	if filter.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, filter.Limit)
	}
	if filter.Offset > 0 {
		query += " OFFSET ?"
		args = append(args, filter.Offset)
	}

	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []*models.AuditLog
	for rows.Next() {
		log := &models.AuditLog{}
		var userID sql.NullInt64
		var username, target, details, ipAddress sql.NullString

		err := rows.Scan(
			&log.ID, &log.Timestamp, &userID, &username,
			&log.Action, &target, &details, &ipAddress,
		)
		if err != nil {
			return nil, 0, err
		}

		if userID.Valid {
			log.UserID = userID.Int64
		}
		if username.Valid {
			log.Username = username.String
		}
		if target.Valid {
			log.Target = target.String
		}
		if details.Valid {
			log.Details = details.String
		}
		if ipAddress.Valid {
			log.IPAddress = ipAddress.String
		}

		logs = append(logs, log)
	}

	return logs, total, nil
}

// GetByID retrieves a single audit log by ID
func (r *AuditRepo) GetByID(id int64) (*models.AuditLog, error) {
	log := &models.AuditLog{}
	var userID sql.NullInt64
	var username, target, details, ipAddress sql.NullString

	err := DB.QueryRow(`
		SELECT id, timestamp, user_id, username, action, target, details, ip_address
		FROM audit_logs WHERE id = ?
	`, id).Scan(
		&log.ID, &log.Timestamp, &userID, &username,
		&log.Action, &target, &details, &ipAddress,
	)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	if userID.Valid {
		log.UserID = userID.Int64
	}
	if username.Valid {
		log.Username = username.String
	}
	if target.Valid {
		log.Target = target.String
	}
	if details.Valid {
		log.Details = details.String
	}
	if ipAddress.Valid {
		log.IPAddress = ipAddress.String
	}

	return log, nil
}

// GetActions returns a list of unique actions in the audit log
func (r *AuditRepo) GetActions() ([]string, error) {
	rows, err := DB.Query("SELECT DISTINCT action FROM audit_logs ORDER BY action")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var actions []string
	for rows.Next() {
		var action string
		if err := rows.Scan(&action); err != nil {
			return nil, err
		}
		actions = append(actions, action)
	}

	return actions, nil
}

// DeleteOlderThan deletes audit logs older than the specified time
func (r *AuditRepo) DeleteOlderThan(t time.Time) (int64, error) {
	result, err := DB.Exec("DELETE FROM audit_logs WHERE timestamp < ?", t)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// ErrNotFound is returned when an entity is not found
var ErrNotFound = sql.ErrNoRows
