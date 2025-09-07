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

## Authentication Patterns

### API Route Protection

The web package uses a consistent authentication pattern for protecting API routes:

#### Using withAuth Middleware
```typescript
// ✅ CORRECT - Use withAuth middleware for protected routes
import { withAuth } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, user) => {
    // user contains: { userId, email?, plan? }
    // Your protected logic here
  });
}
```

#### Authentication Flow
1. **JWT Token Storage**: Tokens are stored in HTTP-only cookies named `auth-token`
2. **API Requests**: Frontend sends JWT in Authorization header: `Bearer <token>`
3. **Middleware**: `withAuth` validates token and provides user info to handlers
4. **Database Access**: Use `user.userId` to query user-specific data

#### GitHub OAuth Integration
- OAuth flow initiated at `/api/auth/github`
- Callback handled at `/api/auth/github/callback`
- GitHub access tokens stored encrypted in user document
- Use `User.findById(userId).select('+githubAccessToken')` to retrieve

#### Common Patterns
```typescript
// Protected route with database access
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, user) => {
    await connectToDatabase();
    
    // Access user data
    const fullUser = await User.findById(user.userId);
    
    // Your logic here
    return NextResponse.json(data);
  });
}

// Optional authentication
import { optionalAuth } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  return optionalAuth(request, async (req, user) => {
    // user can be null here
    if (user) {
      // Authenticated logic
    } else {
      // Public logic
    }
  });
}
```

#### Important Notes
- Never implement custom session management - use `withAuth`
- Don't access cookies directly in API routes (except auth routes)
- Always use `connectToDatabase()` before database operations
- GitHub tokens require explicit selection: `.select('+githubAccessToken')`

## Design System Guidelines (Web Package)

### File Locations
- **Design Tokens**: `/packages/web/styles/design-tokens.css` - All CSS variables
- **Tailwind Theme**: `/packages/web/styles/tailwind-theme.css` - Tailwind CSS v4 mappings
- **Animation Variants**: `/packages/web/lib/animation-variants.ts` - Framer Motion variants
- **Animation Hooks**: `/packages/web/hooks/use-animation.ts` - Custom animation hooks
- **Animated Components**: `/packages/web/components/ui/animated.tsx` - Reusable components

### Core Design Principles
- **Dark-first design** optimized for long coding sessions
- **No hardcoded values** - always use CSS variables from design tokens
- **Smooth animations** - 60fps performance using transform/opacity
- **Accessibility first** - respect prefers-reduced-motion
- **Consistent spacing** - use 4px grid system (space-1 = 4px, space-2 = 8px, etc.)

### Color Usage
```tsx
// ✅ GOOD - Using design tokens
<div className="bg-surface border-border text-primary" />
<button className="bg-brand-500 hover:bg-brand-600" />

// ❌ BAD - Hardcoded values
<div className="bg-gray-100 border-gray-200 text-gray-900" />
<button className="bg-blue-500 hover:bg-blue-600" />
```

### Available Color Variables (from design-tokens.css)
- **Brand**: `brand-50` through `brand-950`
- **Grays**: `gray-50` through `gray-950`
- **Semantic**: `success`, `warning`, `error`, `info`
- **Theme**: `background`, `surface`, `border`, `text-primary`, `text-secondary`, `text-muted`

### Spacing System
Always use spacing tokens based on 4px grid:
```tsx
// ✅ GOOD
<div className="p-4 mt-6 gap-3" />  // 16px, 24px, 12px

// ❌ BAD
<div className="p-[18px] mt-[25px] gap-[13px]" />
```

**Available spacing values**: 0, px, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24

### Component Examples
```tsx
// Card pattern
<div className="bg-surface border border-border rounded-lg shadow-sm p-6">
  <h3 className="text-lg font-semibold text-primary mb-2">Title</h3>
  <p className="text-secondary">Content</p>
</div>

// Button pattern
<button className="
  bg-primary hover:bg-primary-hover active:scale-[0.98]
  text-primary-foreground font-medium
  px-4 py-2 rounded-lg
  transition-all duration-fast
">Button</button>

// Input pattern
<input className="
  bg-transparent border border-border focus:border-primary
  rounded-md px-3 py-2
  outline-none focus:ring-2 focus:ring-primary/20
  transition-colors duration-fast
" />
```

### Animation Components (from animated.tsx)
```tsx
// Simple animations
import { Animated, Skeleton, Spinner, Staggered } from '@/components/ui/animated';

// Available animations: 'fade-in', 'fade-in-up', 'fade-in-down', 'scale-in', 'slide-in-left', 'slide-in-right'
<Animated animation="fade-in-up" delay={100}>
  <Card />
</Animated>

// Loading states
<Skeleton variant="text" />  // variants: 'text', 'circular', 'rectangular'
<Spinner size="md" />        // sizes: 'sm', 'md', 'lg'

// Staggered lists
<Staggered staggerDelay={50}>
  {items.map(item => <div key={item.id}>{item.name}</div>)}
</Staggered>
```

### Animation Variants (from animation-variants.ts)
Available preset animations:
- `fadeIn`, `fadeInUp`, `fadeInDown`
- `scaleIn`, `scaleInCenter`
- `slideInRight`, `slideInLeft`, `slideInBottom`
- `modalOverlay`, `modalContent`
- `drawerLeft`, `drawerRight`
- `tooltip`, `pulse`, `spin`, `bounce`

### Essential CSS Variables
Key variables defined in `design-tokens.css`:
- **Colors**: `--color-background`, `--color-surface`, `--color-primary`, `--color-text-primary`
- **Spacing**: `--space-1` through `--space-24`
- **Radius**: `--radius-sm` (2px), `--radius-md` (6px), `--radius-lg` (8px), `--radius-xl` (12px)
- **Shadows**: `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Animation Durations**: `--duration-instant` (100ms), `--duration-fast` (200ms), `--duration-normal` (300ms)
- **Easings**: `--ease-in`, `--ease-out`, `--ease-in-out`, `--ease-spring`

### Animation Hooks (from use-animation.ts)
```tsx
import { useReducedMotion, useInView, useScrollAnimation } from '@/hooks/use-animation';

// Available hooks:
const prefersReducedMotion = useReducedMotion();
const isInView = useInView(ref);
const isScrolled = useScrollAnimation(100);
const delays = useStaggeredAnimation(itemCount, 50);
const springValue = useSpring(targetValue);
```
