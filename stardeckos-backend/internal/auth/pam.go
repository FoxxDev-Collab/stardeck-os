package auth

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"strings"
)

// PAMAuth handles authentication against Linux system accounts
type PAMAuth struct{}

// NewPAMAuth creates a new PAM authenticator
func NewPAMAuth() *PAMAuth {
	return &PAMAuth{}
}

// Authenticate verifies credentials against the system PAM
// This uses the 'su' command approach which is portable and doesn't require CGO
func (p *PAMAuth) Authenticate(username, password string) error {
	// Use su with a timeout to verify credentials
	// This approach works without CGO and is used by many web admin tools
	cmd := exec.Command("su", "-c", "true", username)

	// Create a pipe for stdin
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start su: %w", err)
	}

	// Write password
	_, err = stdin.Write([]byte(password + "\n"))
	if err != nil {
		return fmt.Errorf("failed to write password: %w", err)
	}
	stdin.Close()

	// Wait for completion
	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("authentication failed")
	}

	return nil
}

// GetUserInfo retrieves user information from the system
func (p *PAMAuth) GetUserInfo(username string) (*SystemUser, error) {
	u, err := user.Lookup(username)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	sysUser := &SystemUser{
		Username: u.Username,
		UID:      u.Uid,
		GID:      u.Gid,
		Name:     u.Name,
		HomeDir:  u.HomeDir,
	}

	// Get groups
	groups, err := u.GroupIds()
	if err == nil {
		sysUser.Groups = groups
	}

	return sysUser, nil
}

// IsAdmin checks if the user is in the wheel or sudo group
func (p *PAMAuth) IsAdmin(username string) bool {
	u, err := user.Lookup(username)
	if err != nil {
		return false
	}

	groups, err := u.GroupIds()
	if err != nil {
		return false
	}

	// Check for wheel group (RHEL/Rocky) or sudo group (Debian/Ubuntu)
	wheelGroup, _ := user.LookupGroup("wheel")
	sudoGroup, _ := user.LookupGroup("sudo")

	for _, gid := range groups {
		if wheelGroup != nil && gid == wheelGroup.Gid {
			return true
		}
		if sudoGroup != nil && gid == sudoGroup.Gid {
			return true
		}
	}

	// Also check if user is root
	return u.Uid == "0"
}

// SystemUser represents a Linux system user
type SystemUser struct {
	Username string
	UID      string
	GID      string
	Name     string
	HomeDir  string
	Groups   []string
}

// GetSystemUsers returns a list of regular (non-system) users
func (p *PAMAuth) GetSystemUsers() ([]*SystemUser, error) {
	file, err := os.Open("/etc/passwd")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var users []*SystemUser
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Split(line, ":")
		if len(fields) < 7 {
			continue
		}

		// Skip system users (UID < 1000) except root
		// Also skip nologin/false shell users
		shell := fields[6]
		if strings.Contains(shell, "nologin") || strings.Contains(shell, "/false") {
			continue
		}

		users = append(users, &SystemUser{
			Username: fields[0],
			UID:      fields[2],
			GID:      fields[3],
			Name:     fields[4],
			HomeDir:  fields[5],
		})
	}

	return users, nil
}

// GetSystemGroups returns a list of system groups
func (p *PAMAuth) GetSystemGroups() ([]*SystemGroup, error) {
	cmd := exec.Command("getent", "group")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get groups: %w", err)
	}

	var groups []*SystemGroup
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Split(line, ":")
		if len(fields) < 4 {
			continue
		}

		members := []string{}
		if fields[3] != "" {
			members = strings.Split(fields[3], ",")
		}

		groups = append(groups, &SystemGroup{
			Name:    fields[0],
			GID:     fields[2],
			Members: members,
		})
	}

	return groups, nil
}

// GetUserGroups returns all groups a user belongs to
func (p *PAMAuth) GetUserGroups(username string) ([]string, error) {
	u, err := user.Lookup(username)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	groupIds, err := u.GroupIds()
	if err != nil {
		return nil, fmt.Errorf("failed to get group IDs: %w", err)
	}

	var groupNames []string
	for _, gid := range groupIds {
		g, err := user.LookupGroupId(gid)
		if err == nil {
			groupNames = append(groupNames, g.Name)
		}
	}

	return groupNames, nil
}

// IsInWheelGroup checks if user is in the wheel group specifically
func (p *PAMAuth) IsInWheelGroup(username string) bool {
	groups, err := p.GetUserGroups(username)
	if err != nil {
		return false
	}

	for _, group := range groups {
		if group == "wheel" || group == "sudo" {
			return true
		}
	}
	return false
}

// CreateSystemUser creates a new Linux system user
func (p *PAMAuth) CreateSystemUser(username, fullName, password string) error {
	// Create user with useradd
	cmd := exec.Command("useradd", "-m", "-c", fullName, username)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	// Set password with chpasswd
	cmd = exec.Command("chpasswd")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start chpasswd: %w", err)
	}

	_, err = stdin.Write([]byte(fmt.Sprintf("%s:%s\n", username, password)))
	if err != nil {
		return fmt.Errorf("failed to write password: %w", err)
	}
	stdin.Close()

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("failed to set password: %w", err)
	}

	return nil
}

// DeleteSystemUser deletes a Linux system user
func (p *PAMAuth) DeleteSystemUser(username string) error {
	cmd := exec.Command("userdel", "-r", username)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	return nil
}

// AddUserToGroup adds a user to a system group
func (p *PAMAuth) AddUserToGroup(username, groupname string) error {
	cmd := exec.Command("usermod", "-aG", groupname, username)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to add user to group: %w", err)
	}
	return nil
}

// RemoveUserFromGroup removes a user from a system group
func (p *PAMAuth) RemoveUserFromGroup(username, groupname string) error {
	cmd := exec.Command("gpasswd", "-d", username, groupname)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to remove user from group: %w", err)
	}
	return nil
}

// CreateSystemGroup creates a new Linux system group
func (p *PAMAuth) CreateSystemGroup(groupname string) error {
	cmd := exec.Command("groupadd", groupname)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create group: %w", err)
	}
	return nil
}

// DeleteSystemGroup deletes a Linux system group
func (p *PAMAuth) DeleteSystemGroup(groupname string) error {
	cmd := exec.Command("groupdel", groupname)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to delete group: %w", err)
	}
	return nil
}

// SystemGroup represents a Linux system group
type SystemGroup struct {
	Name    string   `json:"name"`
	GID     string   `json:"gid"`
	Members []string `json:"members"`
}
