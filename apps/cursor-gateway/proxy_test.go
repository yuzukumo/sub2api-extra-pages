package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestProxyEnforcesSelectedKeysAndPreservesReasoningToolsAndStreamUsage(t *testing.T) {
	upstreamCalls := 0
	sse := "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"id\":\"tool-1\"}]}}]}\n\ndata: {\"usage\":{\"prompt_tokens_details\":{\"cached_tokens\":8}}}\n\ndata: [DONE]\n\n"
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) { t.Error("unexpected sub request"); w.WriteHeader(500) }, func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		if r.URL.Path != "/cursor/v1/chat/completions" || r.Header.Get("x-bf-vk") != "internal-bifrost-key" {
			t.Error("wrong inference route or identity")
		}
		username, password, ok := r.BasicAuth()
		if !ok || username != "internal-admin" || password != "internal-password" {
			t.Error("client overrode internal authentication")
		}
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		var model string
		_ = json.Unmarshal(body["model"], &model)
		if model != "sub-openai/test-model" {
			t.Error("model not mapped to its source provider")
		}
		var reasoning struct {
			Effort string `json:"effort"`
		}
		_ = json.Unmarshal(body["reasoning"], &reasoning)
		if reasoning.Effort != "high" {
			t.Error("reasoning level lost")
		}
		if body["reasoning_effort"] != nil || body["fallbacks"] != nil || body["api_key"] != nil || body["tools"] == nil || body["prompt_cache_key"] == nil {
			t.Error("unsafe routing or required request fields mishandled")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(sse))
	})
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}
	setModelsDev(t, s, testModelData)
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	request := func(path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", path, strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer gateway-key")
		r.Header.Set("x-bf-vk", "untrusted-key")
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		return w
	}
	if request("/v1/chat/completions", `{"model":"unowned-model"}`).Code != 403 || request("/chat/completions", `{"model":"foreign-model"}`).Code != 403 || upstreamCalls != 0 {
		t.Fatal("blocked model forwarded")
	}
	if request("/v1/chat/completions", `{"model":"test-model","reasoning_effort":"unsupported"}`).Code != 400 || upstreamCalls != 0 {
		t.Fatal("unconfigured reasoning level forwarded")
	}
	for i, path := range []string{"/v1/chat/completions", "/chat/completions"} {
		w := request(path, `{"model":"test-model","messages":[{"role":"user","content":"Hello"}],"stream":true,"reasoning_effort":"high","tools":[{"type":"function","function":{"name":"test"}}],"prompt_cache_key":"cache-id","fallbacks":["untrusted"],"api_key":"untrusted"}`)
		if w.Code != 200 || w.Body.String() != sse || upstreamCalls != i+1 {
			t.Fatal("stream response or usage was altered")
		}
	}
	if request("/v1/chat/completions", `{"model":"test-model","reasoning":{"effort":"low"},"reasoning_effort":"high"}`).Code != 400 {
		t.Fatal("conflicting reasoning levels accepted")
	}
}

