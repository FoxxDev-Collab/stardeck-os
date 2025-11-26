package system

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// NetworkInterface represents a network interface
type NetworkInterface struct {
	Name       string   `json:"name"`
	State      string   `json:"state"`      // up, down, unknown
	MAC        string   `json:"mac"`
	MTU        int      `json:"mtu"`
	Speed      int      `json:"speed"`      // Mbps, -1 if unknown
	Type       string   `json:"type"`       // ethernet, loopback, bridge, bond, virtual, wireless
	IPv4       []string `json:"ipv4"`
	IPv6       []string `json:"ipv6"`
	Driver     string   `json:"driver"`
	IsPhysical bool     `json:"is_physical"`
}

// InterfaceStats represents traffic statistics for an interface
type InterfaceStats struct {
	Name      string `json:"name"`
	RxBytes   uint64 `json:"rx_bytes"`
	TxBytes   uint64 `json:"tx_bytes"`
	RxPackets uint64 `json:"rx_packets"`
	TxPackets uint64 `json:"tx_packets"`
	RxErrors  uint64 `json:"rx_errors"`
	TxErrors  uint64 `json:"tx_errors"`
	RxDropped uint64 `json:"rx_dropped"`
	TxDropped uint64 `json:"tx_dropped"`
}

// Route represents a routing table entry
type Route struct {
	Destination string `json:"destination"`
	Gateway     string `json:"gateway"`
	Genmask     string `json:"genmask"`
	Flags       string `json:"flags"`
	Metric      int    `json:"metric"`
	Interface   string `json:"interface"`
	Protocol    string `json:"protocol"`
	Scope       string `json:"scope"`
}

// DNSConfig represents DNS configuration
type DNSConfig struct {
	Hostname    string   `json:"hostname"`
	FQDN        string   `json:"fqdn"`
	Nameservers []string `json:"nameservers"`
	Search      []string `json:"search"`
	ResolvConf  string   `json:"resolv_conf"`
}

// Connection represents an active network connection
type Connection struct {
	Protocol   string `json:"protocol"`    // tcp, udp, tcp6, udp6
	LocalAddr  string `json:"local_addr"`
	LocalPort  int    `json:"local_port"`
	RemoteAddr string `json:"remote_addr"`
	RemotePort int    `json:"remote_port"`
	State      string `json:"state"`       // ESTABLISHED, LISTEN, TIME_WAIT, etc.
	PID        int    `json:"pid"`
	Process    string `json:"process"`
}

// FirewallZone represents a firewalld zone
type FirewallZone struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Target       string   `json:"target"`
	Interfaces   []string `json:"interfaces"`
	Sources      []string `json:"sources"`
	Services     []string `json:"services"`
	Ports        []string `json:"ports"`       // format: "port/protocol"
	Protocols    []string `json:"protocols"`
	Masquerade   bool     `json:"masquerade"`
	ForwardPorts []string `json:"forward_ports"`
	RichRules    []string `json:"rich_rules"`
	ICMPBlocks   []string `json:"icmp_blocks"`
	IsDefault    bool     `json:"is_default"`
	IsActive     bool     `json:"is_active"`
}

// FirewallStatus represents the firewall status
type FirewallStatus struct {
	Running     bool   `json:"running"`
	DefaultZone string `json:"default_zone"`
	Version     string `json:"version"`
}

// PortRule represents a port rule for firewall
type PortRule struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"` // tcp, udp
}

// ServiceRule represents a service rule for firewall
type ServiceRule struct {
	Service string `json:"service"`
}

// RichRule represents a rich rule for firewall
type RichRule struct {
	Rule string `json:"rule"`
}

// AddRouteRequest represents a request to add a route
type AddRouteRequest struct {
	Destination string `json:"destination"` // e.g., "10.0.0.0/8"
	Gateway     string `json:"gateway"`
	Interface   string `json:"interface"`
	Metric      int    `json:"metric"`
}

