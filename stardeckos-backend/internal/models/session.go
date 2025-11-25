package models

import "time"

// Session represents an authenticated user session
type Session struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	TokenHash string    `json:"-"` // Never expose in JSON
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
}

// LoginRequest represents the request body for login
type LoginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

// LoginResponse represents the response after successful login
type LoginResponse struct {
	User  User   `json:"user"`
	Token string `json:"token"`
}
