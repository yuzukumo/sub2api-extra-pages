package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"
)

func (s *Server) inferenceAccount(r *http.Request) (Account, error) {
	authorization := r.Header.Get("Authorization")
	token := strings.TrimPrefix(authorization, "Bearer ")
	if authorization == "" && (r.URL.Path == "/v1/messages" || r.URL.Path == "/messages") {
		token = r.Header.Get("x-api-key")
	} else if token == authorization {
		token = ""
	}
	if token == "" {
		return Account{}, problem(401, "unauthorized", "A gateway key is required")
	}
	s.work.Lock()
	defer s.work.Unlock()
	for _, a := range s.store.snapshot().Accounts {
		if a.GatewayKey == "" || hashToken(token) != hashToken(a.GatewayKey) {
			continue
		}
		if time.Since(a.SyncedAt) > 30*time.Second {
			updated, err := s.identity(r.Context(), a)
			if err != nil {
				return a, err
			}
			updated, err = s.clients.sync(r.Context(), updated)
			if err != nil {
				return a, err
			}
			if err := s.store.save(&updated); err != nil {
				return a, err
			}
			a = updated
		}
		return a, nil
	}
	return Account{}, problem(401, "unauthorized", "Invalid gateway key")
}

func (s *Server) listModels(w http.ResponseWriter, r *http.Request) {
	a, err := s.inferenceAccount(r)
	if err != nil {
		fail(w, err)
		return
	}
	items := []map[string]any{}
	for _, m := range s.catalog.models(r.Context(), a, s.config.LimitContextToFirstTier) {
		apiType := "responses"
		if m.Provider == "sub-claude" {
			apiType = "anthropic_messages"
		}
		capabilities := map[string]any{
			"output_modalities":  []string{"text"},
			"supports_tool_use":  true,
			"supports_streaming": true,
			"supports_reasoning": len(m.Efforts) > 0,
			"supports_vision":    m.SupportsVision,
			"reasoning_effort":   m.Efforts,
		}
		item := map[string]any{
			"id":           m.ID,
			"object":       "model",
			"owned_by":     strings.TrimPrefix(m.Provider, "sub-"),
			"api_types":    []string{apiType},
			"capabilities": capabilities,
		}
		if m.ContextWindow > 0 {
			item["context_window"] = m.ContextWindow
			capabilities["context_length"] = m.ContextWindow
		}
		if m.MaxOutputTokens > 0 {
			capabilities["max_output_tokens"] = m.MaxOutputTokens
		}
		if len(m.Efforts) > 0 {
			item["thinking"] = map[string]any{"levels": m.Efforts}
		}
		items = append(items, item)
	}
	respond(w, 200, map[string]any{"object": "list", "data": items})
}

func (s *Server) proxyResponses(w http.ResponseWriter, r *http.Request) {
	s.proxyToBifrost(w, r, "/v1/responses")
}

func (s *Server) proxyMessages(w http.ResponseWriter, r *http.Request) {
	s.proxyToBifrost(w, r, "/anthropic/v1/messages")
}

func (s *Server) proxyToBifrost(w http.ResponseWriter, r *http.Request, upstreamPath string) {
	a, err := s.inferenceAccount(r)
	if err != nil {
		fail(w, err)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<20)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		fail(w, problem(413, "request_too_large", "Request body is too large"))
		return
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(data, &body); err != nil {
		fail(w, problem(400, "invalid_request", "Invalid request body"))
		return
	}
	var model string
	if err := json.Unmarshal(body["model"], &model); err != nil {
		fail(w, problem(400, "invalid_model", "A model name is required"))
		return
	}
	models := s.catalog.models(r.Context(), a, s.config.LimitContextToFirstTier)
	index := slices.IndexFunc(models, func(m Model) bool { return m.ID == model })
	if index < 0 {
		fail(w, problem(403, "model_blocked", "This model is not available for your key"))
		return
	}
	m := models[index]
	settingsField := "reasoning"
	if upstreamPath == "/anthropic/v1/messages" {
		settingsField = "output_config"
	}
	var settings map[string]json.RawMessage
	if raw, ok := body[settingsField]; ok {
		if err := json.Unmarshal(raw, &settings); err != nil {
			fail(w, problem(400, "invalid_effort", "Invalid reasoning settings"))
			return
		}
	}
	if settings == nil {
		settings = map[string]json.RawMessage{}
	}
	var effort string
	if raw, ok := settings["effort"]; ok {
		if err := json.Unmarshal(raw, &effort); err != nil {
			fail(w, problem(400, "invalid_effort", "Invalid reasoning effort"))
			return
		}
	}
	if effort != "" && !slices.Contains(m.Efforts, effort) {
		fail(w, problem(400, "invalid_effort", "This reasoning level is not supported by the model"))
		return
	}
	if effort == "" && m.Provider == "sub-openai" && settingsField == "reasoning" {
		effort = "xhigh"
	}
	if effort != "" {
		settings["effort"], _ = json.Marshal(effort)
	}
	if len(settings) > 0 {
		body[settingsField], _ = json.Marshal(settings)
	}
	if m.Provider == "sub-openai" && upstreamPath == "/v1/responses" {
		delete(body, "extra_params")
		if err := prepareOpenAICache(body, r.Header, a.User.ID, model); err != nil {
			fail(w, err)
			return
		}
	}
	body["model"], _ = json.Marshal(m.Provider + "/" + model)
	delete(body, "fallbacks")
	delete(body, "provider")
	delete(body, "api_key")
	data, err = json.Marshal(body)
	if err != nil {
		fail(w, err)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), "POST", s.config.BifrostURL+upstreamPath, bytes.NewReader(data))
	if err != nil {
		fail(w, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", r.Header.Get("Accept"))
	if userAgent := r.Header.Get("User-Agent"); userAgent != "" {
		req.Header.Set("User-Agent", userAgent)
		req.Header.Set("x-bf-eh-user-agent", userAgent)
	}
	if m.Provider == "sub-openai" && upstreamPath == "/v1/responses" {
		req.Header.Set("x-bf-passthrough-extra-params", "true")
		for _, name := range []string{"session-id", "session_id", "conversation_id", "x-session-affinity", "x-session-id", "x-opencode-session", "x-conversation-id"} {
			if value := r.Header.Get(name); value != "" {
				req.Header.Set("x-bf-eh-"+name, value)
			}
		}
	}
	if upstreamPath == "/anthropic/v1/messages" {
		for _, name := range []string{"anthropic-version", "anthropic-beta"} {
			for _, value := range r.Header.Values(name) {
				req.Header.Add(name, value)
			}
		}
	}
	req.Header.Set("x-bf-vk", a.VirtualKey)
	req.SetBasicAuth(s.config.BifrostUsername, s.config.BifrostPassword)
	client := &http.Client{Transport: s.clients.http.Transport, CheckRedirect: s.clients.http.CheckRedirect}
	resp, err := client.Do(req)
	if err != nil {
		fail(w, problem(502, "upstream_unavailable", "Unable to reach model gateway"))
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(resp.StatusCode)
	buffer := make([]byte, 32<<10)
	for {
		n, err := resp.Body.Read(buffer)
		if n > 0 {
			if _, writeErr := w.Write(buffer[:n]); writeErr != nil {
				return
			}
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
		}
		if err != nil {
			return
		}
	}
}
