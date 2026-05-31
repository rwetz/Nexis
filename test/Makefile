# Test Makefile — Nexis editor playground
# Exercises: phony targets, automatic variables, pattern rules, functions,
#            conditionals, includes, recursive make, multi-line variables

# ── Tool detection ────────────────────────────────────────────────────────────

SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c

# Detect OS
ifeq ($(OS),Windows_NT)
  DETECTED_OS := Windows
  NULL_DEV    := nul
  RM          := del /Q /F
  MKDIR       := mkdir
  SEP         := \\
else
  DETECTED_OS := $(shell uname -s)
  NULL_DEV    := /dev/null
  RM          := rm -rf
  MKDIR       := mkdir -p
  SEP         := /
endif

# ── Variables ─────────────────────────────────────────────────────────────────

APP      := nexis
VERSION  := $(shell cat package.json 2>$(NULL_DEV) | grep '"version"' | sed 's/.*"version": "\(.*\)".*/\1/' || echo "0.0.0")
BUILD_DIR := dist
SRC_DIR   := src
RUST_DIR  := src-tauri

# Flavour
PROFILE  ?= debug
ifeq ($(PROFILE),release)
  CARGO_FLAGS := --release
  CARGO_TARGET_DIR := $(RUST_DIR)/target/release
else
  CARGO_FLAGS :=
  CARGO_TARGET_DIR := $(RUST_DIR)/target/debug
endif

