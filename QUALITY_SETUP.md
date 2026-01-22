# Automatic Quality Suite Setup

This project now includes a comprehensive automatic quality suite to prevent bad code and maintain consistency.

## Tools Installed

### 1. **ESLint** (The Police) ✅

- **Purpose**: Catches potential bugs and bad practices
- **Plugin Added**: `eslint-plugin-unused-imports` - Automatically removes unused imports
- **Configuration**: `eslint.config.mjs`
- **Commands**:
  - `npm run lint` - Check for linting errors
  - `npm run lint:fix` - Auto-fix linting errors

### 2. **Prettier** (The Stylist) ✅

- **Purpose**: Enforces consistent code formatting
- **Configuration**: `.prettierrc` and `.prettierignore`
- **Commands**:
  - `npm run format` - Format all files
  - `npm run format:check` - Check formatting without changing files

### 3. **Knip** (The Janitor) ✅

- **Purpose**: Finds unused files, components, and exports
- **Configuration**: `knip.json`
- **Commands**:
  - `npm run knip` - Scan for unused code
  - `npm run knip:fix` - Auto-fix unused exports (where possible)

### 4. **Husky** (The Gatekeeper) ✅

- **Purpose**: Runs linters before git commits
- **Configuration**: `.husky/pre-commit`
- **Behavior**: Automatically runs `lint-staged` before every commit
  - If linting fails, commit is blocked
  - Only staged files are checked/fixed

## Pre-commit Hook

Husky automatically runs `lint-staged` before every commit, which:

- Runs ESLint with auto-fix on staged `.ts`, `.tsx`, `.js`, `.jsx` files
- Runs Prettier on all staged files
- Blocks the commit if there are unfixable errors

## Quality Check Script

Run all quality checks at once:

```bash
npm run quality
```

This runs:

1. ESLint
2. Prettier (check mode)
3. TypeScript type checking
4. Knip (unused code detection)

## Configuration Files

- **ESLint**: `eslint.config.mjs`
- **Prettier**: `.prettierrc`, `.prettierignore`
- **Knip**: `knip.json`
- **Lint-staged**: `.lintstagedrc.json`
- **Husky**: `.husky/pre-commit`

## Notes

- **Type-aware ESLint rules**: Some TypeScript rules that require type information (`prefer-nullish-coalescing`, `prefer-optional-chain`) are disabled because they require additional parser configuration. They can be enabled later if needed.

- **Knip findings**: Knip may report some "unused" exports that are actually used (e.g., Next.js API routes, middleware). These are expected and can be ignored or added to `knip.json` ignore list.

- **Prettier formatting**: All files have been formatted with Prettier. Future changes will be automatically formatted on commit.

## Usage

1. **Before committing**: The pre-commit hook will automatically format and lint your code
2. **Manual checks**: Run `npm run quality` to check everything
3. **Auto-fix**: Run `npm run lint:fix` and `npm run format` to fix issues
4. **Clean up**: Run `npm run knip` periodically to find unused code