// GetNetworkInterfaces returns all network interfaces
func GetNetworkInterfaces() ([]NetworkInterface, error) {
	interfaces := []NetworkInterface{}

	// Read from /sys/class/net/
	entries, err := os.ReadDir("/sys/class/net")
	if err != nil {
		return nil, fmt.Errorf("failed to read /sys/class/net: %w", err)
	}

	for _, entry := range entries {
		name := entry.Name()
		iface := NetworkInterface{
			Name:   name,
			IPv4:   []string{},
			IPv6:   []string{},
			Speed:  -1,
		}

		basePath := filepath.Join("/sys/class/net", name)

		// Get state (operstate)
		if data, err := os.ReadFile(filepath.Join(basePath, "operstate")); err == nil {
			iface.State = strings.TrimSpace(string(data))
		}

		// Get MAC address
		if data, err := os.ReadFile(filepath.Join(basePath, "address")); err == nil {
			iface.MAC = strings.TrimSpace(string(data))
		}

		// Get MTU
		if data, err := os.ReadFile(filepath.Join(basePath, "mtu")); err == nil {
			if mtu, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil {
				iface.MTU = mtu
			}
		}

		// Get speed (only for physical interfaces that are up)
		if data, err := os.ReadFile(filepath.Join(basePath, "speed")); err == nil {
			if speed, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && speed > 0 {
				iface.Speed = speed
			}
		}

		// Determine interface type
		iface.Type = getInterfaceType(name, basePath)
		iface.IsPhysical = isPhysicalInterface(basePath)

		// Get driver
		if link, err := os.Readlink(filepath.Join(basePath, "device/driver")); err == nil {
			iface.Driver = filepath.Base(link)
		}

		// Get IP addresses using net package
		if netIface, err := net.InterfaceByName(name); err == nil {
			if addrs, err := netIface.Addrs(); err == nil {
				for _, addr := range addrs {
					addrStr := addr.String()
					if strings.Contains(addrStr, ":") {
						iface.IPv6 = append(iface.IPv6, addrStr)
					} else {
						iface.IPv4 = append(iface.IPv4, addrStr)
					}
				}
			}
		}

		interfaces = append(interfaces, iface)
	}

	return interfaces, nil
}

// getInterfaceType determines the type of network interface
func getInterfaceType(name, basePath string) string {
	// Check for loopback
	if name == "lo" {
		return "loopback"
	}

	// Check for bridge
	if _, err := os.Stat(filepath.Join(basePath, "bridge")); err == nil {
		return "bridge"
	}

	// Check for bond
	if _, err := os.Stat(filepath.Join(basePath, "bonding")); err == nil {
		return "bond"
	}

	// Check for wireless
	if _, err := os.Stat(filepath.Join(basePath, "wireless")); err == nil {
		return "wireless"
	}
	if _, err := os.Stat(filepath.Join(basePath, "phy80211")); err == nil {
		return "wireless"
	}

	// Check for virtual interfaces
	if strings.HasPrefix(name, "veth") || strings.HasPrefix(name, "docker") ||
		strings.HasPrefix(name, "virbr") || strings.HasPrefix(name, "vnet") ||
		strings.HasPrefix(name, "tun") || strings.HasPrefix(name, "tap") {
		return "virtual"
	}

	// Default to ethernet
	return "ethernet"
}

// isPhysicalInterface checks if interface is physical
func isPhysicalInterface(basePath string) bool {
	// Physical interfaces have a device symlink pointing to PCI
	devicePath := filepath.Join(basePath, "device")
	if link, err := os.Readlink(devicePath); err == nil {
		return strings.Contains(link, "pci")
	}
	return false
}

// GetInterfaceByName returns a specific interface by name
func GetInterfaceByName(name string) (*NetworkInterface, error) {
	interfaces, err := GetNetworkInterfaces()
	if err != nil {
		return nil, err
	}

	for _, iface := range interfaces {
		if iface.Name == name {
			return &iface, nil
		}
	}

	return nil, fmt.Errorf("interface %s not found", name)
}