func TestModelListingAggregatesSelectedKeysWithoutAdministratorSetup(t *testing.T) {
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}, {Provider: "sub-claude", Models: []string{"budget-model"}}, {Provider: "sub-grok", Models: []string{"grok-model"}}}
	setModelsDev(t, s, testModelData)
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/v1/models", "/models"} {
		r := httptest.NewRequest("GET", path, nil)
		r.Header.Set("Authorization", "Bearer gateway-key")
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		var result struct {
			Data []struct {
				ID            string   `json:"id"`
				ContextWindow int      `json:"context_window"`
				APITypes      []string `json:"api_types"`
				Capabilities  struct {
					ContextLength     int      `json:"context_length"`
					OutputModalities  []string `json:"output_modalities"`
					SupportsToolUse   bool     `json:"supports_tool_use"`
					SupportsStreaming bool     `json:"supports_streaming"`
					SupportsReasoning bool     `json:"supports_reasoning"`
					SupportsVision    bool     `json:"supports_vision"`
					MaxOutputTokens   int      `json:"max_output_tokens"`
					ReasoningEffort   []string `json:"reasoning_effort"`
				} `json:"capabilities"`
				Thinking struct {
					Levels []string `json:"levels"`
				} `json:"thinking"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || len(result.Data) != 3 || result.Data[0].ID != "budget-model" || result.Data[1].ID != "grok-model" || result.Data[2].ID != "test-model" {
			t.Fatal("listing exposed an unselected model or required an admin catalog")
		}
		if !slices.Equal(result.Data[0].Thinking.Levels, []string{"low", "medium", "high"}) || !slices.Equal(result.Data[1].Thinking.Levels, []string{"medium", "xhigh"}) || !slices.Equal(result.Data[2].Thinking.Levels, []string{"low", "high", "future-effort"}) || result.Data[2].ContextWindow != 1200 {
			t.Fatal("listing lost sourced capabilities or default levels")
		}
		for _, model := range result.Data {
			capabilities := model.Capabilities
			if !slices.Equal(model.APITypes, []string{"chat_completions"}) || !capabilities.SupportsToolUse || !capabilities.SupportsStreaming || !slices.Contains(capabilities.OutputModalities, "text") {
				t.Fatal("model discovery cannot identify the gateway's supported inference protocol")
			}
			if !capabilities.SupportsReasoning || !slices.Equal(capabilities.ReasoningEffort, model.Thinking.Levels) || capabilities.ContextLength != model.ContextWindow {
				t.Fatal("model discovery lost reasoning or context metadata")
			}
		}
		if !result.Data[2].Capabilities.SupportsVision || result.Data[2].Capabilities.MaxOutputTokens != 300 || result.Data[0].Capabilities.SupportsVision {
			t.Fatal("model discovery lost sourced vision or output limits")
		}
	}
}

func TestContextPolicyAppliesToBothCursorDiscoveryAndAccountModelList(t *testing.T) {
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"tiered-model"}}}
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/auth/me" {
			jsonResponse(w, map[string]any{"code": 0, "data": a.User})
			return
		}
		jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"items": []SourceKey{}, "pages": 1}})
	}, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	setModelsDev(t, s, `{"openai":{"models":{"tiered-model":{"limit":{"context":10000},"cost":{"tiers":[{"tier":{"type":"context","size":2000}}]}}}}}`)
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	for _, enabled := range []bool{false, true} {
		s.config.LimitContextToFirstTier = enabled
		want := 10000
		if enabled {
			want = 2000
		}
		for _, path := range []string{"/v1/models", "/models", "/api/account"} {
			r := sessionRequest(s, "GET", path, "")
			r.Header.Set("Authorization", "Bearer gateway-key")
			w := httptest.NewRecorder()
			s.routes().ServeHTTP(w, r)
			var result struct {
				Data []struct {
					ContextWindow int `json:"context_window"`
					Capabilities  struct {
						ContextLength int `json:"context_length"`
					} `json:"capabilities"`
				} `json:"data"`
				Models []Model `json:"models"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if w.Code != 200 {
				t.Fatalf("%s returned %d", path, w.Code)
			}
			if path == "/api/account" {
				if len(result.Models) != 1 || result.Models[0].ContextWindow != want {
					t.Fatal("account model context ignores pricing policy")
				}
			} else if len(result.Data) != 1 || result.Data[0].ContextWindow != want || result.Data[0].Capabilities.ContextLength != want {
				t.Fatal("Cursor model context ignores pricing policy")
			}
		}
	}
}

