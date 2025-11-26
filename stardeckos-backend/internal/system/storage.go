package system

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// Disk represents a physical disk device
type Disk struct {
	Name       string  `json:"name"`
	Path       string  `json:"path"`
	Size       uint64  `json:"size"`
	SizeHuman  string  `json:"size_human"`
	Type       string  `json:"type"` // disk, part, lvm, etc.
	Model      string  `json:"model"`
	Serial     string  `json:"serial"`
	Vendor     string  `json:"vendor"`
	Rotational bool    `json:"rotational"` // true = HDD, false = SSD
	Partitions []Disk  `json:"partitions,omitempty"`
	MountPoint string  `json:"mount_point,omitempty"`
	FSType     string  `json:"fstype,omitempty"`
}

// Mount represents a mounted filesystem
type Mount struct {
	Device     string  `json:"device"`
	MountPoint string  `json:"mount_point"`
	FSType     string  `json:"fstype"`
	Options    string  `json:"options"`
	Total      uint64  `json:"total"`
	Used       uint64  `json:"used"`
	Available  uint64  `json:"available"`
	UsePercent float64 `json:"use_percent"`
}

// LVMInfo contains LVM configuration
type LVMInfo struct {
	VolumeGroups   []VolumeGroup   `json:"volume_groups"`
	LogicalVolumes []LogicalVolume `json:"logical_volumes"`
	PhysicalVolumes []PhysicalVolume `json:"physical_volumes"`
}

// VolumeGroup represents an LVM volume group
type VolumeGroup struct {
	Name      string `json:"name"`
	Size      uint64 `json:"size"`
	SizeHuman string `json:"size_human"`
	Free      uint64 `json:"free"`
	FreeHuman string `json:"free_human"`
	PVCount   int    `json:"pv_count"`
	LVCount   int    `json:"lv_count"`
}

// LogicalVolume represents an LVM logical volume
type LogicalVolume struct {
	Name       string `json:"name"`
	VGName     string `json:"vg_name"`
	Size       uint64 `json:"size"`
	SizeHuman  string `json:"size_human"`
	Path       string `json:"path"`
	Active     bool   `json:"active"`
	MountPoint string `json:"mount_point,omitempty"`
}

// PhysicalVolume represents an LVM physical volume
type PhysicalVolume struct {
	Name      string `json:"name"`
	VGName    string `json:"vg_name"`
	Size      uint64 `json:"size"`
	SizeHuman string `json:"size_human"`
	Free      uint64 `json:"free"`
	FreeHuman string `json:"free_human"`
}

// GetDisks returns information about all disks
func GetDisks() ([]Disk, error) {
	// Use lsblk with JSON output
	cmd := exec.Command("lsblk", "-J", "-b", "-o", "NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,ROTA,MOUNTPOINT,FSTYPE,PATH")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run lsblk: %w", err)
	}

	var result struct {
		BlockDevices []struct {
			Name       string `json:"name"`
			Size       any    `json:"size"` // Can be string or number
			Type       string `json:"type"`
			Model      string `json:"model"`
			Serial     string `json:"serial"`
			Vendor     string `json:"vendor"`
			Rota       any    `json:"rota"` // Can be bool or string
			MountPoint string `json:"mountpoint"`
			FSType     string `json:"fstype"`
			Path       string `json:"path"`
			Children   []struct {
				Name       string `json:"name"`
				Size       any    `json:"size"`
				Type       string `json:"type"`
				MountPoint string `json:"mountpoint"`
				FSType     string `json:"fstype"`
				Path       string `json:"path"`
				Children   []struct {
					Name       string `json:"name"`
					Size       any    `json:"size"`
					Type       string `json:"type"`
					MountPoint string `json:"mountpoint"`
					FSType     string `json:"fstype"`
					Path       string `json:"path"`
				} `json:"children"`
			} `json:"children"`
		} `json:"blockdevices"`
	}

	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("failed to parse lsblk output: %w", err)
	}

	disks := make([]Disk, 0)

	for _, bd := range result.BlockDevices {
		// Skip loop devices and ram disks
		if strings.HasPrefix(bd.Name, "loop") || strings.HasPrefix(bd.Name, "ram") {
			continue
		}

		disk := Disk{
			Name:       bd.Name,
			Path:       bd.Path,
			Size:       parseSize(bd.Size),
			Type:       bd.Type,
			Model:      strings.TrimSpace(bd.Model),
			Serial:     strings.TrimSpace(bd.Serial),
			Vendor:     strings.TrimSpace(bd.Vendor),
			Rotational: parseBool(bd.Rota),
			MountPoint: bd.MountPoint,
			FSType:     bd.FSType,
		}
		disk.SizeHuman = formatStorageSize(disk.Size)

		// Add partitions as children
		for _, child := range bd.Children {
			partition := Disk{
				Name:       child.Name,
				Path:       child.Path,
				Size:       parseSize(child.Size),
				Type:       child.Type,
				MountPoint: child.MountPoint,
				FSType:     child.FSType,
			}
			partition.SizeHuman = formatStorageSize(partition.Size)

			// Handle nested children (e.g., LVM on partition)
			for _, subChild := range child.Children {
				subPart := Disk{
					Name:       subChild.Name,
					Path:       subChild.Path,
					Size:       parseSize(subChild.Size),
					Type:       subChild.Type,
					MountPoint: subChild.MountPoint,
					FSType:     subChild.FSType,
				}
				subPart.SizeHuman = formatStorageSize(subPart.Size)
				partition.Partitions = append(partition.Partitions, subPart)
			}

			disk.Partitions = append(disk.Partitions, partition)
		}

		disks = append(disks, disk)
	}

	return disks, nil
}

