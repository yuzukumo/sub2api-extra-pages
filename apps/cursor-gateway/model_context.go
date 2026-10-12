package main

import (
	"context"
	"log/slog"
	"net/http"
	"slices"
	"time"
)

func (s *Server) updateModelContext(w http.ResponseWriter, r *http.Request) {
	s.work.Lock()
	defer s.work.Unlock()
	a, err := s.authenticate(r)
	if err != nil {
		fail(w, err)
		return
	}
	var input struct {
		Model         string `json:"model"`
		ContextWindow *int   `json:"context_window"`
	}
	if err := decode(w, r, &input); err != nil {
		fail(w, err)
		return
	}
	if !slices.ContainsFunc(a.Bindings, func(b Binding) bool { return slices.Contains(b.Models, input.Model) }) {
		fail(w, problem(403, "model_blocked", "This model is not available for your account"))
		return
	}
	if input.ContextWindow != nil && (*input.ContextWindow <= 0 || int64(*input.ContextWindow) > 9007199254740991) {
		fail(w, problem(400, "invalid_context_window", "Context window must be a positive safe integer"))
		return
	}
	if a.ContextOverrides == nil {
		a.ContextOverrides = map[string]ModelContextOverride{}
	}
	if input.ContextWindow == nil {
		delete(a.ContextOverrides, input.Model)
	} else {
		a.ContextOverrides[input.Model] = ModelContextOverride{ContextWindow: *input.ContextWindow}
	}
	if err := s.store.save(&a); err != nil {
		fail(w, err)
		return
	}
	s.accountResponse(w, r, a)
}

func (s *Server) runContextCleanup(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.work.Lock()
			err := s.store.save(nil)
			s.work.Unlock()
			if err != nil {
				slog.Error("Unable to clean up model context settings", "error", err)
			}
		}
	}
}
