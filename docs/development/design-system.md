---
icon: custom/design-system
---

# Design System

AXIS uses a consistent design system built on Tailwind CSS with a custom color palette, reusable component patterns, and standardized Plotly chart defaults. This page is the reference for all UI conventions.

---

## Color Palette

The color palette is driven by CSS custom properties, making it theme-aware. The default palette is **Sage Green**. See [Theming](../configuration/theming.md) for how to switch palettes or create custom ones.

### Primary Colors

| Token | Default (Sage Green) | Usage |
|-------|---------------------|-------|
| `primary` | `#8B9F4F` | Sidebar, primary buttons, chart accents |
| `primary-light` | `#A4B86C` | Hover states, interactive highlights |
| `primary-dark` | `#6B7A3A` | Headers, emphasis text, dark accents |
| `primary-soft` | `#B8C78A` | Soft backgrounds, selected states |
| `primary-pale` | `#D4E0B8` | Subtle backgrounds, card tints |

### Accent Colors

| Token | Value | Usage |
|-------|-------|-------|
| `accent-gold` | `#D4AF37` | Call-to-action highlights, premium indicators |
| `accent-silver` | `#B8C5D3` | Secondary accents, muted borders |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `success` | `#27AE60` | Passing status, positive indicators |
| `warning` | `#F39C12` | Caution states, threshold warnings |
| `error` | `#E74C3C` | Failing status, error messages |

### Text Colors

| Token | Value | Usage |
|-------|-------|-------|
| `text-primary` | `#2C3E50` | Headings, primary content |
| `text-secondary` | `#34495E` | Body text, descriptions |
| `text-muted` | `#7F8C8D` | Labels, captions, secondary info |

### UI Surface Colors

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#FAFBFC` | Page background |
| `surface` | `#FFFFFF` | Cards, panels, modals |
| `border` | `#E1E5EA` | Card borders, dividers |

### Using Colors in Tailwind

Colors are registered in `tailwind.config.ts` via CSS custom properties. Use them directly in class names:

```html
<!-- Background -->
<div class="bg-primary">...</div>
<div class="bg-primary/10">...</div>     <!-- 10% opacity -->

<!-- Text -->
<span class="text-text-primary">Heading</span>
<span class="text-text-muted">Caption</span>

<!-- Border -->
<div class="border border-border">...</div>

<!-- Status -->
<span class="text-success">Passed</span>
<span class="text-error">Failed</span>
```

---

## Typography

| Style | Font | Usage |
|-------|------|-------|
| **Sans** | Inter, system-ui, sans-serif | All UI text |
| **Mono** | JetBrains Mono, monospace | Code blocks, data values |

Tailwind classes: `font-sans` (default), `font-mono`.

---

## Component Patterns

### Compact KPI Strip

Use this pattern for at-a-glance metrics at the top of dashboard pages. This is the preferred style -- avoid oversized stat cards with `text-4xl/5xl`.

```html
<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
  <!-- Repeat for each KPI -->
  <div class="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3">
    <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
      <Icon class="h-[18px] w-[18px] text-primary" />
    </div>
    <div>
      <div class="text-xl font-bold text-text-primary">1,234</div>
      <div class="text-xs text-text-muted">Total Items</div>
    </div>
  </div>
</div>
```

Key characteristics:

- `flex items-center gap-3` layout (icon + text side by side)
- `text-xl font-bold` for values (not `text-4xl`)
- `text-xs text-text-muted` for labels
- 9x9 icon container with `bg-primary/10` tint
- `border border-border` outline
- Responsive grid: 2 columns on mobile, 4 on large screens

### Chart Container

All Plotly charts are wrapped in a bordered container with a header bar:

```html
<div class="overflow-hidden rounded-lg border border-border bg-white">
  <div class="border-b border-border px-4 py-2">
    <h3 class="text-sm font-medium text-text-primary">Chart Title</h3>
  </div>
  <div class="px-2 py-2">
    <!-- Plotly chart here -->
  </div>
</div>
```

