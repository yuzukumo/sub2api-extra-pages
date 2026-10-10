package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	c, err := loadConfig()
	if err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
	store, err := openStore(c.DataDir)
	if err != nil {
		slog.Error("Unable to open state", "error", err)
		os.Exit(1)
	}
	s := newServer(c, store)
	server := &http.Server{Addr: c.Address, Handler: s.routes(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go s.catalog.run(ctx)
	go func() {
		<-ctx.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	slog.Info("Cursor Gateway listening", "address", c.Address)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("Server stopped", "error", err)
		os.Exit(1)
	}
}