// GetMounts returns all mounted filesystems with usage info
func GetMounts() ([]Mount, error) {
	// Use df command
	cmd := exec.Command("df", "-B1", "--output=source,target,fstype,size,used,avail,pcent")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run df: %w", err)
	}

	mounts := make([]Mount, 0)

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	// Skip header
	scanner.Scan()

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 7 {
			continue
		}

		// Skip pseudo filesystems
		device := fields[0]
		if strings.HasPrefix(device, "tmpfs") ||
			strings.HasPrefix(device, "devtmpfs") ||
			strings.HasPrefix(device, "efivarfs") ||
			device == "none" {
			continue
		}

		total, _ := strconv.ParseUint(fields[3], 10, 64)
		used, _ := strconv.ParseUint(fields[4], 10, 64)
		avail, _ := strconv.ParseUint(fields[5], 10, 64)

		// Parse percentage (remove % sign)
		percentStr := strings.TrimSuffix(fields[6], "%")
		percent, _ := strconv.ParseFloat(percentStr, 64)

		mount := Mount{
			Device:     fields[0],
			MountPoint: fields[1],
			FSType:     fields[2],
			Total:      total,
			Used:       used,
			Available:  avail,
			UsePercent: percent,
		}

		mounts = append(mounts, mount)
	}

	return mounts, nil
}

// GetLVM returns LVM configuration
func GetLVM() (*LVMInfo, error) {
	info := &LVMInfo{
		VolumeGroups:    make([]VolumeGroup, 0),
		LogicalVolumes:  make([]LogicalVolume, 0),
		PhysicalVolumes: make([]PhysicalVolume, 0),
	}

	// Get volume groups
	vgCmd := exec.Command("vgs", "--noheadings", "--units", "b", "--nosuffix",
		"-o", "vg_name,vg_size,vg_free,pv_count,lv_count")
	vgOutput, err := vgCmd.Output()
	if err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(vgOutput)))
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) >= 5 {
				size, _ := strconv.ParseUint(fields[1], 10, 64)
				free, _ := strconv.ParseUint(fields[2], 10, 64)
				pvCount, _ := strconv.Atoi(fields[3])
				lvCount, _ := strconv.Atoi(fields[4])

				vg := VolumeGroup{
					Name:      fields[0],
					Size:      size,
					SizeHuman: formatStorageSize(size),
					Free:      free,
					FreeHuman: formatStorageSize(free),
					PVCount:   pvCount,
					LVCount:   lvCount,
				}
				info.VolumeGroups = append(info.VolumeGroups, vg)
			}
		}
	}

	// Get logical volumes
	lvCmd := exec.Command("lvs", "--noheadings", "--units", "b", "--nosuffix",
		"-o", "lv_name,vg_name,lv_size,lv_path,lv_active")
	lvOutput, err := lvCmd.Output()
	if err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(lvOutput)))
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) >= 5 {
				size, _ := strconv.ParseUint(fields[2], 10, 64)

				lv := LogicalVolume{
					Name:      fields[0],
					VGName:    fields[1],
					Size:      size,
					SizeHuman: formatStorageSize(size),
					Path:      fields[3],
					Active:    fields[4] == "active",
				}
				info.LogicalVolumes = append(info.LogicalVolumes, lv)
			}
		}
	}

	// Get physical volumes
	pvCmd := exec.Command("pvs", "--noheadings", "--units", "b", "--nosuffix",
		"-o", "pv_name,vg_name,pv_size,pv_free")
	pvOutput, err := pvCmd.Output()
	if err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(pvOutput)))
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) >= 4 {
				size, _ := strconv.ParseUint(fields[2], 10, 64)
				free, _ := strconv.ParseUint(fields[3], 10, 64)

				pv := PhysicalVolume{
					Name:      fields[0],
					VGName:    fields[1],
					Size:      size,
					SizeHuman: formatStorageSize(size),
					Free:      free,
					FreeHuman: formatStorageSize(free),
				}
				info.PhysicalVolumes = append(info.PhysicalVolumes, pv)
			}
		}
	}

	return info, nil
}

