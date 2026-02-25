---
icon: custom/contributing
---

# Contributing

Thank you for your interest in contributing to AXIS.

## Getting Started

1. Fork the repository and clone your fork
2. Follow the [development setup guide](development/setup.md) to configure your environment
3. Create a feature branch from `master`

## Development Workflow

```bash
# Install dependencies and pre-commit hooks
make install

# Start development servers
make dev

# Run linters before committing
make lint-fix

# Run tests
make test
```

## Code Standards

- **Backend**: Follow the [code conventions](development/code-conventions.md) for Python/FastAPI
- **Frontend**: Follow the [code conventions](development/code-conventions.md) for TypeScript/Next.js
- **Design**: Follow the [design system](development/design-system.md) for UI components

## Pull Request Process

1. Ensure all linters pass: `make lint`
2. Ensure all type checks pass: `make typecheck`
3. Ensure all tests pass: `make test`
4. Update documentation if your change affects user-facing behavior
5. Submit a pull request against `master`

## Pre-commit Hooks

The repository uses [pre-commit](https://pre-commit.com/) to run automated checks on every commit:

| Hook | Purpose |
|------|---------|
| Trailing whitespace | Remove trailing whitespace |
| End-of-file fixer | Ensure files end with newline |
| YAML/JSON validation | Check syntax |
| Large file detection | Prevent accidental large commits |
| Merge conflict detection | Catch unresolved conflicts |
| Private key detection | Prevent credential leaks |
| Ruff lint + format | Python code quality |
| Prettier | Frontend formatting |
| ESLint | Frontend linting |

## Reporting Issues

Open an issue on GitHub with:

- A clear description of the problem or feature request
- Steps to reproduce (for bugs)
- Expected vs. actual behavior
- Environment details (OS, Python version, Node version)
