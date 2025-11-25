package models

import "time"

// AuditLog represents a record of user actions
type AuditLog struct {
	ID        int64     `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	Action    string    `json:"action"`
	Target    string    `json:"target"`
	Details   string    `json:"details"` // JSON string
	IPAddress string    `json:"ip_address"`
}

// AuditFilter defines filters for querying audit logs
type AuditFilter struct {
	UserID       *int64    `json:"user_id"`
	Action       string    `json:"action"`
	ActionPrefix string    `json:"action_prefix"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Limit        int       `json:"limit"`
	Offset       int       `json:"offset"`
}

// AuditListResponse wraps audit log list with pagination info
type AuditListResponse struct {
	Logs   []*AuditLog `json:"logs"`
	Total  int         `json:"total"`
	Limit  int         `json:"limit"`
	Offset int         `json:"offset"`
}

// Common audit actions
const (
	ActionLogin          = "login"
	ActionLoginFailed    = "login.failed"
	ActionLogout         = "logout"
	ActionUserCreate     = "user.create"
	ActionUserUpdate     = "user.update"
	ActionUserDelete     = "user.delete"
	ActionUserDisable    = "user.disable"
	ActionUserEnable     = "user.enable"
	ActionGroupCreate    = "group.create"
	ActionGroupUpdate    = "group.update"
	ActionGroupDelete    = "group.delete"
	ActionGroupAddMember = "group.add_member"
	ActionGroupRemoveMember = "group.remove_member"
	ActionRealmCreate    = "realm.create"
	ActionRealmUpdate    = "realm.update"
	ActionRealmDelete    = "realm.delete"
	ActionProcessKill    = "process.kill"
	ActionServiceStart   = "service.start"
	ActionServiceStop    = "service.stop"
	ActionServiceRestart = "service.restart"
	ActionServiceReload  = "service.reload"
	ActionServiceEnable  = "service.enable"
	ActionServiceDisable = "service.disable"
	ActionUpdateApply    = "update.apply"
	ActionPackageInstall = "package.install"
	ActionPackageRemove  = "package.remove"
	ActionRepoCreate     = "repo.create"
	ActionRepoUpdate     = "repo.update"
	ActionRepoDelete     = "repo.delete"
	ActionFileCreate     = "file.create"
	ActionFileUpdate     = "file.update"
	ActionFileDelete     = "file.delete"
	ActionFileUpload     = "file.upload"
	ActionFileRename     = "file.rename"
	ActionFileCopy       = "file.copy"
	ActionFilePermChange = "file.permission_change"
	ActionPartitionCreate = "partition.create"
	ActionPartitionDelete = "partition.delete"
	ActionPartitionFormat = "partition.format"
	ActionMount          = "storage.mount"
	ActionUnmount        = "storage.unmount"
	ActionSystemReboot   = "system.reboot"
	ActionSessionRevoke  = "session.revoke"
)
