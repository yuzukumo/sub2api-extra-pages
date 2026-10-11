package main

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"testing"
)

func sourceFixture(id, owner int64, platform, key string) SourceKey {
	var result SourceKey
	data, _ := json.Marshal(map[string]any{"id": id, "user_id": owner, "name": key, "key": key, "status": "active", "group": map[string]any{"name": platform, "platform": platform, "status": "active"}})
	_ = json.Unmarshal(data, &result)
	return result
}

func TestSyncLimitsProviderCredentialsToSelectedOwnedKeysAndDeactivatesEmptySelection(t *testing.T) {
	keys := []SourceKey{sourceFixture(12, 7, "openai", "source-openai"), sourceFixture(13, 7, "anthropic", "source-claude"), sourceFixture(14, 7, "grok", "source-grok"), sourceFixture(15, 8, "openai", "foreign-source"), sourceFixture(16, 7, "gemini", "source-gemini")}
	credentials := make(chan bifrostKey, 8)
	virtuals := make(chan virtualRequest, 8)
	deleted := make(chan string, 8)
	configured := make(chan string, 8)
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/keys":
			jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"items": keys, "pages": 1}})
		case "/v1/models":
			jsonResponse(w, map[string]any{"data": []map[string]string{{"id": strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ") + "-model"}}})
		default:
			t.Errorf("unexpected Sub2API request %s", r.URL.Path)
			w.WriteHeader(500)
		}
	}, func(w http.ResponseWriter, r *http.Request) {
		username, password, ok := r.BasicAuth()
		if !ok || username != "internal-admin" || password != "internal-password" {
			t.Error("Bifrost management request lacks authentication")
		}
		switch {
		case r.Method == "DELETE":
			deleted <- r.URL.Path
			jsonResponse(w, map[string]bool{"ok": true})
		case r.URL.Path == "/api/providers" && r.Method == "POST":
			var body struct {
				Provider string `json:"provider"`
				Network  struct {
					BaseURL string `json:"base_url"`
					Private bool   `json:"allow_private_network"`
				} `json:"network_config"`
				Custom struct {
					Base    string          `json:"base_provider_type"`
					Allowed map[string]bool `json:"allowed_requests"`
				} `json:"custom_provider_config"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if !body.Network.Private || body.Network.BaseURL == "" {
				t.Error("provider cannot reach Sub2API on the Docker network")
			}
			if body.Provider == "sub-gemini" && (body.Custom.Base != "gemini" || !strings.HasSuffix(body.Network.BaseURL, "/v1beta") || !body.Custom.Allowed["responses"] || !body.Custom.Allowed["responses_stream"]) {
				t.Error("Gemini provider cannot convert Responses to Sub2API's native API")
			}
			configured <- body.Provider
			jsonResponse(w, map[string]bool{"ok": true})
		case strings.HasSuffix(r.URL.Path, "/keys") && r.Method == "GET":
			jsonResponse(w, map[string]any{"keys": []bifrostKey{}})
		case strings.HasSuffix(r.URL.Path, "/keys") && r.Method == "POST":
			var key bifrostKey
			if err := json.NewDecoder(r.Body).Decode(&key); err != nil {
				t.Error(err)
			}
			credentials <- key
			jsonResponse(w, map[string]string{"id": key.Name})
		case r.URL.Path == "/api/governance/virtual-keys" && r.Method == "GET":
			jsonResponse(w, map[string]any{"virtual_keys": []string{}})
		case strings.HasPrefix(r.URL.Path, "/api/governance/virtual-keys"):
			var key virtualRequest
			if err := json.NewDecoder(r.Body).Decode(&key); err != nil {
				t.Error(err)
			}
			virtuals <- key
			jsonResponse(w, map[string]any{"virtual_key": map[string]any{"id": "virtual-7", "value": map[string]string{"value": "aggregate-7"}}})
		default:
			w.WriteHeader(404)
		}
	})
	a := activeAccount()
	a.VirtualKey = ""
	a.GatewayKey = ""
	a.SelectedSourceIDs = []int64{12, 14, 15, 16}
	updated, err := s.clients.sync(context.Background(), a)
	if err != nil {
		t.Fatal(err)
	}
	if len(updated.SourceKeys) != 4 || len(updated.Bindings) != 3 || updated.VirtualKey != "aggregate-7" || len(configured) != 3 {
		t.Fatal("selection did not preserve owned key visibility and credential isolation")
	}
	assertGatewayKey(t, updated.GatewayKey)
	first, second, third := <-credentials, <-credentials, <-credentials
	if first.Value != keys[0].Key || second.Value != keys[2].Key || third.Value != keys[4].Key || !slices.Equal(first.Models, []string{"source-openai-model"}) || !slices.Equal(third.Models, []string{"source-gemini-model"}) {
		t.Fatal("Bifrost received an unselected credential or incorrect model restriction")
	}
	vk := <-virtuals
	if !vk.Active || vk.AllProviders || !vk.DisableContentLogging || len(vk.Providers) != 3 {
		t.Fatal("aggregate key is not limited to the selected providers")
	}
	for _, provider := range vk.Providers {
		binding := updated.Bindings[slices.IndexFunc(updated.Bindings, func(b Binding) bool { return b.Provider == provider.Provider })]
		if !slices.Equal(provider.KeyIDs, []string{binding.BifrostID}) || !slices.Equal(provider.Models, binding.Models) {
			t.Fatal("virtual key does not pin the user's own source key and models")
		}
	}
	updated.SelectedSourceIDs = []int64{}
	deselected, err := s.clients.sync(context.Background(), updated)
	if err != nil {
		t.Fatal(err)
	}
	inactive := <-virtuals
	if inactive.Active || inactive.AllProviders || len(inactive.Providers) != 0 || len(deselected.Bindings) != 0 || deselected.VirtualKey != updated.VirtualKey || deselected.GatewayKey != updated.GatewayKey || len(deleted) != 3 || len(credentials) != 0 {
		t.Fatal("clearing selection left usable credentials or unexpectedly rotated the aggregate key")
	}
}

func TestEnsureProviderCreatesReusesAndUpdatesNativeRouting(t *testing.T) {
	for _, provider := range []struct {
		name, base, suffix string
	}{
		{"sub-openai", "openai", ""},
		{"sub-claude", "anthropic", ""},
		{"sub-grok", "openai", ""},
		{"sub-gemini", "gemini", "/v1beta"},
	} {
		for _, currentURL := range []string{"", "http://previous-sub2api" + provider.suffix, "http://current-sub2api" + provider.suffix} {
			t.Run(provider.name+"/"+currentURL, func(t *testing.T) {
				updates := 0
				s := testServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path != "/api/providers/"+provider.name && !(currentURL == "" && r.URL.Path == "/api/providers" && r.Method == "POST") {
						t.Errorf("unexpected provider request %s", r.URL.Path)
					}
					if r.Method == "GET" {
						if currentURL == "" {
							w.WriteHeader(404)
							return
						}
						jsonResponse(w, map[string]any{"network_config": map[string]any{"base_url": currentURL, "allow_private_network": true}, "custom_provider_config": map[string]any{"base_provider_type": provider.base, "allowed_requests": map[string]bool{"responses": true, "responses_stream": true}}})
						return
					}
					updates++
					var body struct {
						Network struct {
							BaseURL string `json:"base_url"`
						} `json:"network_config"`
						Custom struct {
							Base    string          `json:"base_provider_type"`
							Allowed map[string]bool `json:"allowed_requests"`
						} `json:"custom_provider_config"`
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						return
					}
					method := "PUT"
					if currentURL == "" {
						method = "POST"
					}
					if r.Method != method || body.Network.BaseURL != "http://current-sub2api"+provider.suffix || body.Custom.Base != provider.base || !body.Custom.Allowed["responses"] || !body.Custom.Allowed["responses_stream"] {
						t.Error("provider configuration changed its native routing")
					}
					jsonResponse(w, map[string]bool{"ok": true})
				})
				s.clients.config.SubURL = "http://current-sub2api"
				if err := s.clients.ensureProvider(context.Background(), provider.name); err != nil {
					t.Fatal(err)
				}
				want := 0
				if currentURL != "http://current-sub2api"+provider.suffix {
					want = 1
				}
				if updates != want {
					t.Fatalf("provider updates = %d, want %d", updates, want)
				}
			})
		}
	}
}

func TestSyncRejectsDuplicateModelsBeforeChangingBifrost(t *testing.T) {
	keys := []SourceKey{sourceFixture(12, 7, "openai", "first"), sourceFixture(13, 7, "anthropic", "second")}
	mutations := make(chan string, 8)
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/keys" {
			jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"items": keys, "pages": 1}})
			return
		}
		jsonResponse(w, map[string]any{"data": []map[string]string{{"id": "overlapping-model"}}})
	}, func(w http.ResponseWriter, r *http.Request) { mutations <- r.Method; w.WriteHeader(500) })
	a := activeAccount()
	a.SelectedSourceIDs = []int64{12, 13}
	_, err := s.clients.sync(context.Background(), a)
	p, ok := err.(*Problem)
	if !ok || p.Status != 409 || p.Code != "duplicate_model" || len(mutations) != 0 {
		t.Fatal("duplicate models changed Bifrost or were accepted")
	}
}

func TestSyncRecoversExistingUserKeysAfterInterruptedSave(t *testing.T) {
	updates := make(chan string, 8)
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/keys" {
			jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"items": []SourceKey{sourceFixture(12, 7, "openai", "own-source")}, "pages": 1}})
			return
		}
		jsonResponse(w, map[string]any{"data": []map[string]string{{"id": "own-model"}}})
	}, func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "GET /api/providers/sub-openai":
			jsonResponse(w, map[string]any{"network_config": map[string]any{"base_url": "http://previous-sub2api", "allow_private_network": true}, "concurrency_and_buffer_size": map[string]int{"concurrency": 1, "buffer_size": 2}, "custom_provider_config": map[string]string{"base_provider_type": "openai"}})
		case "PUT /api/providers/sub-openai":
			var input struct {
				Network map[string]json.RawMessage `json:"network_config"`
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Error(err)
			}
			var baseURL string
			_ = json.Unmarshal(input.Network["base_url"], &baseURL)
			if baseURL == "http://previous-sub2api" || baseURL == "" {
				t.Error("provider kept an obsolete Sub2API URL")
			}
			jsonResponse(w, map[string]bool{"ok": true})
		case "GET /api/providers/sub-openai/keys":
			jsonResponse(w, map[string]any{"keys": []map[string]string{{"id": "foreign-id", "name": "cursor-user-8-key-12"}, {"id": "owned-id", "name": "cursor-user-7-key-12"}}})
		case "PUT /api/providers/sub-openai/keys/owned-id":
			var input bifrostKey
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Error(err)
			}
			if input.Value != "own-source" {
				t.Error("retry replaced an unrelated user's provider key")
			}
			updates <- r.URL.Path
			jsonResponse(w, map[string]string{"id": "owned-id"})
		case "GET /api/governance/virtual-keys":
			jsonResponse(w, map[string]any{"virtual_keys": []map[string]any{{"id": "foreign-virtual", "name": "cursor-user-8", "value": "foreign-aggregate"}, {"id": "owned-virtual", "name": "cursor-user-7", "value": map[string]string{"value": "own-aggregate"}}}})
		case "PUT /api/governance/virtual-keys/owned-virtual":
			updates <- r.URL.Path
			jsonResponse(w, map[string]any{"virtual_key": map[string]string{"id": "owned-virtual"}})
		default:
			t.Errorf("retry issued unexpected mutation %s %s", r.Method, r.URL.Path)
			w.WriteHeader(500)
		}
	})
	a := activeAccount()
	a.VirtualKey = ""
	a.GatewayKey = ""
	a.SelectedSourceIDs = []int64{12}
	recovered, err := s.clients.sync(context.Background(), a)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.VirtualID != "owned-virtual" || recovered.VirtualKey != "own-aggregate" || len(recovered.Bindings) != 1 || recovered.Bindings[0].BifrostID != "owned-id" || len(updates) != 2 {
		t.Fatal("interrupted sync created duplicate keys or recovered another user's credentials")
	}
	assertGatewayKey(t, recovered.GatewayKey)
}
