package api

import (
	"encoding/json"
	"io"
	"log"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
	"github.com/labstack/echo/v4"
	"golang.org/x/net/websocket"
)

// TerminalMessage represents a message sent to/from the terminal
type TerminalMessage struct {
	Type string `json:"type"` // "input", "resize"
	Data string `json:"data"`
	Rows uint16 `json:"rows,omitempty"`
	Cols uint16 `json:"cols,omitempty"`
}

// HandleTerminalWebSocket handles WebSocket connections for terminal sessions
func HandleTerminalWebSocket(c echo.Context) error {
	websocket.Handler(func(ws *websocket.Conn) {
		defer ws.Close()

		// Validate authentication from query parameter
		token := c.QueryParam("token")
		if token == "" {
			log.Println("Terminal WebSocket: No token provided")
			ws.Close()
			return
		}

		// Validate token
		user, _, err := authService.ValidateToken(token)
		if err != nil {
			log.Printf("Terminal WebSocket: Invalid token: %v", err)
			ws.Close()
			return
		}

		log.Printf("Terminal WebSocket: User %s connected", user.Username)

		// Determine which shell to use
		shell := os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}

		// Start the shell with PTY
		cmd := exec.Command(shell)
		cmd.Env = append(os.Environ(),
			"TERM=xterm-256color",
			"COLORTERM=truecolor",
		)

		// Create PTY
		ptmx, err := pty.Start(cmd)
		if err != nil {
			log.Printf("Failed to start PTY: %v", err)
			return
		}
		defer func() {
			ptmx.Close()
			cmd.Process.Kill()
			cmd.Wait()
		}()

		// Set initial size
		if err := pty.Setsize(ptmx, &pty.Winsize{Rows: 24, Cols: 80}); err != nil {
			log.Printf("Failed to set PTY size: %v", err)
		}

		var wg sync.WaitGroup
		wg.Add(2)

		// Read from PTY and send to WebSocket
		go func() {
			defer wg.Done()
			buf := make([]byte, 8192)
			for {
				n, err := ptmx.Read(buf)
				if err != nil {
					if err != io.EOF {
						log.Printf("PTY read error: %v", err)
					}
					return
				}
				if n > 0 {
					if err := websocket.Message.Send(ws, string(buf[:n])); err != nil {
						log.Printf("WebSocket send error: %v", err)
						return
					}
				}
			}
		}()

		// Read from WebSocket and write to PTY
		go func() {
			defer wg.Done()
			for {
				var msgStr string
				if err := websocket.Message.Receive(ws, &msgStr); err != nil {
					if err != io.EOF {
						log.Printf("WebSocket receive error: %v", err)
					}
					return
				}

				// Try to parse as JSON for resize events
				var msg TerminalMessage
				if err := json.Unmarshal([]byte(msgStr), &msg); err == nil {
					switch msg.Type {
					case "resize":
						if msg.Rows > 0 && msg.Cols > 0 {
							if err := pty.Setsize(ptmx, &pty.Winsize{
								Rows: msg.Rows,
								Cols: msg.Cols,
							}); err != nil {
								log.Printf("Failed to resize PTY: %v", err)
							}
						}
					case "input":
						if _, err := ptmx.Write([]byte(msg.Data)); err != nil {
							log.Printf("PTY write error: %v", err)
							return
						}
					}
				} else {
					// Raw string input (backwards compatibility)
					if _, err := ptmx.Write([]byte(msgStr)); err != nil {
						log.Printf("PTY write error: %v", err)
						return
					}
				}
			}
		}()

		wg.Wait()
	}).ServeHTTP(c.Response(), c.Request())

	return nil
}