// GetInterfaceStats returns traffic statistics for an interface
func GetInterfaceStats(name string) (*InterfaceStats, error) {
	basePath := filepath.Join("/sys/class/net", name, "statistics")

	stats := &InterfaceStats{Name: name}

	// Read each statistic
	readStat := func(filename string) uint64 {
		data, err := os.ReadFile(filepath.Join(basePath, filename))
		if err != nil {
			return 0
		}
		val, _ := strconv.ParseUint(strings.TrimSpace(string(data)), 10, 64)
		return val
	}

	stats.RxBytes = readStat("rx_bytes")
	stats.TxBytes = readStat("tx_bytes")
	stats.RxPackets = readStat("rx_packets")
	stats.TxPackets = readStat("tx_packets")
	stats.RxErrors = readStat("rx_errors")
	stats.TxErrors = readStat("tx_errors")
	stats.RxDropped = readStat("rx_dropped")
	stats.TxDropped = readStat("tx_dropped")

	return stats, nil
}

// SetInterfaceState sets the interface state (up/down)
func SetInterfaceState(name string, up bool) error {
	action := "down"
	if up {
		action = "up"
	}

	cmd := exec.Command("ip", "link", "set", name, action)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to set interface %s %s: %s", name, action, string(output))
	}

	return nil
}

// GetRoutes returns the routing table
func GetRoutes() ([]Route, error) {
	routes := []Route{}

	cmd := exec.Command("ip", "-4", "route", "show")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get routes: %w", err)
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		route := parseRoute(line)
		if route != nil {
			routes = append(routes, *route)
		}
	}

	return routes, nil
}

// parseRoute parses a single route line from ip route output
func parseRoute(line string) *Route {
	fields := strings.Fields(line)
	if len(fields) < 1 {
		return nil
	}

	route := &Route{
		Destination: fields[0],
		Gateway:     "",
		Genmask:     "",
		Flags:       "",
		Metric:      0,
		Interface:   "",
		Protocol:    "boot",
		Scope:       "link",
	}

	for i := 0; i < len(fields); i++ {
		switch fields[i] {
		case "via":
			if i+1 < len(fields) {
				route.Gateway = fields[i+1]
				i++
			}
		case "dev":
			if i+1 < len(fields) {
				route.Interface = fields[i+1]
				i++
			}
		case "metric":
			if i+1 < len(fields) {
				route.Metric, _ = strconv.Atoi(fields[i+1])
				i++
			}
		case "proto":
			if i+1 < len(fields) {
				route.Protocol = fields[i+1]
				i++
			}
		case "scope":
			if i+1 < len(fields) {
				route.Scope = fields[i+1]
				i++
			}
		}
	}

	return route
}

// AddRoute adds a static route
func AddRoute(req *AddRouteRequest) error {
	args := []string{"route", "add", req.Destination}

	if req.Gateway != "" {
		args = append(args, "via", req.Gateway)
	}
	if req.Interface != "" {
		args = append(args, "dev", req.Interface)
	}
	if req.Metric > 0 {
		args = append(args, "metric", strconv.Itoa(req.Metric))
	}

	cmd := exec.Command("ip", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to add route: %s", string(output))
	}

	return nil
}

// DeleteRoute removes a route
func DeleteRoute(destination string) error {
	cmd := exec.Command("ip", "route", "del", destination)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to delete route: %s", string(output))
	}

	return nil
}

// GetDNSConfig returns DNS configuration
func GetDNSConfig() (*DNSConfig, error) {
	config := &DNSConfig{
		Nameservers: []string{},
		Search:      []string{},
	}

	// Get hostname
	if hostname, err := os.Hostname(); err == nil {
		config.Hostname = hostname
	}

	// Get FQDN
	cmd := exec.Command("hostname", "-f")
	if output, err := cmd.Output(); err == nil {
		config.FQDN = strings.TrimSpace(string(output))
	}

	// Read /etc/resolv.conf
	data, err := os.ReadFile("/etc/resolv.conf")
	if err != nil {
		return config, nil // Return what we have
	}

	config.ResolvConf = string(data)

	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		switch fields[0] {
		case "nameserver":
			config.Nameservers = append(config.Nameservers, fields[1])
		case "search":
			config.Search = append(config.Search, fields[1:]...)
		}
	}

	return config, nil
}