func TestInferenceKeepsRotatedTokensWhenIdentityOrKeySyncFails(t *testing.T) {
	for _, failingPath := range []string{"/api/v1/auth/me", "/api/v1/keys"} {
		t.Run(failingPath, func(t *testing.T) {
			a := activeAccount()
			a.TokenExpires = time.Now().Add(-time.Minute)
			a.RefreshToken = "old-refresh"
			a.SyncedAt = time.Now().Add(-time.Minute)
			refreshes := 0
			failed := false
			s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api/v1/auth/refresh" {
					refreshes++
					var input struct {
						RefreshToken string `json:"refresh_token"`
					}
					if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.RefreshToken != "old-refresh" || refreshes > 1 {
						t.Error("retried a consumed refresh token")
					}
					jsonResponse(w, map[string]any{"code": 0, "data": Tokens{AccessToken: "new-access", RefreshToken: "new-refresh", ExpiresIn: 3600}})
					return
				}
				if r.Header.Get("Authorization") != "Bearer new-access" {
					t.Error("request did not use refreshed credentials")
				}
				if r.URL.Path == failingPath && !failed {
					failed = true
					w.WriteHeader(503)
					return
				}
				if r.URL.Path == "/api/v1/auth/me" {
					jsonResponse(w, map[string]any{"code": 0, "data": a.User})
					return
				}
				jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"items": []SourceKey{}, "pages": 1}})
			}, func(w http.ResponseWriter, r *http.Request) {
				t.Error("account without selected keys changed Bifrost")
				w.WriteHeader(500)
			})
			if err := s.store.save(&a); err != nil {
				t.Fatal(err)
			}
			for _, want := range []int{http.StatusBadGateway, http.StatusOK} {
				r := httptest.NewRequest("GET", "/v1/models", nil)
				r.Header.Set("Authorization", "Bearer gateway-key")
				w := httptest.NewRecorder()
				s.routes().ServeHTTP(w, r)
				if w.Code != want {
					t.Fatalf("inference returned %d, want %d", w.Code, want)
				}
				stored := s.store.snapshot().Accounts[a.User.ID]
				if stored.AccessToken != "new-access" || stored.RefreshToken != "new-refresh" || refreshes != 1 {
					t.Fatal("transient upstream failure lost rotated credentials")
				}
			}
		})
	}
}

func TestProxyDefaultsOnlyUnspecifiedOpenAIEffortAndPreservesSettings(t *testing.T) {
	type requestBody struct {
		Model     string `json:"model"`
		Reasoning struct {
			Effort  string `json:"effort"`
			Summary string `json:"summary"`
		} `json:"reasoning"`
		ChatEffort *string `json:"reasoning_effort"`
	}
	var forwarded []requestBody
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, func(w http.ResponseWriter, r *http.Request) {
		var body requestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		forwarded = append(forwarded, body)
		jsonResponse(w, map[string]string{"id": "completion"})
	})
	setModelsDev(t, s, testModelData)
	a := activeAccount()
	a.Bindings = []Binding{
		{Provider: "sub-openai", Models: []string{"test-model", "missing-model"}},
		{Provider: "sub-claude", Models: []string{"budget-model"}},
		{Provider: "sub-grok", Models: []string{"grok-model"}},
	}
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, input, model, effort, summary string
	}{
		{"omitted", `{"model":"test-model"}`, "sub-openai/test-model", "xhigh", ""},
		{"empty chat effort", `{"model":"test-model","reasoning_effort":""}`, "sub-openai/test-model", "xhigh", ""},
		{"null chat effort", `{"model":"test-model","reasoning_effort":null}`, "sub-openai/test-model", "xhigh", ""},
		{"empty response effort", `{"model":"test-model","reasoning":{"effort":""}}`, "sub-openai/test-model", "xhigh", ""},
		{"null response effort", `{"model":"test-model","reasoning":{"effort":null}}`, "sub-openai/test-model", "xhigh", ""},
		{"preserve summary", `{"model":"test-model","reasoning":{"summary":"auto"}}`, "sub-openai/test-model", "xhigh", "auto"},
		{"missing metadata", `{"model":"missing-model"}`, "sub-openai/missing-model", "xhigh", ""},
		{"explicit response effort", `{"model":"test-model","reasoning":{"effort":"future-effort"}}`, "sub-openai/test-model", "future-effort", ""},
		{"explicit chat effort", `{"model":"missing-model","reasoning_effort":"medium"}`, "sub-openai/missing-model", "medium", ""},
		{"Claude default", `{"model":"budget-model"}`, "sub-claude/budget-model", "", ""},
		{"Grok default", `{"model":"grok-model"}`, "sub-grok/grok-model", "", ""},
		{"Grok explicit effort", `{"model":"grok-model","reasoning_effort":"xhigh"}`, "sub-grok/grok-model", "xhigh", ""},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(tc.input))
			r.Header.Set("Authorization", "Bearer gateway-key")
			w := httptest.NewRecorder()
			s.routes().ServeHTTP(w, r)
			if w.Code != 200 || len(forwarded) != i+1 {
				t.Fatalf("reasoning request failed %d %s", w.Code, w.Body.String())
			}
			got := forwarded[i]
			if got.Model != tc.model || got.Reasoning.Effort != tc.effort || got.Reasoning.Summary != tc.summary || got.ChatEffort != nil {
				t.Fatalf("wrong reasoning or model forwarded: %#v", got)
			}
		})
	}
}
