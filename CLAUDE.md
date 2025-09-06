# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands for Development

### Essential Commands

```bash
# Start the CLI in development mode
npm start

# Run the full validation suite (REQUIRED before submitting changes)
npm run preflight

# Individual build and test commands
npm run build           # Build all packages
npm run test            # Run all tests
npm run lint            # Run ESLint
npm run typecheck       # TypeScript type checking
```

### Testing Commands

```bash
# Run specific test types
npm run test:e2e                    # End-to-end tests
npm run test:integration:all        # All integration tests

# Run a single test file (using Vitest)
npx vitest run path/to/test.test.ts
```

## High-Level Architecture

Catalyst is a monorepo with workspace packages:

1. **packages/cli** - Terminal UI built with React/Ink
   - Handles user interactions, command processing, and authentication
   - Uses functional components and React hooks exclusively
2. **packages/core** - Business logic and API interactions
   - Manages tools (file operations, shell, web fetch, etc.)
   - Handles API clients (Catalyst OAuth, OpenAI-compatible)
   - Session and conversation state management

3. **packages/vscode-ide-companion** - VSCode extension
   - IDE integration for enhanced features

## Code Style Guidelines

### TypeScript & JavaScript

- Use functional programming with plain objects and TypeScript interfaces (no classes)
- Prefer `unknown` over `any` for unknown types
- Use ES module syntax for encapsulation (public exports, private non-exports)
- Leverage array operators (.map, .filter, .reduce) for immutable data transformations
- Use `checkExhaustive` helper in switch statement default clauses

### React Components

- Only use functional components with hooks (no class components)
- Keep components pure and side-effect-free during rendering
- Use `useEffect` sparingly - only for synchronization with external state
- Never call setState inside useEffect
- Follow Rules of Hooks - call hooks unconditionally at top level
- Optimize for React Compiler - avoid manual memoization unless necessary

### Testing with Vitest

- Tests are co-located with source files (_.test.ts, _.test.tsx)
- Mock ES modules with `vi.mock('module-name', async (importOriginal) => {})`
- Place critical mocks (os, fs) at the very top of test files
- Use `vi.hoisted()` when mock functions need early definition
- Always include `vi.resetAllMocks()` in beforeEach

### Git Workflow

- Main branch: `main`
- Never include sensitive information in commits
- When fixing type errors or linting issues, make targeted changes without unnecessary conditions

## Important Notes

- The project uses Vitest for testing (not Jest)
- Flag names use hyphens, not underscores (e.g., `my-flag`)
- Avoid writing comments unless they provide high value
- The CLI binary is named `catalyst` and points to `bundle/catalyst.js`

## Development Guidelines

### Web Replication Strategy

- Always refer to the CLI to see how it's using the core package
- If unsure about any implementation details, carefully study the CLI's approach
- Goal is to exactly replicate CLI functionalities in the web interface
