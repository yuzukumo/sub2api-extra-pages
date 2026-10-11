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
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" || token == r.Header.Get("Authorization") {
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
			"api_types":    []string{"chat_completions"},
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

func (s *Server) proxy(w http.ResponseWriter, r *http.Request) {
	s.proxyToBifrost(w, r, "/cursor/v1/chat/completions")
}

func (s *Server) proxyResponses(w http.ResponseWriter, r *http.Request) {
	s.proxyToBifrost(w, r, "/v1/responses")
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
	var reasoning map[string]json.RawMessage
	if raw, ok := body["reasoning"]; ok {
		if err := json.Unmarshal(raw, &reasoning); err != nil {
			fail(w, problem(400, "invalid_effort", "Invalid reasoning settings"))
			return
		}
	}
	if reasoning == nil {
		reasoning = map[string]json.RawMessage{}
	}
	var effort string
	if raw, ok := reasoning["effort"]; ok {
		if err := json.Unmarshal(raw, &effort); err != nil {
			fail(w, problem(400, "invalid_effort", "Invalid reasoning effort"))
			return
		}
	}
	if raw, ok := body["reasoning_effort"]; ok {
		var chatEffort string
		if err := json.Unmarshal(raw, &chatEffort); err != nil {
			fail(w, problem(400, "invalid_effort", "Invalid reasoning effort"))
			return
		}
		if effort != "" && effort != chatEffort {
			fail(w, problem(400, "invalid_effort", "Conflicting reasoning efforts"))
			return
		}
		effort = chatEffort
		delete(body, "reasoning_effort")
	}
	if effort != "" && !slices.Contains(m.Efforts, effort) {
		fail(w, problem(400, "invalid_effort", "This reasoning level is not supported by the model"))
		return
	}
	if effort == "" && m.Provider == "sub-openai" {
		effort = "xhigh"
	}
	if effort != "" {
		reasoning["effort"], _ = json.Marshal(effort)
	}
	if len(reasoning) > 0 {
		body["reasoning"], _ = json.Marshal(reasoning)
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
