package auth

import (
	"errors"
	"time"

	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserDisabled       = errors.New("user account is disabled")
	ErrAuthMethodDisabled = errors.New("authentication method is disabled")
	ErrTooManySessions    = errors.New("too many active sessions")
)

// Service handles authentication logic
type Service struct {
	userRepo     *database.UserRepo
	sessionRepo  *database.SessionRepo
	settingsRepo *database.SettingsRepo
	pamAuth      *PAMAuth
}

// NewService creates a new auth service
func NewService() *Service {
	return &Service{
		userRepo:     database.NewUserRepo(),
		sessionRepo:  database.NewSessionRepo(),
		settingsRepo: database.NewSettingsRepo(),
		pamAuth:      NewPAMAuth(),
	}
}

// LoginRequest represents login credentials
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	AuthType string `json:"auth_type"` // "local" or "pam", empty defaults to trying both
}

// LoginResponse represents a successful login
type LoginResponse struct {
	User      *models.User `json:"user"`
	Token     string       `json:"token"`
	ExpiresAt time.Time    `json:"expires_at"`
}

// Login authenticates a user and creates a session
func (s *Service) Login(req LoginRequest, ipAddress, userAgent string) (*LoginResponse, error) {
	var user *models.User
	var err error

	// Get auth settings
	localEnabled, _ := s.settingsRepo.GetBool(database.SettingAuthLocalEnabled)
	pamEnabled, _ := s.settingsRepo.GetBool(database.SettingAuthPAMEnabled)

	// Try to authenticate based on auth_type preference
	switch req.AuthType {
	case "local":
		if !localEnabled {
			return nil, ErrAuthMethodDisabled
		}
		user, err = s.authenticateLocal(req.Username, req.Password)
	case "pam":
		if !pamEnabled {
			return nil, ErrAuthMethodDisabled
		}
		user, err = s.authenticatePAM(req.Username, req.Password)
	default:
		// Try local first, then PAM
		if localEnabled {
			user, err = s.authenticateLocal(req.Username, req.Password)
		}
		if user == nil && pamEnabled {
			user, err = s.authenticatePAM(req.Username, req.Password)
		}
	}

	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	// Check if user is disabled
	if user.Disabled {
		return nil, ErrUserDisabled
	}

	// Check session limit
	maxSessions, _ := s.settingsRepo.GetInt(database.SettingSessionMaxPerUser)
	if maxSessions > 0 {
		count, _ := s.sessionRepo.CountByUserID(user.ID)
		if count >= maxSessions {
			// Delete oldest session to make room
			sessions, _ := s.sessionRepo.GetByUserID(user.ID)
			if len(sessions) > 0 {
				s.sessionRepo.Delete(sessions[len(sessions)-1].ID)
			}
		}
	}

	// Get session timeout
	timeoutMinutes, err := s.settingsRepo.GetInt(database.SettingSessionTimeout)
	if err != nil || timeoutMinutes <= 0 {
		timeoutMinutes = 60 // Default 1 hour
	}
	duration := time.Duration(timeoutMinutes) * time.Minute

	// Create session
	token, session, err := s.sessionRepo.Create(user.ID, ipAddress, userAgent, duration)
	if err != nil {
		return nil, err
	}

	// Update last login
	s.userRepo.UpdateLastLogin(user.ID)

	return &LoginResponse{
		User:      user,
		Token:     token,
		ExpiresAt: session.ExpiresAt,
	}, nil
}

// authenticateLocal verifies credentials against local database
func (s *Service) authenticateLocal(username, password string) (*models.User, error) {
	user, err := s.userRepo.GetByUsername(username)
	if err != nil {
		if errors.Is(err, database.ErrUserNotFound) {
			return nil, nil // Not found, try other methods
		}
		return nil, err
	}

	// Only authenticate local users here
	if user.AuthType != models.AuthTypeLocal {
		return nil, nil
	}

	// Verify password
	valid, err := VerifyPassword(password, user.PasswordHash)
	if err != nil || !valid {
		return nil, nil
	}

	return user, nil
}

// authenticatePAM verifies credentials against Linux PAM
func (s *Service) authenticatePAM(username, password string) (*models.User, error) {
	// Verify against PAM
	if err := s.pamAuth.Authenticate(username, password); err != nil {
		return nil, nil // Invalid credentials
	}

	// Check if user exists in our database
	user, err := s.userRepo.GetByUsername(username)
	if err != nil && !errors.Is(err, database.ErrUserNotFound) {
		return nil, err
	}

	if user != nil {
		// User exists, verify it's a PAM user
		if user.AuthType != models.AuthTypePAM {
			return nil, nil // Username conflict with local user
		}
		return user, nil
	}

	// Auto-create PAM user in database
	sysUser, err := s.pamAuth.GetUserInfo(username)
	if err != nil {
		return nil, err
	}

	// Determine role based on group membership
	role := models.RoleViewer
	if s.pamAuth.IsAdmin(username) {
		role = models.RoleAdmin
	}

	displayName := sysUser.Name
	if displayName == "" {
		displayName = username
	}

	user = &models.User{
		Username:    username,
		DisplayName: displayName,
		AuthType:    models.AuthTypePAM,
		Role:        role,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return user, nil
}

// Logout invalidates a session
func (s *Service) Logout(token string) error {
	return s.sessionRepo.DeleteByToken(token)
}

// ValidateToken validates a session token and returns the user
func (s *Service) ValidateToken(token string) (*models.User, *models.Session, error) {
	session, err := s.sessionRepo.GetByToken(token)
	if err != nil {
		return nil, nil, err
	}

	user, err := s.userRepo.GetByID(session.UserID)
	if err != nil {
		return nil, nil, err
	}

	if user.Disabled {
		return nil, nil, ErrUserDisabled
	}

	return user, session, nil
}

// RefreshToken extends the session expiration
func (s *Service) RefreshToken(token string) (*models.Session, error) {
	session, err := s.sessionRepo.GetByToken(token)
	if err != nil {
		return nil, err
	}

	// Get session timeout
	timeoutMinutes, err := s.settingsRepo.GetInt(database.SettingSessionTimeout)
	if err != nil || timeoutMinutes <= 0 {
		timeoutMinutes = 60
	}
	duration := time.Duration(timeoutMinutes) * time.Minute

	if err := s.sessionRepo.Extend(session.ID, duration); err != nil {
		return nil, err
	}

	session.ExpiresAt = time.Now().Add(duration)
	return session, nil
}

// GetUserSessions returns all sessions for a user
func (s *Service) GetUserSessions(userID int64) ([]*models.Session, error) {
	return s.sessionRepo.GetByUserID(userID)
}

// RevokeSession revokes a specific session
func (s *Service) RevokeSession(sessionID int64) error {
	return s.sessionRepo.Delete(sessionID)
}

// RevokeAllSessions revokes all sessions for a user
func (s *Service) RevokeAllSessions(userID int64) error {
	return s.sessionRepo.DeleteAllForUser(userID)
}
