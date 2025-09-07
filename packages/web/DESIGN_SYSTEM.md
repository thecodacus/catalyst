# Catalyst Design System

## Design Philosophy

Catalyst embodies a modern, sophisticated aesthetic that balances professional elegance with developer-friendly functionality. Our design system emphasizes clarity, efficiency, and delight through thoughtful motion and visual hierarchy.

### Core Principles

1. **Clarity First** - Information hierarchy guides users naturally through complex workflows
2. **Subtle Sophistication** - Refined details without ostentation
3. **Fluid Motion** - Smooth animations that feel natural and purposeful
4. **Dark-First Design** - Optimized for long coding sessions with reduced eye strain
5. **Contextual Feedback** - Every interaction provides clear, immediate response

## Color Palette

### Primary Colors

#### Brand Colors
- **Primary**: `#6366F1` (Indigo-500) - Main brand color for CTAs and key interactions
- **Primary Light**: `#818CF8` (Indigo-400) - Hover states and highlights
- **Primary Dark**: `#4F46E5` (Indigo-600) - Active states and emphasis

#### Semantic Colors
- **Success**: `#10B981` (Emerald-500) - Successful operations, completions
- **Warning**: `#F59E0B` (Amber-500) - Warnings, caution states
- **Error**: `#EF4444` (Red-500) - Errors, destructive actions
- **Info**: `#3B82F6` (Blue-500) - Informational messages

### Neutral Colors

#### Light Mode
- **Background**: `#FFFFFF` - Main background
- **Surface**: `#F9FAFB` - Cards, elevated surfaces
- **Border**: `#E5E7EB` - Subtle borders
- **Text Primary**: `#111827` - Main text
- **Text Secondary**: `#6B7280` - Secondary text
- **Text Muted**: `#9CA3AF` - Disabled/muted text

#### Dark Mode (Primary)
- **Background**: `#0A0A0B` - Main background (near black)
- **Surface**: `#18181B` - Cards, elevated surfaces
- **Surface Elevated**: `#27272A` - Modals, dropdowns
- **Border**: `#27272A` - Subtle borders
- **Border Elevated**: `#3F3F46` - More prominent borders
- **Text Primary**: `#FAFAFA` - Main text
- **Text Secondary**: `#A1A1AA` - Secondary text
- **Text Muted**: `#71717A` - Disabled/muted text

### Accent Colors

For syntax highlighting and data visualization:
- **Cyan**: `#06B6D4` - Keywords, functions
- **Purple**: `#A855F7` - Strings, special values
- **Green**: `#22C55E` - Comments, success states
- **Yellow**: `#EAB308` - Warnings, highlights
- **Pink**: `#EC4899` - Errors, important notices

## Typography

### Font Stack
```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace;
```

### Type Scale
- **xs**: 0.75rem (12px) - Captions, labels
- **sm**: 0.875rem (14px) - Secondary text
- **base**: 1rem (16px) - Body text
- **lg**: 1.125rem (18px) - Subheadings
- **xl**: 1.25rem (20px) - Section headers
- **2xl**: 1.5rem (24px) - Page titles
- **3xl**: 1.875rem (30px) - Hero text
- **4xl**: 2.25rem (36px) - Display text

### Font Weights
- **Regular**: 400 - Body text
- **Medium**: 500 - Emphasis
- **Semibold**: 600 - Headers
- **Bold**: 700 - Strong emphasis

## Spacing System

Using a consistent 4px grid:
- **0.5**: 2px
- **1**: 4px
- **2**: 8px
- **3**: 12px
- **4**: 16px
- **6**: 24px
- **8**: 32px
- **12**: 48px
- **16**: 64px
- **24**: 96px

## Animation Guidelines

### Core Animation Principles

1. **Purpose-Driven** - Every animation serves a functional purpose
2. **Performance-First** - Prefer transform and opacity for 60fps
3. **Easing Functions** - Use natural, physics-based easing
4. **Timing** - Fast enough to feel responsive, slow enough to be perceived

