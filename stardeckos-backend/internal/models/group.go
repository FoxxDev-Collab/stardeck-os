package models

import "time"

// Group represents a user group for permission management
type Group struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	DisplayName string    `json:"display_name"`
	Description string    `json:"description"`
	RealmID     *int64    `json:"realm_id,omitempty"`
	SystemGID   *string   `json:"system_gid,omitempty"` // Linux GID if synced to system
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UserGroup represents the many-to-many relationship between users and groups
type UserGroup struct {
	UserID    int64     `json:"user_id"`
	GroupID   int64     `json:"group_id"`
	CreatedAt time.Time `json:"created_at"`
}

// Permission represents a granular permission
type Permission struct {
	ID          int64  `json:"id"`
	Code        string `json:"code"` // e.g., "users.create", "services.restart"
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"` // e.g., "users", "services", "system"
}

// GroupPermission represents permissions assigned to a group
type GroupPermission struct {
	GroupID      int64     `json:"group_id"`
	PermissionID int64     `json:"permission_id"`
	CreatedAt    time.Time `json:"created_at"`
}

// CreateGroupRequest represents the request body for creating a group
type CreateGroupRequest struct {
	Name         string `json:"name" validate:"required,min=3,max=32"`
	DisplayName  string `json:"display_name" validate:"required,min=1,max=64"`
	Description  string `json:"description,omitempty"`
	RealmID      *int64 `json:"realm_id,omitempty"`
	SyncToSystem bool   `json:"sync_to_system"` // Create corresponding Linux group
}

// UpdateGroupRequest represents the request body for updating a group
type UpdateGroupRequest struct {
	DisplayName *string `json:"display_name,omitempty"`
	Description *string `json:"description,omitempty"`
}

// AddGroupMembersRequest represents adding users to a group
type AddGroupMembersRequest struct {
	UserIDs []int64 `json:"user_ids" validate:"required,min=1"`
}
