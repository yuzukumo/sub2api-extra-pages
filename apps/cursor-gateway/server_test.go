package main

import (
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T, subHandler, bifrostHandler http.HandlerFunc) *Server {
	t.Helper()
	sub := httptest.NewServer(subHandler)
	t.Cleanup(sub.Close)
	bifrost := httptest.NewServer(bifrostHandler)
	t.Cleanup(bifrost.Close)
	store, err := openStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s := newServer(Config{PublicURL: "https://gateway.example", SubURL: sub.URL, BifrostURL: bifrost.URL, BifrostUsername: "internal-admin", BifrostPassword: "internal-password"}, store)
	setModelsDev(t, s, `{"openai":{"models":{}}}`)
	return s
}

func jsonResponse(w http.ResponseWriter, value any) { respond(w, 200, value) }

func assertGatewayKey(t *testing.T, key string) {
	t.Helper()
	data, err := hex.DecodeString(strings.TrimPrefix(key, "sk-"))
	if !strings.HasPrefix(key, "sk-") || err != nil || len(data) != 32 {
		t.Fatal("gateway key must use sk- followed by 32 random bytes encoded as hex")
	}
}

func activeAccount() Account {
	return Account{User: User{ID: 7, Role: "user", Status: "active"}, AccessToken: "sub-token", TokenExpires: time.Now().Add(time.Hour), VirtualKey: "internal-bifrost-key", GatewayKey: "gateway-key", SyncedAt: time.Now(), SelectedSourceIDs: []int64{}, Bindings: []Binding{}}
}

func TestModelEffortSettingsAreOwnedDurableAndAppliedOnlyToMissingEffort(t *testing.T) {
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"test-model", "compatible-model", "image-model", "plain-model"}}}
	a.ContextOverrides = map[string]ModelContextOverride{"test-model": {ContextWindow: 64000}}
	var forwardedEffort string
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, map[string]any{"code": 0, "data": a.User})
	}, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Reasoning struct {
				Effort string `json:"effort"`
			} `json:"reasoning"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		forwardedEffort = body.Reasoning.Effort
		respond(w, 200, map[string]string{"status": "completed"})
	})
	setModelsDev(t, s, `{
		"openai":{"models":{
			"test-model":{"reasoning_options":[{"type":"effort","values":["none","low","xhigh","future-effort"]}]},
			"image-model":{"type":"image"},
			"plain-model":{"reasoning":false}
		}},
		"xai":{"models":{"compatible-model":{"reasoning_options":[{"type":"effort","values":["low"]}]}}}
	}`)
	b := a
	b.User.ID = 8
	b.GatewayKey = "other-gateway-key"
	for _, account := range []*Account{&a, &b} {
		if err := s.store.save(account); err != nil {
			t.Fatal(err)
		}
	}
	unauthorized := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/models/effort", strings.NewReader(`{"model":"test-model","effort":"low"}`))
	r.Header.Set("Content-Type", "application/json")
	s.routes().ServeHTTP(unauthorized, r)
	if unauthorized.Code != 401 {
		t.Fatal("effort update did not require authentication")
	}
	for _, test := range []struct {
		body string
		code int
	}{
		{`{"model":"test-model","effort":"unsupported"}`, 400},
		{`{"model":"test-model","effort":42}`, 400},
		{`{"model":"test-model","effort":"low","user_id":8}`, 400},
		{`{"model":"unowned-model","effort":"low"}`, 403},
		{`{"model":"compatible-model","effort":"low"}`, 400},
		{`{"model":"image-model","effort":"low"}`, 400},
		{`{"model":"image-model","effort":""}`, 400},
		{`{"model":"image-model","effort":null}`, 400},
		{`{"model":"plain-model","effort":""}`, 400},
		{`{"model":"plain-model","effort":null}`, 400},
	} {
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, sessionRequest(s, "PUT", "/api/models/effort", test.body))
		if w.Code != test.code {
			t.Fatalf("invalid effort update returned %d: %s", w.Code, w.Body.String())
		}
	}
	infer := func(key, fields, want string) {
		t.Helper()
		r := httptest.NewRequest("POST", "/v1/responses", strings.NewReader(`{"model":"test-model"`+fields+`}`))
		r.Header.Set("Authorization", "Bearer "+key)
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		if w.Code != 200 || forwardedEffort != want {
			t.Fatalf("incorrect injected effort %q, expected %q, response %s", forwardedEffort, want, w.Body.String())
		}
	}
	for _, test := range []struct {
		value string
		want  string
	}{{`"future-effort"`, "future-effort"}, {`"none"`, "none"}, {`""`, ""}, {`null`, "xhigh"}} {
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, sessionRequest(s, "PUT", "/api/models/effort", `{"model":"test-model","effort":`+test.value+`}`))
		if w.Code != 200 {
			t.Fatalf("save failed: %s", w.Body.String())
		}
		var result struct {
			Models []Model `json:"models"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		for _, model := range result.Models {
			if model.ID == "test-model" && (model.InjectedEffort != test.want || model.ContextWindow != 64000) {
				t.Fatal("account response lost effort or independent context settings")
			}
		}
		reopened, err := openStore(s.store.dir)
		if err != nil {
			t.Fatal(err)
		}
		s.store = reopened
		infer(a.GatewayKey, "", test.want)
		infer(b.GatewayKey, "", "xhigh")
		infer(a.GatewayKey, `,"reasoning":{"effort":"low"}`, "low")
	}
	if len(s.store.snapshot().Accounts[a.User.ID].EffortOverrides) != 0 {
		t.Fatal("restoring the default retained an override")
	}
}