// GetConnections returns active network connections
func GetConnections(protocol string, state string) ([]Connection, error) {
	connections := []Connection{}

	// Use ss command for better performance
	args := []string{"-n"}

	// Add protocol filter
	switch protocol {
	case "tcp":
		args = append(args, "-t")
	case "udp":
		args = append(args, "-u")
	case "tcp6":
		args = append(args, "-t", "-6")
	case "udp6":
		args = append(args, "-u", "-6")
	default:
		args = append(args, "-t", "-u") // Both TCP and UDP
	}

	// Add state filter
	if state != "" {
		args = append(args, "state", state)
	} else {
		args = append(args, "-a") // All states
	}

	// Add process info
	args = append(args, "-p")

	cmd := exec.Command("ss", args...)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get connections: %w", err)
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	// Skip header
	scanner.Scan()

	for scanner.Scan() {
		line := scanner.Text()
		conn := parseConnection(line)
		if conn != nil {
			connections = append(connections, *conn)
		}
	}

	return connections, nil
}

// parseConnection parses a connection line from ss output
func parseConnection(line string) *Connection {
	fields := strings.Fields(line)
	if len(fields) < 5 {
		return nil
	}

	conn := &Connection{
		Protocol: strings.ToLower(fields[0]),
		State:    fields[1],
	}

	// Parse local address
	localParts := splitHostPort(fields[4])
	conn.LocalAddr = localParts[0]
	conn.LocalPort, _ = strconv.Atoi(localParts[1])

	// Parse remote address (if exists)
	if len(fields) > 5 {
		remoteParts := splitHostPort(fields[5])
		conn.RemoteAddr = remoteParts[0]
		conn.RemotePort, _ = strconv.Atoi(remoteParts[1])
	}

	// Parse process info (if exists)
	for _, field := range fields {
		if strings.HasPrefix(field, "users:") {
			// Extract PID and process name from format like users:(("nginx",pid=1234,fd=5))
			if pidIdx := strings.Index(field, "pid="); pidIdx != -1 {
				pidStr := field[pidIdx+4:]
				if commaIdx := strings.Index(pidStr, ","); commaIdx != -1 {
					pidStr = pidStr[:commaIdx]
				}
				conn.PID, _ = strconv.Atoi(pidStr)
			}
			// Extract process name
			if nameStart := strings.Index(field, "((\""); nameStart != -1 {
				nameEnd := strings.Index(field[nameStart+3:], "\"")
				if nameEnd != -1 {
					conn.Process = field[nameStart+3 : nameStart+3+nameEnd]
				}
			}
		}
	}

	return conn
}

// splitHostPort splits address:port or [ipv6]:port
func splitHostPort(addr string) []string {
	lastColon := strings.LastIndex(addr, ":")
	if lastColon == -1 {
		return []string{addr, ""}
	}

	// Handle IPv6 addresses
	if strings.Contains(addr, "[") {
		bracketEnd := strings.Index(addr, "]")
		if bracketEnd != -1 && bracketEnd < lastColon {
			return []string{addr[1:bracketEnd], addr[lastColon+1:]}
		}
	}

	return []string{addr[:lastColon], addr[lastColon+1:]}
}