// Helper functions

func parseSize(v any) uint64 {
	switch val := v.(type) {
	case float64:
		return uint64(val)
	case string:
		size, _ := strconv.ParseUint(val, 10, 64)
		return size
	default:
		return 0
	}
}

func parseBool(v any) bool {
	switch val := v.(type) {
	case bool:
		return val
	case string:
		return val == "1" || val == "true"
	case float64:
		return val == 1
	default:
		return false
	}
}

func formatStorageSize(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// PartitionRequest represents a request to create a partition
type PartitionRequest struct {
	Device     string `json:"device"`      // e.g., /dev/sda
	SizeMB     int64  `json:"size_mb"`     // Size in MB (0 = use all remaining space)
	FSType     string `json:"fstype"`      // e.g., ext4, xfs, swap
	Label      string `json:"label"`       // Optional partition label
	PartType   string `json:"part_type"`   // primary, logical, extended (for MBR)
}

// FormatRequest represents a request to format a partition
type FormatRequest struct {
	Device string `json:"device"` // e.g., /dev/sda1
	FSType string `json:"fstype"` // e.g., ext4, xfs, swap
	Label  string `json:"label"`  // Optional filesystem label
	Force  bool   `json:"force"`  // Force format even if mounted
}

// MountRequest represents a request to mount/unmount a filesystem
type MountRequest struct {
	Device     string `json:"device"`      // e.g., /dev/sda1
	MountPoint string `json:"mount_point"` // e.g., /mnt/data
	FSType     string `json:"fstype"`      // Optional, auto-detect if empty
	Options    string `json:"options"`     // Mount options (e.g., "defaults,noatime")
}

// DeletePartitionRequest represents a request to delete a partition
type DeletePartitionRequest struct {
	Device    string `json:"device"`     // e.g., /dev/sda
	Partition int    `json:"partition"`  // Partition number (e.g., 1 for sda1)
}

// OperationResult represents the result of a storage operation
type OperationResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Output  string `json:"output,omitempty"`
}

// GetPartitionTable returns the partition table of a disk
func GetPartitionTable(device string) (string, error) {
	// Validate device path
	if !isValidDevice(device) {
		return "", fmt.Errorf("invalid device path: %s", device)
	}

	cmd := exec.Command("parted", device, "-s", "print")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return string(output), fmt.Errorf("failed to get partition table: %w", err)
	}

	return string(output), nil
}