### Animation Durations

- **Instant**: 100ms - Hover states, small transitions
- **Fast**: 200ms - Opening dropdowns, tooltips
- **Normal**: 300ms - Page transitions, sliding panels
- **Slow**: 500ms - Complex transitions, first-load animations

### Easing Functions

```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Common Animations

#### Micro-interactions
- **Hover**: Scale(1.02) with 100ms ease-out
- **Active**: Scale(0.98) with 100ms ease-out
- **Focus**: Box-shadow expansion with 200ms ease-out

#### Page Transitions
- **Fade In**: Opacity 0→1, translateY 10px→0, 300ms ease-out
- **Slide In**: TranslateX 100%→0, 300ms ease-out
- **Scale Fade**: Scale 0.95→1, opacity 0→1, 300ms ease-out

#### Loading States
- **Skeleton**: Shimmer effect moving left to right
- **Spinner**: Smooth rotation with ease-linear
- **Progress**: Width transition with ease-out

#### Content Reveals
- **Stagger Children**: 50ms delay between items
- **Accordion**: Height auto with 300ms ease-in-out
- **Modal**: Scale 0.95→1, opacity 0→1, backdrop blur

## Component Styling

### Buttons

#### Primary Button
- Background: Primary color
- Hover: Brightness +10%, slight scale
- Active: Scale down, darker shade
- Disabled: Opacity 50%

#### Secondary Button
- Background: Transparent
- Border: 1px Border color
- Hover: Background surface color
- Active: Background surface darker

### Cards

- Background: Surface color
- Border: 1px Border color
- Shadow: 0 1px 3px rgba(0,0,0,0.1)
- Hover: Slight y-translation, enhanced shadow
- Border-radius: 8px (0.5rem)

### Inputs

- Background: Transparent
- Border: 1px Border color
- Focus: Primary color border, subtle glow
- Border-radius: 6px (0.375rem)
- Padding: 12px 16px

### Code Blocks

- Background: Surface color
- Border: 1px Border color
- Font: Monospace
- Syntax highlighting: Using accent colors
- Border-radius: 6px (0.375rem)

## Layout Patterns

### Container Widths
- **xs**: 475px
- **sm**: 640px
- **md**: 768px
- **lg**: 1024px
- **xl**: 1280px
- **2xl**: 1536px

### Grid System
- 12-column grid
- Gap: 16px (default)
- Responsive breakpoints align with container widths

## Accessibility

### Focus States
- Clear focus indicators (2px offset outline)
- High contrast mode support
- Keyboard navigation optimization

### Motion Preferences
- Respect `prefers-reduced-motion`
- Provide motion-free alternatives
- Essential animations only in reduced mode

### Color Contrast
- WCAG AAA compliance for text
- Clear distinction between interactive elements
- Multiple visual cues beyond color alone

## Implementation Examples

### CSS Variables
```css
:root {
  /* Colors */
  --color-background: #0A0A0B;
  --color-surface: #18181B;
  --color-primary: #6366F1;
  
  /* Animations */
  --animation-fast: 200ms;
  --animation-normal: 300ms;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

### Tailwind Extensions
```js
// Extend Tailwind with custom animations
animation: {
  'fade-in': 'fadeIn 300ms ease-out',
  'slide-up': 'slideUp 300ms ease-out',
  'scale-in': 'scaleIn 200ms ease-out',
}
```

### Framer Motion Presets
```js
export const animations = {
  fadeIn: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 }
  },
  slideIn: {
    initial: { x: -20, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    transition: { duration: 0.3, ease: [0, 0, 0.2, 1] }
  }
}
```

## Best Practices

1. **Performance**: Prefer CSS transitions for simple animations
2. **Consistency**: Use design tokens everywhere
3. **Restraint**: Not everything needs animation
4. **Testing**: Test animations on lower-end devices
5. **Accessibility**: Always provide reduced-motion alternatives

This design system creates a cohesive, modern experience that feels premium while maintaining excellent usability and performance.