func TestModelContextUpdatesAreOwnedDurableAndVisibleToCursor(t *testing.T) {
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, map[string]any{"code": 0, "data": a.User})
	}, func(w http.ResponseWriter, r *http.Request) {
		t.Error("context changes must not mutate Bifrost")
		w.WriteHeader(500)
	})
	setModelsDev(t, s, testModelData)
	b := a
	b.User.ID = 8
	b.GatewayKey = "other-gateway-key"
	for _, account := range []*Account{&a, &b} {
		if err := s.store.save(account); err != nil {
			t.Fatal(err)
		}
	}
	unauthorized := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/models/context", strings.NewReader(`{"model":"test-model","context_window":64000}`))
	r.Header.Set("Content-Type", "application/json")
	s.routes().ServeHTTP(unauthorized, r)
	if unauthorized.Code != 401 {
		t.Fatal("context update did not require authentication")
	}
	for _, body := range []string{`{"model":"test-model","context_window":0}`, `{"model":"test-model","context_window":-1}`, `{"model":"test-model","context_window":1.5}`, `{"model":"test-model","context_window":9007199254740992}`, `{"model":"test-model","context_window":"64000"}`, `{"model":"test-model","context_window":64000,"user_id":8}`} {
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, sessionRequest(s, "PUT", "/api/models/context", body))
		if w.Code != 400 {
			t.Fatalf("invalid context accepted: %s, %d", body, w.Code)
		}
	}
	w := httptest.NewRecorder()
	s.routes().ServeHTTP(w, sessionRequest(s, "PUT", "/api/models/context", `{"model":"unowned-model","context_window":64000}`))
	if w.Code != 403 {
		t.Fatal("unavailable model override accepted")
	}
	w = httptest.NewRecorder()
	s.routes().ServeHTTP(w, sessionRequest(s, "PUT", "/api/models/context", `{"model":"test-model","context_window":64000}`))
	if w.Code != 200 {
		t.Fatalf("save failed: %s", w.Body.String())
	}
	var result struct {
		Models []Model `json:"models"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Models) != 1 || result.Models[0].ContextWindow != 64000 || result.Models[0].ContextWindowOverride != 64000 {
		t.Fatal("account response did not include custom context")
	}
	reopened, err := openStore(s.store.dir)
	if err != nil {
		t.Fatal(err)
	}
	s.store = reopened
	for _, test := range []struct {
		key  string
		want int
	}{{a.GatewayKey, 64000}, {b.GatewayKey, 1200}} {
		for _, path := range []string{"/v1/models", "/models"} {
			r := httptest.NewRequest("GET", path, nil)
			r.Header.Set("Authorization", "Bearer "+test.key)
			w := httptest.NewRecorder()
			s.routes().ServeHTTP(w, r)
			var list struct {
				Data []struct {
					ContextWindow int `json:"context_window"`
					Capabilities  struct {
						ContextLength int `json:"context_length"`
					} `json:"capabilities"`
				} `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
				t.Fatal(err)
			}
			if w.Code != 200 || len(list.Data) != 1 || list.Data[0].ContextWindow != test.want || list.Data[0].Capabilities.ContextLength != test.want {
				t.Fatalf("incorrect user context for %s: %s", path, w.Body.String())
			}
		}
	}
	w = httptest.NewRecorder()
	s.routes().ServeHTTP(w, sessionRequest(s, "PUT", "/api/models/context", `{"model":"test-model","context_window":null}`))
	if w.Code != 200 || len(s.store.snapshot().Accounts[7].ContextOverrides) != 0 {
		t.Fatal("restore default did not remove override")
	}
	result.Models = nil
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Models[0].ContextWindow != 1200 || result.Models[0].ContextWindowOverride != 0 {
		t.Fatal("restored context did not return to catalog default")
	}
}

func sessionRequest(s *Server, method, path, body string) *http.Request {
	s.sessions[hashToken("test-session")] = session{7, time.Now().Add(time.Hour)}
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.AddCookie(&http.Cookie{Name: "cursor_session", Value: "test-session"})
	r.Header.Set("Content-Type", "application/json")
	return r
}