Key characteristics:

- `rounded-lg border border-border` outer container
- Header row: `border-b border-border px-4 py-2` with `text-sm font-medium` title
- Chart area: `px-2 py-2` padding around the plot
- `overflow-hidden` to clip rounded corners

### Pagination Controls

Inline pagination with pill-style page buttons. Used on tables and card lists.

```html
<div class="flex items-center justify-between border-t border-border px-1 pt-3">
  <span class="text-xs text-text-muted">
    Showing 1-15 of 73 items
  </span>
  <div class="flex items-center gap-1">
    <!-- Previous button -->
    <button class="rounded-md px-2 py-1 text-text-muted hover:bg-gray-100">
      <ChevronLeft />
    </button>

    <!-- Page numbers -->
    <button class="rounded-md px-2.5 py-1 text-xs font-medium bg-primary text-white">1</button>
    <button class="rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-gray-100">2</button>

    <!-- Next button -->
    <button class="rounded-md px-2 py-1 text-text-muted hover:bg-gray-100">
      <ChevronRight />
    </button>
  </div>
</div>
```

Behavioral rules:

- Reset `currentPage` to 1 when filters change (via `useEffect` on filter values)
- Hide pagination entirely when `totalPages <= 1`
- Show at most 5 page buttons centered around the current page
- Active page: `bg-primary text-white`; inactive: `text-text-muted hover:bg-gray-100`

### Severity Card

Used for hard stops, error details, and alert cards. A left-accent border conveys severity without overwhelming red backgrounds.

```html
<div class="rounded-lg border border-l-4 border-border border-l-red-400 bg-white p-4">
  <h4 class="text-sm font-semibold text-text-primary">Card Title</h4>
  <p class="mt-1 text-xs text-text-muted">Subtitle or timestamp</p>
  <p class="mt-2 text-sm text-text-secondary">Description or body content.</p>
  <div class="mt-3 flex gap-2">
    <span class="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
      Critical
    </span>
    <span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-text-muted">
      Category
    </span>
  </div>
</div>
```

Key characteristics:

- `border-l-4 border-l-red-400` left accent (not an all-red background)
- White background (`bg-white`)
- Neutral text colors for titles and body
- Metadata pills: subtle red (`bg-red-50 text-red-600`) or neutral (`bg-gray-100 text-text-muted`)

### Scrollable Column

Used for grouped content lists (decision quality, batch details) to prevent page stretching.

```html
<div class="rounded-lg border border-border bg-white p-4">
  <div class="mb-3 flex items-center gap-2">
    <Icon class="h-4 w-4 text-primary" />
    <h3 class="text-sm font-semibold text-text-primary">Section Title</h3>
    <span class="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
      12
    </span>
  </div>
  <div class="max-h-[500px] space-y-2 overflow-y-auto">
    <!-- Scrollable items here -->
  </div>
</div>
```

Key characteristics:

- `max-h-[500px] overflow-y-auto` on the content area
- Count badge in the header with `ml-auto`
- `space-y-2` gap between items
- Bordered outer container

---

## Spacing Conventions

### Page Layout

| Element | Class | Value |
|---------|-------|-------|
| Content padding (vertical) | `py-6` | 24px |
| Section gaps | `space-y-5` | 20px |
| Card padding | `p-4` | 16px |
| Header bar padding | `px-4 py-2` | 16px / 8px |

### Common Spacing

| Context | Class | Value |
|---------|-------|-------|
| Inline element gap | `gap-2` | 8px |
| Card group gap | `gap-3` | 12px |
| Section gap | `gap-4` | 16px |
| Component padding | `p-4` or `p-5` | 16px or 20px |

### Rounded Corners

| Context | Class |
|---------|-------|
| Cards, containers | `rounded-lg` |
| Tables, modals | `rounded-xl` |
| Hero sections | `rounded-2xl` |
| Badges, pills | `rounded-full` |

