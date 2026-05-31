package main

import (
	"context"
)

// App struct representing the Go application controller
type App struct {
	ctx context.Context
}

// NewApp creates a new App controller instance
func NewApp() *App {
	return &App{}
}

// startup is called at application startup to save the context reference
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}