// GetFirewallStatus returns the firewall status
func GetFirewallStatus() (*FirewallStatus, error) {
	status := &FirewallStatus{}

	// Check if firewalld is running
	cmd := exec.Command("firewall-cmd", "--state")
	output, err := cmd.Output()
	if err != nil {
		status.Running = false
		return status, nil
	}
	status.Running = strings.TrimSpace(string(output)) == "running"

	// Get default zone
	cmd = exec.Command("firewall-cmd", "--get-default-zone")
	if output, err := cmd.Output(); err == nil {
		status.DefaultZone = strings.TrimSpace(string(output))
	}

	// Get version
	cmd = exec.Command("firewall-cmd", "--version")
	if output, err := cmd.Output(); err == nil {
		status.Version = strings.TrimSpace(string(output))
	}

	return status, nil
}

// GetFirewallZones returns all firewall zones
func GetFirewallZones() ([]FirewallZone, error) {
	zones := []FirewallZone{}

	// Get list of zones
	cmd := exec.Command("firewall-cmd", "--get-zones")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get zones: %w", err)
	}

	zoneNames := strings.Fields(string(output))

	// Get default zone
	defaultZone := ""
	cmd = exec.Command("firewall-cmd", "--get-default-zone")
	if output, err := cmd.Output(); err == nil {
		defaultZone = strings.TrimSpace(string(output))
	}

	// Get active zones
	activeZones := map[string]bool{}
	cmd = exec.Command("firewall-cmd", "--get-active-zones")
	if output, err := cmd.Output(); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(output)))
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t") && line != "" {
				activeZones[line] = true
			}
		}
	}

	for _, zoneName := range zoneNames {
		zone, err := GetFirewallZone(zoneName)
		if err != nil {
			continue
		}
		zone.IsDefault = zoneName == defaultZone
		zone.IsActive = activeZones[zoneName]
		zones = append(zones, *zone)
	}

	return zones, nil
}

// GetFirewallZone returns details of a specific zone
func GetFirewallZone(name string) (*FirewallZone, error) {
	zone := &FirewallZone{
		Name:         name,
		Interfaces:   []string{},
		Sources:      []string{},
		Services:     []string{},
		Ports:        []string{},
		Protocols:    []string{},
		ForwardPorts: []string{},
		RichRules:    []string{},
		ICMPBlocks:   []string{},
	}

	// Get zone info using --list-all
	cmd := exec.Command("firewall-cmd", "--zone="+name, "--list-all")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get zone %s: %w", name, err)
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		parseZoneLine(line, zone)
	}

	return zone, nil
}

// parseZoneLine parses a line from firewall-cmd --list-all output
func parseZoneLine(line string, zone *FirewallZone) {
	if strings.HasPrefix(line, "target:") {
		zone.Target = strings.TrimSpace(strings.TrimPrefix(line, "target:"))
	} else if strings.HasPrefix(line, "interfaces:") {
		value := strings.TrimSpace(strings.TrimPrefix(line, "interfaces:"))
		if value != "" {
			zone.Interfaces = strings.Fields(value)
		}
	} else if strings.HasPrefix(line, "sources:") {
		value := strings.TrimSpace(strings.TrimPrefix(line, "sources:"))
		if value != "" {
			zone.Sources = strings.Fields(value)
		}
	} else if strings.HasPrefix(line, "services:") {
		value := strings.TrimSpace(strings.TrimPrefix(line, "services:"))
		if value != "" {
			zone.Services = strings.Fields(value)
		}
	} else if strings.HasPrefix(line, "ports:") {
		value := strings.TrimSpace(strings.TrimPrefix(line, "ports:"))
		if value != "" {
			zone.Ports = strings.Fields(value)
		}
	} else if strings.HasPrefix(line, "protocols:") {
		value := strings.TrimSpace(strings.TrimPrefix(line, "protocols:"))
		if value != "" {
			zone.Protocols = strings.Fields(value)
		}
	} else if strings.HasPrefix(line, "masquerade:") {
		zone.Masquerade = strings.TrimSpace(strings.TrimPrefix(line, "masquerade:")) == "yes"
	} else if strings.HasPrefix(line, "forward-ports:") {
		value := strings.TrimSpace(strings.TrimPrefix(line, "forward-ports:"))
		if value != "" {
			zone.ForwardPorts = strings.Fields(value)
		}
	} else if strings.HasPrefix(line, "rich rules:") {
		// Rich rules can span multiple lines, handled separately
	} else if strings.HasPrefix(line, "icmp-blocks:") {
		value := strings.TrimSpace(strings.TrimPrefix(line, "icmp-blocks:"))
		if value != "" {
			zone.ICMPBlocks = strings.Fields(value)
		}
	}
}