func TestLoginShowsAllOwnedKeysWithoutAutomaticAggregationOrRawKeys(t *testing.T) {
	mutations := 0
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/auth/login":
			jsonResponse(w, map[string]any{"code": 0, "data": Tokens{AccessToken: "sub-token", ExpiresIn: 3600, User: User{ID: 7, Status: "active"}}})
		case "/api/v1/keys":
			jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"items": []map[string]any{{"id": 12, "user_id": 7, "name": "My key", "key": "private-original-key", "status": "active", "group": map[string]any{"name": "OpenAI group", "status": "active", "platform": "openai", "rate_multiplier": 2}}, {"id": 13, "user_id": 8, "name": "Other user", "key": "other-private-key", "status": "active"}}, "pages": 1}})
		default:
			t.Errorf("unexpected upstream call %s", r.URL.Path)
			w.WriteHeader(500)
		}
	}, func(w http.ResponseWriter, r *http.Request) { mutations++; w.WriteHeader(500) })
	r := httptest.NewRequest("POST", "/api/login", strings.NewReader(`{"email":"user@example.com","password":"secret"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.routes().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("login status %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Key  string       `json:"key"`
		Keys []KeySummary `json:"source_keys"`
		URL  string       `json:"base_url"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Keys) != 1 || result.Keys[0].ID != 12 || result.Key != "" || mutations != 0 {
		t.Fatal("login aggregated automatically or exposed another user's key")
	}
	if result.URL != "https://gateway.example/v1" {
		t.Fatal("login returned a nonstandard inference base URL")
	}
	if strings.Contains(w.Body.String(), "private-original-key") || strings.Contains(w.Body.String(), "sub-token") {
		t.Fatal("raw upstream credential exposed")
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || !cookies[0].Secure {
		t.Fatal("session cookie is not protected")
	}
}

func TestRotationChangesOnlyPublicKeyAndRejectsOldAndInternalCredentials(t *testing.T) {
	a := activeAccount()
	a.VirtualID = "internal-id"
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, map[string]any{"code": 0, "data": a.User})
	}, func(w http.ResponseWriter, r *http.Request) {
		t.Error("public key rotation should not change Bifrost credentials")
		w.WriteHeader(500)
	})
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.routes().ServeHTTP(w, sessionRequest(s, "POST", "/api/key/rotate", `{}`))
	var result struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || result.Key == a.GatewayKey || strings.Contains(w.Body.String(), a.VirtualKey) || s.store.snapshot().Accounts[7].VirtualKey != a.VirtualKey {
		t.Fatal("rotation changed internal credentials or exposed the Bifrost secret")
	}
	assertGatewayKey(t, result.Key)
	for _, token := range []string{a.GatewayKey, a.VirtualKey, result.Key} {
		r := httptest.NewRequest("GET", "/v1/models", nil)
		r.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		s.routes().ServeHTTP(response, r)
		want := http.StatusUnauthorized
		if token == result.Key {
			want = http.StatusOK
		}
		if response.Code != want {
			t.Fatalf("credential isolation after rotation returned %d, want %d", response.Code, want)
		}
	}
}

func TestSelectionRejectsKeysOwnedByAnotherUser(t *testing.T) {
	a := activeAccount()
	bifrostCalls := 0
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/auth/me" {
			jsonResponse(w, map[string]any{"code": 0, "data": a.User})
			return
		}
		jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"pages": 1, "items": []map[string]any{{"id": 90, "user_id": 8, "status": "active", "key": "other-key", "group": map[string]any{"platform": "openai", "status": "active"}}}}})
	}, func(w http.ResponseWriter, r *http.Request) { bifrostCalls++; w.WriteHeader(500) })
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.routes().ServeHTTP(w, sessionRequest(s, "POST", "/api/sync", `{"key_ids":[90]}`))
	if w.Code != 400 || bifrostCalls != 0 || len(s.store.snapshot().Accounts[7].SelectedSourceIDs) != 0 {
		t.Fatal("foreign key selection accepted")
	}
}

func TestLoginRejectsCrossOriginAndRateLimits(t *testing.T) {
	calls := 0
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(401) }, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	request := func(origin string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/login", strings.NewReader(`{"email":"user@example.com","password":"secret"}`))
		r.RemoteAddr = "test-client"
		r.Header.Set("Content-Type", "application/json; charset=utf-8")
		r.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		return w
	}
	if request("https://other.example").Code != 403 || calls != 0 {
		t.Fatal("cross-origin login accepted")
	}
	for range 10 {
		if request("https://gateway.example").Code != 401 {
			t.Fatal("unexpected login result")
		}
	}
	for range 100 {
		if request("https://gateway.example").Code != 429 || calls != 10 {
			t.Fatal("login rate limit failed")
		}
	}
	if len(s.logins["test-client"]) > 10 {
		t.Fatal("rejected login attempts increased rate-limit memory usage")
	}
}

func TestRemovedAdminEndpointsReturnNotFound(t *testing.T) {
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("removed endpoint reached Sub2API")
		w.WriteHeader(500)
	}, func(w http.ResponseWriter, r *http.Request) {
		t.Error("removed endpoint changed Bifrost")
		w.WriteHeader(500)
	})
	for _, method := range []string{"GET", "POST", "PUT", "DELETE"} {
		r := sessionRequest(s, method, "/api/admin/models", `{}`)
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Fatalf("removed %s endpoint returned %d", method, w.Code)
		}
	}
}