// CreatePartition creates a new partition on a disk
func CreatePartition(req *PartitionRequest) (*OperationResult, error) {
	// Validate device path
	if !isValidDevice(req.Device) {
		return nil, fmt.Errorf("invalid device path: %s", req.Device)
	}

	// Check if disk has a partition table, create GPT if not
	checkCmd := exec.Command("parted", req.Device, "-s", "print")
	checkOutput, checkErr := checkCmd.CombinedOutput()
	outputStr := string(checkOutput)

	// If parted fails with "unrecognised disk label", the disk has no partition table
	if checkErr != nil && (strings.Contains(outputStr, "unrecognised disk label") ||
		strings.Contains(outputStr, "unrecognized disk label")) {
		// Create a GPT partition table
		mklabelCmd := exec.Command("parted", req.Device, "-s", "mklabel", "gpt")
		mklabelOutput, mklabelErr := mklabelCmd.CombinedOutput()
		if mklabelErr != nil {
			return &OperationResult{
				Success: false,
				Message: fmt.Sprintf("Failed to create partition table: %v", mklabelErr),
				Output:  string(mklabelOutput),
			}, nil
		}
	}

	// Get current partition table to find free space
	startCmd := exec.Command("parted", req.Device, "-s", "unit", "MB", "print", "free")
	startOutput, startErr := startCmd.CombinedOutput()
	startOutputStr := string(startOutput)

	// Find free space start for new partition
	startMB := findFreeSpaceStart(startOutputStr)
	if startMB < 0 {
		// Provide detailed error message
		errMsg := fmt.Sprintf("no free space found on %s", req.Device)
		if startErr != nil {
			errMsg = fmt.Sprintf("failed to read partition table on %s: %v", req.Device, startErr)
		}
		return &OperationResult{
			Success: false,
			Message: errMsg,
			Output:  startOutputStr,
		}, nil
	}

	// Calculate end point
	var endPoint string
	if req.SizeMB == 0 {
		endPoint = "100%"
	} else {
		endPoint = fmt.Sprintf("%dMB", startMB+req.SizeMB)
	}

	// Determine partition type
	partType := "primary"
	if req.PartType != "" {
		partType = req.PartType
	}

	// Create partition
	createCmd := exec.Command("parted", req.Device, "-s", "--",
		"mkpart", partType, fmt.Sprintf("%dMB", startMB), endPoint)
	createOutput, err := createCmd.CombinedOutput()
	if err != nil {
		return &OperationResult{
			Success: false,
			Message: fmt.Sprintf("Failed to create partition: %v", err),
			Output:  string(createOutput),
		}, nil
	}

	return &OperationResult{
		Success: true,
		Message: "Partition created successfully",
		Output:  string(createOutput),
	}, nil
}

// FormatPartition formats a partition with the specified filesystem
func FormatPartition(req *FormatRequest) (*OperationResult, error) {
	// Validate device path
	if !isValidDevice(req.Device) {
		return nil, fmt.Errorf("invalid device path: %s", req.Device)
	}

	// Check if device is mounted
	mounts, _ := GetMounts()
	for _, m := range mounts {
		if m.Device == req.Device {
			if !req.Force {
				return &OperationResult{
					Success: false,
					Message: fmt.Sprintf("Device %s is mounted at %s. Use force option to format anyway.", req.Device, m.MountPoint),
				}, nil
			}
			// Unmount first
			unmountCmd := exec.Command("umount", req.Device)
			unmountCmd.Run()
		}
	}

	// Build mkfs command based on filesystem type
	var mkfsCmd *exec.Cmd
	switch req.FSType {
	case "ext4":
		args := []string{"-F"}
		if req.Label != "" {
			args = append(args, "-L", req.Label)
		}
		args = append(args, req.Device)
		mkfsCmd = exec.Command("mkfs.ext4", args...)
	case "xfs":
		args := []string{"-f"}
		if req.Label != "" {
			args = append(args, "-L", req.Label)
		}
		args = append(args, req.Device)
		mkfsCmd = exec.Command("mkfs.xfs", args...)
	case "swap":
		args := []string{}
		if req.Label != "" {
			args = append(args, "-L", req.Label)
		}
		args = append(args, req.Device)
		mkfsCmd = exec.Command("mkswap", args...)
	case "vfat", "fat32":
		args := []string{}
		if req.Label != "" {
			args = append(args, "-n", req.Label)
		}
		args = append(args, req.Device)
		mkfsCmd = exec.Command("mkfs.vfat", args...)
	default:
		return nil, fmt.Errorf("unsupported filesystem type: %s", req.FSType)
	}

	output, err := mkfsCmd.CombinedOutput()
	if err != nil {
		return &OperationResult{
			Success: false,
			Message: fmt.Sprintf("Failed to format partition: %v", err),
			Output:  string(output),
		}, nil
	}

	return &OperationResult{
		Success: true,
		Message: fmt.Sprintf("Partition formatted as %s successfully", req.FSType),
		Output:  string(output),
	}, nil
}

