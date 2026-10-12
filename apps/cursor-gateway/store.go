package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"errors"
	"maps"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Store struct {
	mu     sync.RWMutex
	state  State
	dir    string
	cipher cipher.AEAD
}

func openStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	keyPath := filepath.Join(dir, "encryption.key")
	key, err := os.ReadFile(keyPath)
	if errors.Is(err, os.ErrNotExist) {
		key = make([]byte, 32)
		if _, err = rand.Read(key); err != nil {
			return nil, err
		}
		if err = os.WriteFile(keyPath, key, 0600); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	s := &Store{dir: dir, cipher: aead, state: State{Accounts: map[int64]Account{}}}
	data, err := os.ReadFile(filepath.Join(dir, "state.enc"))
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if len(data) < aead.NonceSize() {
		return nil, errors.New("invalid encrypted state")
	}
	plain, err := aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], []byte("cursor-gateway-v1"))
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(plain, &s.state); err != nil {
		return nil, err
	}
	if s.state.Accounts == nil {
		s.state.Accounts = map[int64]Account{}
	}
	changed := false
	for id, account := range s.state.Accounts {
		if account.VirtualKey == "" || account.GatewayKey != "" {
			continue
		}
		value, err := generateGatewayKey()
		if err != nil {
			return nil, err
		}
		account.GatewayKey = value
		s.state.Accounts[id] = account
		changed = true
	}
	if changed {
		return s, s.saveState(nil, time.Now(), true)
	}
	if err := s.save(nil); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) snapshot() State {
	s.mu.RLock()
	defer s.mu.RUnlock()
	data, _ := json.Marshal(s.state)
	var result State
	_ = json.Unmarshal(data, &result)
	return result
}

func (s *Store) save(account *Account) error {
	return s.saveAt(account, time.Now())
}

func (s *Store) saveAt(account *Account, now time.Time) error {
	return s.saveState(account, now, false)
}

func (s *Store) saveState(account *Account, now time.Time, force bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := json.Marshal(s.state)
	if err != nil {
		return err
	}
	var next State
	if err := json.Unmarshal(data, &next); err != nil {
		return err
	}
	if account != nil {
		copy := *account
		copy.ContextOverrides = maps.Clone(account.ContextOverrides)
		next.Accounts[account.User.ID] = copy
	}
	changed := account != nil || force
	for id, a := range next.Accounts {
		if reconcileContextOverrides(&a, now) {
			next.Accounts[id] = a
			changed = true
		}
	}
	if !changed {
		return nil
	}
	plain, err := json.Marshal(next)
	if err != nil {
		return err
	}
	nonce := make([]byte, s.cipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return err
	}
	sealed := s.cipher.Seal(nonce, nonce, plain, []byte("cursor-gateway-v1"))
	tmp, err := os.CreateTemp(s.dir, "state-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(sealed); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), filepath.Join(s.dir, "state.enc")); err != nil {
		return err
	}
	s.state = next
	if account != nil {
		account.ContextOverrides = maps.Clone(next.Accounts[account.User.ID].ContextOverrides)
	}
	return nil
}
