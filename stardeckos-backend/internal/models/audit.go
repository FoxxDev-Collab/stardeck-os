package models

import "time"

// AuditLog represents a record of user actions
type AuditLog struct {
	ID        int64     `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	UserID    int64     `json:"user_id"`
	Action    string    `json:"action"`
	Target    string    `json:"target"`
	Details   string    `json:"details"` // JSON string
}

// Common audit actions
const (
	ActionLogin         = "login"
	ActionLogout        = "logout"
	ActionUserCreate    = "user.create"
	ActionUserUpdate    = "user.update"
	ActionUserDelete    = "user.delete"
	ActionProcessKill   = "process.kill"
	ActionServiceStart  = "service.start"
	ActionServiceStop   = "service.stop"
	ActionServiceRestart = "service.restart"
	ActionUpdateApply   = "update.apply"
	ActionSystemReboot  = "system.reboot"
)
