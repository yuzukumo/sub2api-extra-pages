package main

import "testing"

func TestLoadConfigContextPricingPolicy(t *testing.T) {
	for _, value := range []string{"", "false", "true", "0", "1", "invalid"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("LIMIT_CONTEXT_TO_FIRST_TIER", value)
			config, err := loadConfig()
			if value != "" && value != "true" && value != "false" {
				if err == nil {
					t.Fatal("invalid pricing policy was accepted")
				}
				return
			}
			if err != nil || config.LimitContextToFirstTier != (value != "false") {
				t.Fatalf("policy %q parsed incorrectly, enabled %t, error %v", value, config.LimitContextToFirstTier, err)
			}
		})
	}
}
