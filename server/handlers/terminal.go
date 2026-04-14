package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"

	"newshell-server/services"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		return u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "tauri.localhost"
	},
}

type wsMessage struct {
	Type     string `json:"type"`
	Data     string `json:"data,omitempty"`
	Cols     int    `json:"cols,omitempty"`
	Rows     int    `json:"rows,omitempty"`
	Host     string `json:"host,omitempty"`
	Port     int    `json:"port,omitempty"`
	Username string `json:"username,omitempty"`
	AuthType string `json:"auth_type,omitempty"`
	Password string `json:"password,omitempty"`
	PrivKey  string `json:"private_key,omitempty"`
	Passph   string `json:"passphrase,omitempty"`
}

func sendWS(ws *websocket.Conn, msg wsMessage) {
	data, _ := json.Marshal(msg)
	ws.WriteMessage(websocket.TextMessage, data)
}

func TerminalWS(c *gin.Context) {
	connID := c.Param("id")

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	// Wait for the frontend to send connection details
	var session *services.SSHSession

	// First message must be "connect"
	_, raw, err := ws.ReadMessage()
	if err != nil {
		return
	}

	var initMsg wsMessage
	if err := json.Unmarshal(raw, &initMsg); err != nil {
		sendWS(ws, wsMessage{Type: "error", Data: "Invalid message format"})
		return
	}

	if initMsg.Type != "connect" {
		sendWS(ws, wsMessage{Type: "error", Data: "First message must be type 'connect'"})
		return
	}

	details := services.ConnDetails{
		Host:       initMsg.Host,
		Port:       initMsg.Port,
		Username:   initMsg.Username,
		AuthType:   initMsg.AuthType,
		Password:   initMsg.Password,
		PrivateKey: initMsg.PrivKey,
		Passphrase: initMsg.Passph,
	}

	session, err = services.ConnectWithDetails(connID, details)
	if err != nil {
		sendWS(ws, wsMessage{Type: "error", Data: fmt.Sprintf("SSH connect failed: %v", err)})
		return
	}

	sendWS(ws, wsMessage{Type: "connected"})

	// Read from SSH stdout -> write to WebSocket
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, err := session.Stdout.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("SSH stdout read error: %v", err)
				}
				return
			}
			if n > 0 {
				sendWS(ws, wsMessage{Type: "output", Data: string(buf[:n])})
			}
		}
	}()

	// Read from SSH stderr -> write to WebSocket
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, err := session.Stderr.Read(buf)
			if err != nil {
				return
			}
			if n > 0 {
				sendWS(ws, wsMessage{Type: "output", Data: string(buf[:n])})
			}
		}
	}()

	// Read from WebSocket -> write to SSH stdin
	for {
		_, raw, err := ws.ReadMessage()
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			services.CloseSession(connID)
			return
		}

		var msg wsMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "input":
			if _, err := session.Stdin.Write([]byte(msg.Data)); err != nil {
				log.Printf("SSH stdin write error: %v", err)
				return
			}
		case "resize":
			if msg.Cols > 0 && msg.Rows > 0 {
				services.ResizePTY(connID, msg.Cols, msg.Rows)
			}
		}
	}
}