# Colours (only if stdout is a terminal)
ifdef TERM
  RED    := \033[0;31m
  GREEN  := \033[0;32m
  YELLOW := \033[1;33m
  CYAN   := \033[0;36m
  RESET  := \033[0m
else
  RED GREEN YELLOW CYAN RESET :=
endif

# ── Functions ─────────────────────────────────────────────────────────────────

# $(call log_step,label,message)
define log_step
	@printf '$(CYAN)[ %-12s ]$(RESET) %s\n' "$(1)" "$(2)"
endef

# $(call require_cmd,command)
define require_cmd
	@which $(1) >/dev/null 2>&1 || (echo "Error: '$(1)' not found in PATH"; exit 1)
endef

# $(call check_var,VAR_NAME)
define check_var
	@test -n "$($(1))" || (echo "Error: variable $(1) is not set"; exit 1)
endef

# ── Source discovery ──────────────────────────────────────────────────────────

TS_SOURCES  := $(shell find $(SRC_DIR) -name '*.ts' -o -name '*.tsx' 2>$(NULL_DEV))
RS_SOURCES  := $(shell find $(RUST_DIR)/src -name '*.rs' 2>$(NULL_DEV))
CSS_SOURCES := $(shell find $(SRC_DIR) -name '*.css' -o -name '*.scss' 2>$(NULL_DEV))

# Object files — pattern substitution
TS_OBJECTS  := $(patsubst $(SRC_DIR)/%.ts, $(BUILD_DIR)/%.js, $(TS_SOURCES))

# ── .PHONY ────────────────────────────────────────────────────────────────────

.PHONY: all build dev clean test lint fmt check typecheck audit help
.PHONY: rust-build rust-test rust-lint rust-fmt rust-check
.PHONY: release tag publish docker docker-push

.DEFAULT_GOAL := help

# ── Top-level targets ─────────────────────────────────────────────────────────

## all: Run format, lint, typecheck, test, then build
all: fmt lint typecheck test build

## build: Production build (frontend + Rust backend)
build: rust-build
	$(call log_step,build,Building frontend v$(VERSION))
	$(call require_cmd,pnpm)
	pnpm run build
	$(call log_step,build,$(GREEN)Done — output in $(BUILD_DIR)$(RESET))

## dev: Start development server
dev:
	$(call log_step,dev,Starting Tauri dev server)
	$(call require_cmd,pnpm)
	pnpm tauri dev

## clean: Remove build artifacts
clean:
	$(call log_step,clean,Removing $(BUILD_DIR) and Rust artifacts)
	$(RM) $(BUILD_DIR)
	cd $(RUST_DIR) && cargo clean
	$(call log_step,clean,$(GREEN)Clean$(RESET))

# ── Rust sub-targets ──────────────────────────────────────────────────────────

## rust-build: Compile Rust binary
rust-build:
	$(call log_step,rust,Compiling $(PROFILE) profile)
	$(call require_cmd,cargo)
	cd $(RUST_DIR) && cargo build $(CARGO_FLAGS) --locked

## rust-test: Run Rust tests
rust-test:
	$(call log_step,rust-test,Running tests)
	cd $(RUST_DIR) && cargo test --all-features 2>&1 | tee test-results.txt
	$(call log_step,rust-test,$(GREEN)All tests passed$(RESET))

## rust-lint: Run clippy
rust-lint:
	$(call log_step,clippy,Running Clippy)
	cd $(RUST_DIR) && cargo clippy --all-targets --all-features -- -D warnings

## rust-fmt: Format Rust code
rust-fmt:
	$(call log_step,rustfmt,Formatting)
	cd $(RUST_DIR) && cargo fmt --all

## rust-check: Fast check (no binary)
rust-check:
	$(call log_step,check,Checking $(RUST_DIR))
	cd $(RUST_DIR) && cargo check --all-features

# ── Frontend sub-targets ──────────────────────────────────────────────────────

## lint: Run ESLint
lint:
	$(call log_step,eslint,Linting)
	$(call require_cmd,pnpm)
	pnpm run lint

## fmt: Format with Prettier
fmt: rust-fmt
	$(call log_step,prettier,Formatting)
	pnpm run format

## typecheck: Run TypeScript compiler check
typecheck:
	$(call log_step,tsc,Type-checking)
	pnpm run typecheck

## test: Run all tests
test: rust-test
	$(call log_step,test,Running frontend tests)
	pnpm run test -- --run

## check: Full check without building
check: rust-check lint typecheck
	$(call log_step,check,$(GREEN)All checks passed$(RESET))

## audit: Security audit
audit:
	$(call log_step,audit,npm audit)
	pnpm audit
	cd $(RUST_DIR) && cargo audit

# ── Release ───────────────────────────────────────────────────────────────────

## release: Build release binary + installer
release: PROFILE = release
release: all
	$(call log_step,release,Building Tauri installer for $(VERSION))
	pnpm tauri build
	$(call log_step,release,$(GREEN)Installers in $(RUST_DIR)/target/release/bundle$(RESET))

## tag: Create annotated git tag for current version
tag:
	$(call log_step,tag,Tagging v$(VERSION))
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@echo "  push with: git push origin v$(VERSION)"

## publish: Tag + push + trigger GitHub Actions release
publish: tag
	$(call log_step,publish,Pushing tag v$(VERSION))
	git push origin "v$(VERSION)"

# ── Docker ────────────────────────────────────────────────────────────────────

IMAGE := ghcr.io/rwetz00/nexis
TAG   := $(VERSION)

## docker: Build Docker image
docker:
	$(call log_step,docker,Building $(IMAGE):$(TAG))
	$(call require_cmd,docker)
	docker build \
		--build-arg APP_VERSION=$(VERSION) \
		--build-arg BUILD_DATE=$(shell date -u +%Y-%m-%dT%H:%M:%SZ) \
		--build-arg GIT_COMMIT=$(shell git rev-parse --short HEAD) \
		--tag $(IMAGE):$(TAG) \
		--tag $(IMAGE):latest \
		.
	$(call log_step,docker,$(GREEN)Image built$(RESET))

## docker-push: Push Docker image to registry
docker-push: docker
	$(call log_step,docker-push,Pushing $(IMAGE):$(TAG))
	docker push $(IMAGE):$(TAG)
	docker push $(IMAGE):latest

# ── Pattern rules ─────────────────────────────────────────────────────────────

# Compile individual .ts → .js (example pattern — not actually invoked in this project)
$(BUILD_DIR)/%.js: $(SRC_DIR)/%.ts
	@$(MKDIR) $(dir $@)
	$(call log_step,tsc,$<)
	npx tsc --noEmit false --outDir $(BUILD_DIR) $<

# ── File generation ───────────────────────────────────────────────────────────

.env.example:
	$(call log_step,gen,$@)
	@printf '# Auto-generated by Makefile\nAPP_VERSION=$(VERSION)\n' > $@
	@cat .env.example.tpl >> $@ 2>$(NULL_DEV) || true

# ── Version targets ───────────────────────────────────────────────────────────

version:
	@echo $(VERSION)

bump-minor:
	$(call require_cmd,npm)
	npm version minor --no-git-tag-version
	@echo "Bumped to $$(cat package.json | grep '"version"' | sed 's/.*: "\(.*\)".*/\1/')"

# ── Info ──────────────────────────────────────────────────────────────────────

info:
	@echo "  APP:      $(APP)"
	@echo "  VERSION:  $(VERSION)"
	@echo "  OS:       $(DETECTED_OS)"
	@echo "  PROFILE:  $(PROFILE)"
	@echo "  SOURCES:  $(words $(TS_SOURCES)) TS, $(words $(RS_SOURCES)) RS"

## help: Show this help message
help:
	@echo ""
	@echo "  $(CYAN)Nexis Makefile$(RESET) — v$(VERSION)"
	@echo ""
	@grep -E '^## [a-zA-Z_-]+:' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS="## |: "}{ printf "  $(GREEN)%-18s$(RESET) %s\n", $$2, $$3 }'
	@echo ""
	@echo "  $(YELLOW)Variables:$(RESET)"
	@echo "    PROFILE=debug|release (default: debug)"
	@echo ""
