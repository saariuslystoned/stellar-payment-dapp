# Git Commit & Branching Standards

## Branching Strategy
- **main**: Production-ready code.
- **dev**: Integration branch for ongoing development.
- **feature/name**: New feature branches (e.g., `feature/smoky-token`).
- **fix/issue**: Bug fix branches (e.g., `fix/escrow-refund`).

## Commit Messages
Format: `type(scope): subject`

Types:
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only
- **style**: Formatting, missing semi-colons, etcs
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **test**: Adding or correcting tests
- **chore**: Tooling, build process, or library changes

Example: `feat(token): implement SMOKY issuance logic`

## Pull Requests
- All PRs must target `dev` first.
- PRs must pass CI (linting, tests) before merge.
- Use the **GitHub MCP Server** to create and manage PRs.
