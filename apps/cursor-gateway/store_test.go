package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
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