---

## Plotly Chart Defaults

All Plotly charts in AXIS should use these standardized defaults for consistent appearance.

### Layout Defaults

```ts
const defaultLayout = {
  autosize: true,
  margin: { l: 50, r: 30, t: 30, b: 50 },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: {
    family: 'Inter, system-ui, sans-serif',
  },
  colorway: ChartColors,
};
```

### Axis Configuration

Apply to both `xaxis` and `yaxis` for consistent grid styling:

```ts
const axisConfig = {
  showgrid: true,
  gridcolor: 'rgba(0,0,0,0.05)',
  zeroline: false,
  showline: true,
  linecolor: 'rgba(0,0,0,0.1)',
  tickfont: { size: 10 },
};
```

Usage:

```ts
layout: {
  xaxis: { ...axisConfig, showgrid: false },
  yaxis: { ...axisConfig, automargin: true },
}
```

### Chart Height

| Context | Height | Margin top |
|---------|--------|-----------|
| Dashboard summary charts | `180px` | `t: 5` |
| Full-page charts | `300-400px` | `t: 30` |
| Detail/modal charts | `250px` | `t: 20` |

When a chart is inside a `ChartContainer` with its own header, set `t: 5` to avoid double spacing.

### Chart Color Sequence

The `ChartColors` array is defined in `types/index.ts` and used as the default `colorway`:

```ts
const ChartColors = [
  '#8B9F4F',  // primary (sage green)
  '#A4B86C',  // primary-light
  '#6B7A3A',  // primary-dark
  '#B8C78A',  // primary-soft
  '#D4AF37',  // accent-gold
  '#B8C5D3',  // accent-silver
  '#D4E0B8',  // primary-pale
  '#1f77b4',  // blue
  '#ff7f0e',  // orange
  '#2ca02c',  // green
];
```

For single-series charts, use `ChartColors[0]` (`#8B9F4F`). For multi-series, Plotly cycles through `colorway` automatically.

### Plotly Config

Disable unnecessary toolbar buttons for a cleaner look:

```ts
const plotlyConfig = {
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: [
    'lasso2d',
    'select2d',
    'autoScale2d',
  ],
  responsive: true,
};
```

---

## CSS Utility Classes

These custom classes are defined in `frontend/src/app/globals.css`:

| Class | Description |
|-------|------------|
| `.card` | Base card: `rounded-xl`, border, shadow |
| `.card-interactive` | Card with hover elevation transition |
| `.card-glass` | Glassmorphism card with backdrop blur |
| `.badge-success` | Green status badge |
| `.badge-warning` | Yellow status badge |
| `.badge-error` | Red status badge |

!!! note "`.stat-card` is deprecated"
    The `.stat-card` class with oversized centered numbers is deprecated. Use the **Compact KPI Strip** pattern instead.

---

## Responsive Breakpoints

AXIS uses Tailwind's default breakpoints:

| Prefix | Min Width | Usage |
|--------|-----------|-------|
| `sm` | 640px | Stack to row transitions |
| `md` | 768px | Tablet layout adjustments |
| `lg` | 1024px | Desktop layouts, 4-column grids |
| `xl` | 1280px | Wide desktop optimizations |
| `2xl` | 1536px | Ultra-wide monitors |

Common responsive patterns:

```html
<!-- 2 cols mobile, 4 cols desktop -->
<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">

<!-- Stack on mobile, side-by-side on desktop -->
<div class="flex flex-col gap-4 lg:flex-row">

<!-- Full width mobile, constrained desktop -->
<div class="w-full lg:max-w-[600px]">
```

---

## Related Pages

- [Theming](../configuration/theming.md) -- switch palettes, create custom themes, branding assets
- [Code Conventions](code-conventions.md) -- file naming and component structure patterns
- [Architecture: Frontend](../architecture/frontend.md) -- component organization and state management