// DeletePartition deletes a partition from a disk
func DeletePartition(req *DeletePartitionRequest) (*OperationResult, error) {
	// Validate device path
	if !isValidDevice(req.Device) {
		return nil, fmt.Errorf("invalid device path: %s", req.Device)
	}

	if req.Partition < 1 {
		return nil, fmt.Errorf("invalid partition number: %d", req.Partition)
	}

	// Build the partition device path
	partDevice := fmt.Sprintf("%s%d", req.Device, req.Partition)
	// Handle nvme devices (e.g., /dev/nvme0n1p1)
	if strings.Contains(req.Device, "nvme") || strings.Contains(req.Device, "loop") {
		partDevice = fmt.Sprintf("%sp%d", req.Device, req.Partition)
	}

	// Check if partition is mounted
	mounts, _ := GetMounts()
	for _, m := range mounts {
		if m.Device == partDevice {
			// Unmount first
			unmountCmd := exec.Command("umount", partDevice)
			unmountCmd.Run()
		}
	}

	// Delete partition using parted
	cmd := exec.Command("parted", req.Device, "-s", "rm", fmt.Sprintf("%d", req.Partition))
	output, err := cmd.CombinedOutput()
	if err != nil {
		return &OperationResult{
			Success: false,
			Message: fmt.Sprintf("Failed to delete partition: %v", err),
			Output:  string(output),
		}, nil
	}

	return &OperationResult{
		Success: true,
		Message: fmt.Sprintf("Partition %d deleted successfully", req.Partition),
		Output:  string(output),
	}, nil
}

// MountFilesystem mounts a filesystem
func MountFilesystem(req *MountRequest) (*OperationResult, error) {
	// Validate device path
	if !isValidDevice(req.Device) {
		return nil, fmt.Errorf("invalid device path: %s", req.Device)
	}

	// Create mount point if it doesn't exist
	mkdirCmd := exec.Command("mkdir", "-p", req.MountPoint)
	if err := mkdirCmd.Run(); err != nil {
		return &OperationResult{
			Success: false,
			Message: fmt.Sprintf("Failed to create mount point: %v", err),
		}, nil
	}

	// Build mount command
	args := []string{}
	if req.FSType != "" {
		args = append(args, "-t", req.FSType)
	}
	if req.Options != "" {
		args = append(args, "-o", req.Options)
	}
	args = append(args, req.Device, req.MountPoint)

	cmd := exec.Command("mount", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return &OperationResult{
			Success: false,
			Message: fmt.Sprintf("Failed to mount: %v", err),
			Output:  string(output),
		}, nil
	}

	return &OperationResult{
		Success: true,
		Message: fmt.Sprintf("Mounted %s at %s", req.Device, req.MountPoint),
		Output:  string(output),
	}, nil
}

// UnmountFilesystem unmounts a filesystem
func UnmountFilesystem(mountPoint string) (*OperationResult, error) {
	cmd := exec.Command("umount", mountPoint)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return &OperationResult{
			Success: false,
			Message: fmt.Sprintf("Failed to unmount: %v", err),
			Output:  string(output),
		}, nil
	}

	return &OperationResult{
		Success: true,
		Message: fmt.Sprintf("Unmounted %s", mountPoint),
		Output:  string(output),
	}, nil
}

// isValidDevice checks if a device path is valid and safe
func isValidDevice(device string) bool {
	// Must start with /dev/
	if !strings.HasPrefix(device, "/dev/") {
		return false
	}

	// No path traversal
	if strings.Contains(device, "..") {
		return false
	}

	// Only allow specific device types
	validPrefixes := []string{
		"/dev/sd",    // SATA/SAS drives
		"/dev/nvme",  // NVMe drives
		"/dev/vd",    // VirtIO drives
		"/dev/xvd",   // Xen virtual drives
		"/dev/hd",    // IDE drives
		"/dev/loop",  // Loop devices (for testing)
		"/dev/dm-",   // Device mapper
		"/dev/mapper/", // LVM
	}

	for _, prefix := range validPrefixes {
		if strings.HasPrefix(device, prefix) {
			return true
		}
	}

	return false
}

// findFreeSpaceStart parses parted output to find the start of free space
// Returns the start position in MB, or -1 if no free space found
func findFreeSpaceStart(output string) int64 {
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.Contains(line, "Free Space") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				// Parse start value (e.g., "0.02MB" or "1024MB")
				startStr := strings.TrimSuffix(fields[0], "MB")
				startStr = strings.TrimSuffix(startStr, "GB")
				// Use ParseFloat to handle decimal values like "0.02"
				start, err := strconv.ParseFloat(startStr, 64)
				if err == nil {
					// Round up to nearest MB to avoid alignment issues
					return int64(start) + 1
				}
			}
		}
	}
	return -1
}
