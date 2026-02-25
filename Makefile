.PHONY: help install setup lint lint-fix format test dev clean docs-install docs-serve docs-build docs-deploy

# Default target
help:
	@echo "AXIS Monorepo - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install       Install all dependencies and pre-commit hooks"
	@echo "  make setup         Copy .example config files for first-time setup"
	@echo "  make install-hooks Install pre-commit hooks only"
	@echo ""
	@echo "Linting & Formatting:"
	@echo "  make lint          Run all linters (no auto-fix)"
	@echo "  make lint-fix      Run all linters with auto-fix"
	@echo "  make format        Format all code"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run all tests"
	@echo "  make test-backend  Run backend tests only"
	@echo "  make test-frontend Run frontend tests only"
	@echo ""
	@echo "Development:"
	@echo "  make dev           Start development servers"
	@echo "  make dev-backend   Start backend server only"
	@echo "  make dev-frontend  Start frontend server only"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean         Clean cache and build artifacts"
	@echo "  make typecheck     Run type checkers"
	@echo ""
	@echo "Documentation:"
	@echo "  make docs-install  Install doc dependencies"
	@echo "  make docs-serve    Preview docs at localhost:8000"
	@echo "  make docs-build    Build docs (strict mode)"
	@echo "  make docs-deploy   Deploy docs to GitHub Pages"

# =============================================================================
# SETUP
# =============================================================================

setup:
	@bash scripts/setup-config.sh

install: install-hooks setup
	@echo "Installing backend dependencies..."
	cd backend && pip install -r requirements.txt
	cd backend && pip install ruff mypy pandas-stubs
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Done! All dependencies installed."

install-hooks:
	@echo "Installing pre-commit hooks..."
	pre-commit install
	@echo "Pre-commit hooks installed."

# =============================================================================
# LINTING & FORMATTING
# =============================================================================

lint:
	@echo "=== Backend Linting ==="
	cd backend && ruff check app
	cd backend && ruff format --check app
	@echo ""
	@echo "=== Frontend Linting ==="
	cd frontend && npm run lint
	cd frontend && npx prettier --check "src/**/*.{js,jsx,ts,tsx,json,css,md}"

lint-fix:
	@echo "=== Backend Lint Fix ==="
	cd backend && ruff check --fix app
	cd backend && ruff format app
	@echo ""
	@echo "=== Frontend Lint Fix ==="
	cd frontend && npm run lint -- --fix
	cd frontend && npx prettier --write "src/**/*.{js,jsx,ts,tsx,json,css,md}"

format:
	@echo "=== Backend Format ==="
	cd backend && ruff format app
	@echo ""
	@echo "=== Frontend Format ==="
	cd frontend && npx prettier --write "src/**/*.{js,jsx,ts,tsx,json,css,md}"

# =============================================================================
# TYPE CHECKING
# =============================================================================

typecheck:
	@echo "=== Backend Type Check ==="
	cd backend && mypy app --ignore-missing-imports
	@echo ""
	@echo "=== Frontend Type Check ==="
	cd frontend && npx tsc --noEmit

# =============================================================================
# TESTING
# =============================================================================

test: test-backend test-frontend

test-backend:
	@echo "=== Backend Tests ==="
	cd backend && pytest tests -v

test-frontend:
	@echo "=== Frontend Tests ==="
	cd frontend && npm run test -- --run

test-e2e:
	@echo "=== E2E Tests ==="
	cd frontend && npm run test:e2e

# =============================================================================
# DEVELOPMENT
# =============================================================================

dev:
	@echo "Starting development servers..."
	@echo "Backend: http://localhost:8500"
	@echo "Frontend: http://localhost:3500"
	@make -j2 dev-backend dev-frontend

dev-backend:
	cd backend && uvicorn app.main:app --reload --port 8500

dev-frontend:
	cd frontend && npm run dev

# =============================================================================
# UTILITIES
# =============================================================================

clean:
	@echo "Cleaning cache and build artifacts..."
	rm -rf backend/.ruff_cache
	rm -rf backend/.mypy_cache
	rm -rf backend/.pytest_cache
	rm -rf backend/__pycache__
	rm -rf frontend/.next
	rm -rf frontend/node_modules/.cache
	@echo "Clean complete."

# Pre-commit on all files
pre-commit-all:
	pre-commit run --all-files

# =============================================================================
# DOCUMENTATION
# =============================================================================

docs-install:
	@echo "Installing documentation dependencies..."
	pip install mkdocs-material "mkdocstrings[python]" mkdocs-git-revision-date-localized-plugin mkdocs-redirects
	@echo "Documentation dependencies installed."

docs-serve:
	@echo "Starting documentation server at http://localhost:8000..."
	mkdocs serve

docs-build:
	@echo "Building documentation..."
	mkdocs build --strict

docs-deploy:
	@echo "Deploying documentation to GitHub Pages..."
	mkdocs gh-deploy --force
