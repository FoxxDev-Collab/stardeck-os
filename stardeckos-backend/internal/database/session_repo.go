package database

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"

	"stardeckos-backend/internal/models"
)

var (
	ErrSessionNotFound = errors.New("session not found")
	ErrSessionExpired  = errors.New("session expired")
)

// SessionRepo handles session database operations
type SessionRepo struct{}

// NewSessionRepo creates a new session repository
func NewSessionRepo() *SessionRepo {
	return &SessionRepo{}
}

// Create creates a new session and returns the plain token
func (r *SessionRepo) Create(userID int64, ipAddress, userAgent string, duration time.Duration) (string, *models.Session, error) {
	// Generate random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", nil, err
	}
	token := hex.EncodeToString(tokenBytes)

	// Hash the token for storage
	tokenHash := hashToken(token)

	session := &models.Session{
		UserID:    userID,
		TokenHash: tokenHash,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(duration),
		IPAddress: ipAddress,
		UserAgent: userAgent,
	}

	result, err := DB.Exec(`
		INSERT INTO sessions (user_id, token_hash, created_at, expires_at, ip_address, user_agent)
		VALUES (?, ?, ?, ?, ?, ?)
	`, session.UserID, session.TokenHash, session.CreatedAt, session.ExpiresAt, session.IPAddress, session.UserAgent)
	if err != nil {
		return "", nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return "", nil, err
	}
	session.ID = id

	return token, session, nil
}

// GetByToken retrieves a session by its plain token
func (r *SessionRepo) GetByToken(token string) (*models.Session, error) {
	tokenHash := hashToken(token)
	return r.GetByTokenHash(tokenHash)
}

// GetByTokenHash retrieves a session by its hashed token
func (r *SessionRepo) GetByTokenHash(tokenHash string) (*models.Session, error) {
	session := &models.Session{}

	err := DB.QueryRow(`
		SELECT id, user_id, token_hash, created_at, expires_at, ip_address, user_agent
		FROM sessions WHERE token_hash = ?
	`, tokenHash).Scan(
		&session.ID, &session.UserID, &session.TokenHash,
		&session.CreatedAt, &session.ExpiresAt, &session.IPAddress, &session.UserAgent,
	)
	if err == sql.ErrNoRows {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, err
	}

	// Check if expired
	if time.Now().After(session.ExpiresAt) {
		// Clean up expired session
		r.Delete(session.ID)
		return nil, ErrSessionExpired
	}

	return session, nil
}

// GetByUserID retrieves all sessions for a user
func (r *SessionRepo) GetByUserID(userID int64) ([]*models.Session, error) {
	rows, err := DB.Query(`
		SELECT id, user_id, token_hash, created_at, expires_at, ip_address, user_agent
		FROM sessions WHERE user_id = ? ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*models.Session
	for rows.Next() {
		session := &models.Session{}
		err := rows.Scan(
			&session.ID, &session.UserID, &session.TokenHash,
			&session.CreatedAt, &session.ExpiresAt, &session.IPAddress, &session.UserAgent,
		)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}

	return sessions, nil
}

// Extend extends a session's expiration time
func (r *SessionRepo) Extend(id int64, duration time.Duration) error {
	newExpiry := time.Now().Add(duration)
	result, err := DB.Exec("UPDATE sessions SET expires_at = ? WHERE id = ?", newExpiry, id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrSessionNotFound
	}

	return nil
}

// Delete deletes a session by ID
func (r *SessionRepo) Delete(id int64) error {
	_, err := DB.Exec("DELETE FROM sessions WHERE id = ?", id)
	return err
}

// DeleteByToken deletes a session by its plain token
func (r *SessionRepo) DeleteByToken(token string) error {
	tokenHash := hashToken(token)
	result, err := DB.Exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrSessionNotFound
	}

	return nil
}

// DeleteAllForUser deletes all sessions for a user
func (r *SessionRepo) DeleteAllForUser(userID int64) error {
	_, err := DB.Exec("DELETE FROM sessions WHERE user_id = ?", userID)
	return err
}

// DeleteExpired removes all expired sessions
func (r *SessionRepo) DeleteExpired() (int64, error) {
	result, err := DB.Exec("DELETE FROM sessions WHERE expires_at < ?", time.Now())
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// CountByUserID returns the number of active sessions for a user
func (r *SessionRepo) CountByUserID(userID int64) (int, error) {
	var count int
	err := DB.QueryRow(
		"SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?",
		userID, time.Now(),
	).Scan(&count)
	return count, err
}

// hashToken creates a SHA-256 hash of the token
func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}
