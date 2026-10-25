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

func (s *Server) updateModelEffort(w http.ResponseWriter, r *http.Request) {
	s.work.Lock()
	defer s.work.Unlock()
	a, err := s.authenticate(r)
	if err != nil {
		fail(w, err)
		return
	}
	var input struct {
		Model  string  `json:"model"`
		Effort *string `json:"effort"`
	}
	if err := decode(w, r, &input); err != nil {
		fail(w, err)
		return
	}
	models := s.catalog.models(r.Context(), a, s.config.LimitContextToFirstTier)
	index := slices.IndexFunc(models, func(m Model) bool { return m.ID == input.Model })
	if index < 0 {
		fail(w, problem(403, "model_blocked", "This model is not available for your account"))
		return
	}
	model := models[index]
	if !model.IsOpenAI || len(model.Efforts) == 0 || (input.Effort != nil && *input.Effort != "" && !slices.Contains(model.Efforts, *input.Effort)) {
		fail(w, problem(400, "invalid_effort", "This model does not support the requested effort setting"))
		return
	}
	if a.EffortOverrides == nil {
		a.EffortOverrides = map[string]ModelEffortOverride{}
	}
	if input.Effort == nil {
		delete(a.EffortOverrides, input.Model)
	} else {
		a.EffortOverrides[input.Model] = ModelEffortOverride{Effort: *input.Effort}
	}
	if err := s.store.save(&a); err != nil {
		fail(w, err)
		return
	}
	s.accountResponse(w, r, a)
}

func (s *Server) runModelCleanup(ctx context.Context) {
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
				slog.Error("Unable to clean up model settings", "error", err)
			}
		}
	}
}
