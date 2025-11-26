package models

import "time"

// Role represents user access levels
type Role string

const (
	RoleAdmin    Role = "admin"
	RoleOperator Role = "operator"
	RoleViewer   Role = "viewer"
)

// AuthType represents how a user authenticates
type AuthType string

const (
	AuthTypeLocal AuthType = "local" // Stardeck local account
	AuthTypePAM   AuthType = "pam"   // Linux system account via PAM
)

// User represents a system user
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	DisplayName  string    `json:"display_name"`
	Email        string    `json:"email,omitempty"`
	PasswordHash string    `json:"-"` // Never expose in JSON
	Role         Role      `json:"role"`
	AuthType     AuthType  `json:"auth_type"`
	RealmID      *int64    `json:"realm_id,omitempty"`
	SystemUID    *string   `json:"system_uid,omitempty"` // Linux UID if synced to system
	Disabled     bool      `json:"disabled"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	LastLogin    time.Time `json:"last_login,omitempty"`
	IsPAMAdmin   bool      `json:"is_pam_admin,omitempty"` // Calculated: true if in wheel/sudo or is root
}

// IsAdmin returns true if the user has admin privileges
// For PAM users, this checks wheel/sudo group membership
// For local users, this checks the role
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin || u.IsPAMAdmin
}

// CanManageUsers returns true if the user can manage other users
func (u *User) CanManageUsers() bool {
	// PAM admins (wheel/sudo/root) can always manage users
	if u.IsPAMAdmin {
		return true
	}
	// Local admins can manage users
	return u.Role == RoleAdmin
}

// CreateUserRequest represents the request body for creating a user
type CreateUserRequest struct {
	Username     string `json:"username" validate:"required,min=3,max=32"`
	DisplayName  string `json:"display_name" validate:"required,min=1,max=64"`
	Email        string `json:"email,omitempty" validate:"omitempty,email"`
	Password     string `json:"password" validate:"required,min=8"`
	Role         Role   `json:"role" validate:"required,oneof=admin operator viewer"`
	RealmID      *int64 `json:"realm_id,omitempty"`
	CreateSystem bool   `json:"create_system"` // Also create Linux system user
}

// UpdateUserRequest represents the request body for updating a user
type UpdateUserRequest struct {
	DisplayName *string `json:"display_name,omitempty"`
	Email       *string `json:"email,omitempty"`
	Password    *string `json:"password,omitempty"`
	Role        *Role   `json:"role,omitempty"`
	Disabled    *bool   `json:"disabled,omitempty"`
}

// UserWithGroups includes user's group memberships
type UserWithGroups struct {
	User
	Groups []int64 `json:"group_ids"`
}
