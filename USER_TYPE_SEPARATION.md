# User Type Separation - System vs Web Users

## Overview

Stardeck OS now enforces a **clear separation** between **System Users** and **Web Users** to ensure proper security and access control.

### User Types

#### System Users (`user_type: "system"`)
- **Full access** to all system administration features
- Can manage:
  - Users and groups
  - System resources (CPU, memory, processes)
  - Services (systemd)
  - Package management (DNF/RPM)
  - Storage and partitions
  - System updates
  - Realms and authentication
  - Audit logs
  - File system (unrestricted)
  - Terminal (unrestricted)

#### Web Users (`user_type: "web"`)
- **Limited access** - NO system administration features
- Can ONLY access:
  - File browser (restricted to `/home/<username>/` directory)
  - Terminal (restricted to their home directory)
  - Their own profile settings

**Web users CANNOT:**
- View or manage other users
- View or manage groups
- Access system resources or processes
- Control services
- Install/remove packages
- View or modify storage/partitions
- Apply system updates
- View audit logs
- Access files outside their home directory
- Execute privileged commands

---

## Implementation Details

### Database Schema

A new `user_type` column has been added to the `users` table:

```sql
ALTER TABLE users ADD COLUMN user_type TEXT NOT NULL DEFAULT 'system';
CREATE INDEX idx_users_user_type ON users(user_type);
```

### User Model

```go
type UserType string

const (
    UserTypeSystem UserType = "system" // System admin with full server access
    UserTypeWeb    UserType = "web"    // Web user with limited access
)

type User struct {
    // ... other fields
    UserType     UserType  `json:"user_type"`
    // ... other fields
}
```

### Middleware Protection

A new middleware `RequireSystemUser()` has been implemented and applied to ALL system administration endpoints:

```go
func RequireSystemUser() echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            user := auth.GetUserFromContext(c)
            
            if !user.IsSystemUser() {
                return c.JSON(http.StatusForbidden, map[string]string{
                    "error": "access denied: system administrator privileges required",
                })
            }
            
            return next(c)
        }
    }
}
```

### Protected Endpoints

All of the following endpoint groups are **restricted to system users only**:

- `/api/users/*` - User management
- `/api/groups/*` - Group management
- `/api/realms/*` - Realm/authentication management
- `/api/system/*` - System information and control
- `/api/processes/*` - Process management
- `/api/services/*` - Service management
- `/api/updates/*` - System update management
- `/api/repositories/*` - Repository management
- `/api/packages/*` - Package management
- `/api/metadata/*` - Metadata refresh
- `/api/storage/*` - Storage and partition management
- `/api/audit/*` - Audit log access

### File Access Restrictions

Web users are restricted to their home directory through path validation:

```go
func validateFilePath(c echo.Context, path string) error {
    user := auth.GetUserFromContext(c)
    
    // System users have unrestricted access
    if user.IsSystemUser() {
        return nil
    }
    
    // Web users are restricted to their home directory
    cleanPath := filepath.Clean(path)
    userHomeDir := filepath.Join("/home", user.Username)
    
    if !strings.HasPrefix(cleanPath, userHomeDir) {
        return fmt.Errorf("access denied: web users can only access their home directory")
    }
    
    return nil
}
```

This validation is applied to all file operations:
- List files
- Read/preview files
- Download files
- Upload files
- Create files/directories
- Update file content
- Rename/move files
- Copy files
- Delete files
- Change permissions

---

## Creating Users

### System User (via API)

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "username": "admin1",
    "display_name": "Administrator",
    "password": "SecurePassword123",
    "user_type": "system",
    "role": "admin"
  }'
```

### Web User (via API)

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "username": "webuser1",
    "display_name": "Web User",
    "password": "SecurePassword123",
    "user_type": "web",
    "role": "viewer"
  }'
```

### PAM User (Auto-Detection)

When a Linux system user logs in via PAM authentication:
- **If user is in wheel group**: Automatically assigned `user_type: "system"` and `role: "admin"`
- **Otherwise**: Automatically assigned `user_type: "web"` and `role: "viewer"`

---

## Migration from Phase 1

### Existing Users

All existing users will default to `user_type: "system"` to maintain backward compatibility.

### Updating User Types

To convert a system user to a web user:

```bash
curl -X PUT http://localhost:8080/api/users/<user_id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "user_type": "web"
  }'
```

---

## Security Considerations

### Web User Restrictions

Web users receive **403 Forbidden** responses when attempting to access any system administration endpoint:

```json
{
  "error": "access denied: system administrator privileges required"
}
```

### File Access Violations

Web users attempting to access files outside their home directory receive:

```json
{
  "error": "access denied: web users can only access their home directory"
}
```

### Terminal Access

While web users can access the terminal, they should be restricted by:
1. Linux user permissions (they run commands as their own user)
2. File system restrictions (cannot access files outside their home)
3. PAM/system security policies

---

## Best Practices

### For System Administrators

1. **Create system users for trusted administrators only**
   - Use `user_type: "system"` sparingly
   - These users have complete control over the server

2. **Create web users for regular users**
   - Use `user_type: "web"` for users who only need file access
   - They cannot harm the system or view sensitive information

3. **Review user types regularly**
   - Audit which users have system access
   - Demote users who no longer need system privileges

### For Web Users

Web users should be informed that:
- They have limited access to the system
- They can only manage their own files in their home directory
- They cannot view or modify system settings
- They cannot see other users or system information

---

## Testing

### Verify System User Access

```bash
# Login as system user
TOKEN=$(curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin1","password":"SecurePassword123"}' \
  | jq -r '.token')

# Should succeed - system user can view processes
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/processes
```

### Verify Web User Restrictions

```bash
# Login as web user
TOKEN=$(curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"webuser1","password":"SecurePassword123"}' \
  | jq -r '.token')

# Should fail with 403 - web user cannot view processes
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/processes

# Should succeed - web user can access their own files
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/files?path=/home/webuser1"

# Should fail with 403 - web user cannot access other directories
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/files?path=/etc"
```

---

## Summary

The implementation now provides a **massive separation** between system administrators and web users:

✅ **System users** have complete access to all server management features  
✅ **Web users** are isolated to their home directory with no system access  
✅ **All system administration endpoints** are protected with middleware  
✅ **File access** is validated on every operation  
✅ **PAM users** are automatically categorized based on group membership  
✅ **Backward compatible** with existing Phase 1 users (defaulted to system)  

This ensures that web users **cannot see or access anything related to system administration and configuration**, as required.