// AddFirewallZone creates a new firewall zone
func AddFirewallZone(name string) error {
	cmd := exec.Command("firewall-cmd", "--permanent", "--new-zone="+name)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to create zone: %s", string(output))
	}
	return nil
}

// DeleteFirewallZone removes a firewall zone
func DeleteFirewallZone(name string) error {
	cmd := exec.Command("firewall-cmd", "--permanent", "--delete-zone="+name)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to delete zone: %s", string(output))
	}
	return nil
}

// AddFirewallService adds a service to a zone
func AddFirewallService(zone, service string, permanent bool) error {
	args := []string{"--zone=" + zone, "--add-service=" + service}
	if permanent {
		args = append(args, "--permanent")
	}

	cmd := exec.Command("firewall-cmd", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to add service: %s", string(output))
	}
	return nil
}

// RemoveFirewallService removes a service from a zone
func RemoveFirewallService(zone, service string, permanent bool) error {
	args := []string{"--zone=" + zone, "--remove-service=" + service}
	if permanent {
		args = append(args, "--permanent")
	}

	cmd := exec.Command("firewall-cmd", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to remove service: %s", string(output))
	}
	return nil
}

// AddFirewallPort adds a port to a zone
func AddFirewallPort(zone string, port int, protocol string, permanent bool) error {
	portSpec := fmt.Sprintf("%d/%s", port, protocol)
	args := []string{"--zone=" + zone, "--add-port=" + portSpec}
	if permanent {
		args = append(args, "--permanent")
	}

	cmd := exec.Command("firewall-cmd", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to add port: %s", string(output))
	}
	return nil
}

// RemoveFirewallPort removes a port from a zone
func RemoveFirewallPort(zone string, port int, protocol string, permanent bool) error {
	portSpec := fmt.Sprintf("%d/%s", port, protocol)
	args := []string{"--zone=" + zone, "--remove-port=" + portSpec}
	if permanent {
		args = append(args, "--permanent")
	}

	cmd := exec.Command("firewall-cmd", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to remove port: %s", string(output))
	}
	return nil
}

// AddFirewallRichRule adds a rich rule to a zone
func AddFirewallRichRule(zone, rule string, permanent bool) error {
	args := []string{"--zone=" + zone, "--add-rich-rule=" + rule}
	if permanent {
		args = append(args, "--permanent")
	}

	cmd := exec.Command("firewall-cmd", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to add rich rule: %s", string(output))
	}
	return nil
}

// RemoveFirewallRichRule removes a rich rule from a zone
func RemoveFirewallRichRule(zone, rule string, permanent bool) error {
	args := []string{"--zone=" + zone, "--remove-rich-rule=" + rule}
	if permanent {
		args = append(args, "--permanent")
	}

	cmd := exec.Command("firewall-cmd", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to remove rich rule: %s", string(output))
	}
	return nil
}

// ReloadFirewall reloads the firewall configuration
func ReloadFirewall() error {
	cmd := exec.Command("firewall-cmd", "--reload")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to reload firewall: %s", string(output))
	}
	return nil
}

// SetDefaultZone sets the default firewall zone
func SetDefaultZone(zone string) error {
	cmd := exec.Command("firewall-cmd", "--set-default-zone="+zone)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to set default zone: %s", string(output))
	}
	return nil
}

// GetAvailableServices returns list of available firewall services
func GetAvailableServices() ([]string, error) {
	cmd := exec.Command("firewall-cmd", "--get-services")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}
	return strings.Fields(string(output)), nil
}
