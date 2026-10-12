package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStoreEncryptsCredentialsAndSurvivesRestart(t *testing.T) {
	dir := t.TempDir()
	store, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	account := Account{User: User{ID: 7}, AccessToken: "private-access-token", RefreshToken: "private-refresh-token", VirtualKey: "private-virtual-key", GatewayKey: "private-gateway-key", SelectedSourceIDs: []int64{12}}
	if err := store.save(&account); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "state.enc"))
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{account.AccessToken, account.RefreshToken, account.VirtualKey, account.GatewayKey} {
		if bytes.Contains(data, []byte(secret)) {
			t.Fatal("credential stored in plaintext")
		}
	}
	reopened, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	state := reopened.snapshot()
	if state.Accounts[7].RefreshToken != account.RefreshToken || state.Accounts[7].GatewayKey != account.GatewayKey || state.Accounts[7].SelectedSourceIDs[0] != 12 {
		t.Fatal("durable state lost")
	}
	state.Accounts[7] = Account{}
	if reopened.snapshot().Accounts[7].User.ID != 7 {
		t.Fatal("snapshot modified stored state")
	}
	data[len(data)-1] ^= 1
	if err := os.WriteFile(filepath.Join(dir, "state.enc"), data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := openStore(dir); err == nil {
		t.Fatal("accepted tampered state")
	}
}

func TestContextOverridesPersistPerUserAndExpireOnlyAfterContinuousAbsence(t *testing.T) {
	dir := t.TempDir()
	store, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	a := Account{User: User{ID: 7}, Bindings: []Binding{{Models: []string{"shared-model", "present-model"}}}, ContextOverrides: map[string]ModelContextOverride{
		"shared-model": {ContextWindow: 64000}, "present-model": {ContextWindow: 96000},
	}}
	b := Account{User: User{ID: 8}, Bindings: []Binding{{Models: []string{"shared-model"}}}, ContextOverrides: map[string]ModelContextOverride{"shared-model": {ContextWindow: 128000}}}
	for _, account := range []*Account{&a, &b} {
		if err := store.saveAt(account, now); err != nil {
			t.Fatal(err)
		}
	}
	a.Bindings = []Binding{{Models: []string{"present-model"}}}
	if err := store.saveAt(&a, now); err != nil {
		t.Fatal(err)
	}
	reopened, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	a = reopened.snapshot().Accounts[7]
	if a.ContextOverrides["shared-model"].ContextWindow != 64000 || !a.ContextOverrides["shared-model"].MissingSince.Equal(now) || reopened.snapshot().Accounts[8].ContextOverrides["shared-model"].ContextWindow != 128000 {
		t.Fatal("settings were lost on restart or mixed between users")
	}
	a.Bindings = []Binding{{Models: []string{"shared-model", "present-model"}}}
	if err := reopened.saveAt(&a, now.Add(13*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if a.ContextOverrides["shared-model"].ContextWindow != 64000 || !a.ContextOverrides["shared-model"].MissingSince.IsZero() {
		t.Fatal("returning model did not recover its setting")
	}
	a.Bindings = []Binding{{Models: []string{"present-model"}}}
	missing := now.Add(14 * 24 * time.Hour)
	if err := reopened.saveAt(&a, missing); err != nil {
		t.Fatal(err)
	}
	if err := reopened.saveAt(nil, missing.Add(14*24*time.Hour-time.Nanosecond)); err != nil {
		t.Fatal(err)
	}
	if reopened.snapshot().Accounts[7].ContextOverrides["shared-model"].ContextWindow != 64000 {
		t.Fatal("setting expired before 14 days of continuous absence")
	}
	if err := reopened.saveAt(nil, missing.Add(14*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	state := reopened.snapshot()
	if _, ok := state.Accounts[7].ContextOverrides["shared-model"]; ok {
		t.Fatal("absent model setting was retained after 14 days")
	}
	if state.Accounts[7].ContextOverrides["present-model"].ContextWindow != 96000 || state.Accounts[8].ContextOverrides["shared-model"].ContextWindow != 128000 {
		t.Fatal("cleanup removed available model settings")
	}
	a = state.Accounts[7]
	a.Bindings = []Binding{{Models: []string{"shared-model", "present-model"}}}
	if err := reopened.saveAt(&a, missing.Add(15*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, ok := a.ContextOverrides["shared-model"]; ok {
		t.Fatal("expired setting reappeared")
	}
	a.Bindings = []Binding{{Models: []string{"present-model"}}}
	a.ContextOverrides["shared-model"] = ModelContextOverride{ContextWindow: 64000}
	if err := reopened.saveAt(&a, now.Add(-15*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	restarted, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := restarted.snapshot().Accounts[7].ContextOverrides["shared-model"]; ok {
		t.Fatal("restart retained a setting that expired while the server was offline")
	}
}

func TestStoreMigratesInternalVirtualKeyToSeparateGatewayKeyOnce(t *testing.T) {
	dir := t.TempDir()
	store, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	account := Account{User: User{ID: 7}, VirtualID: "bifrost-id", VirtualKey: "internal-bifrost-secret", SelectedSourceIDs: []int64{12}, Bindings: []Binding{{SourceID: 12, Models: []string{"test-model"}}}}
	if err := store.save(&account); err != nil {
		t.Fatal(err)
	}
	migrated, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	first := migrated.snapshot().Accounts[7]
	if first.GatewayKey == "" || first.GatewayKey == first.VirtualKey || first.VirtualKey != account.VirtualKey || first.VirtualID != account.VirtualID || first.Bindings[0].SourceID != 12 {
		t.Fatal("migration lost bindings or exposed the internal Bifrost key")
	}
	assertGatewayKey(t, first.GatewayKey)
	reopened, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if reopened.snapshot().Accounts[7].GatewayKey != first.GatewayKey {
		t.Fatal("migration rotates the gateway key on every restart")
	}
}
