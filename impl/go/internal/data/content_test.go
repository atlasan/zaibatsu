package data

import "testing"

func TestLoadProvidesOptionalContentCollections(t *testing.T) {
	data, err := LoadDefault("speedrunners")
	if err != nil {
		t.Fatalf("LoadDefault: %v", err)
	}
	if data.ControlCards == nil || data.Threats == nil || data.Missions == nil {
		t.Fatal("optional content collections must be initialized")
	}
	if len(data.Modes) != 1 || data.Modes[0].ID != data.Mode.ID {
		t.Fatalf("modes fallback = %#v, want primary mode", data.Modes)
	}
}
