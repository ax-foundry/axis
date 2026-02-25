---
icon: custom/theming
---

# Theming

AXIS ships with a configurable design system that controls colors, branding assets, and the hero section appearance. You can customize the look through a YAML palette, environment variables, or a combination of both.

---

## Built-in Palettes

Two palettes are available out of the box:

=== "Sage Green"

    | Token | Hex | Preview |
    |-------|-----|---------|
    | `primary` | `#8B9F4F` | |
    | `primaryLight` | `#A4B86C` | |
    | `primaryDark` | `#6B7A3A` | |
    | `primarySoft` | `#B8C78A` | |
    | `primaryPale` | `#D4E0B8` | |
    | `accentGold` | `#D4AF37` | |
    | `accentSilver` | `#B8C5D3` | |

    Natural, approachable, growth-oriented. Suitable for internal tooling and
    technical audiences.

=== "Professional Blue (default)"

    | Token | Hex | Preview |
    |-------|-----|---------|
    | `primary` | `#3D5A80` | |
    | `primaryLight` | `#5C7AA3` | |
    | `primaryDark` | `#2B3C73` | |
    | `primarySoft` | `#8BA4C4` | |
    | `primaryPale` | `#C5D4E8` | |
    | `accentGold` | `#D4AF37` | |
    | `accentSilver` | `#B8C5D3` | |

    Trust, stability, expertise. Designed for enterprise clients and investor
    presentations.

---

## Customization Methods

### Option A: YAML File (Full Control)

The YAML approach lets you define complete palettes with branding assets. This is the recommended method for production deployments.

**Step 1** -- Copy the template:

```bash
cp backend/config/theme.yaml.example custom/config/theme.yaml
```

**Step 2** -- Edit `custom/config/theme.yaml` to set your active palette and define custom palettes:

```yaml title="custom/config/theme.yaml"
theme:
  active: "acme_corp"

  palettes:
    # Keep the built-ins if you want to switch back
    sage_green:
      name: "Sage Green"
      primary: "#8B9F4F"
      primaryLight: "#A4B86C"
      primaryDark: "#6B7A3A"
      primarySoft: "#B8C78A"
      primaryPale: "#D4E0B8"
      accentGold: "#D4AF37"
      accentSilver: "#B8C5D3"

    # Your custom branded palette
    acme_corp:
      name: "Acme Corporation"
      primary: "#1E3A5F"
      primaryLight: "#2E5A8F"
      primaryDark: "#0F2A4F"
      primarySoft: "#5E8ABF"
      primaryPale: "#B8D0E8"
      accentGold: "#C9A227"
      accentSilver: "#A8B8C8"
      heroImage: "/api/config/assets/branding/acme-hero.jpg"
      logoUrl: "/api/config/assets/branding/acme-logo.svg"
      faviconUrl: "/api/config/assets/branding/acme-favicon.ico"
      appIconUrl: "/api/config/assets/branding/acme-icon.png"
      heroContrast: 0.85
      heroSaturation: 0.9
      heroBrightness: 1.1
      heroOpacity: 0.95
      heroMode: "dark"
```

**Step 3** -- Restart the backend to load the new theme.

### Option B: Environment Variables (Quick Overrides)

Environment variables let you change the active palette or override individual colors without creating a YAML file. This is useful for CI/CD pipelines or quick experiments.

```env title="backend/.env"
# Switch to a different built-in palette
AXIS_THEME_ACTIVE=professional_blue

# Or override individual colors on the active palette
AXIS_THEME_PRIMARY=#1E3A5F
AXIS_THEME_PRIMARY_DARK=#0F2A4F
AXIS_THEME_HERO_IMAGE=/api/config/assets/branding/custom-hero.jpg
AXIS_THEME_LOGO_URL=/api/config/assets/branding/custom-logo.png
```

!!! info "Precedence: YAML base + env var overrides"
    When both a YAML file and `AXIS_THEME_*` env vars are present, the YAML
    palette is loaded first as the base, then env vars override individual
    values within the active palette. This means you can define a full palette
    in YAML and tweak one color at deploy time via an env var.

### Option C: Combining Both

A common pattern is to define your branded palette in YAML and use env vars for per-environment tweaks:

```yaml title="custom/config/theme.yaml"
theme:
  active: "acme_corp"
  palettes:
    acme_corp:
      name: "Acme Corporation"
      primary: "#1E3A5F"
      primaryLight: "#2E5A8F"
      primaryDark: "#0F2A4F"
      primarySoft: "#5E8ABF"
      primaryPale: "#B8D0E8"
      accentGold: "#C9A227"
      accentSilver: "#A8B8C8"
      heroImage: "/api/config/assets/branding/acme-hero.jpg"
      logoUrl: "/api/config/assets/branding/acme-logo.svg"
```

```env title="backend/.env (staging override)"
# Use a different hero image in staging
AXIS_THEME_HERO_IMAGE=/api/config/assets/branding/staging-banner.jpg
AXIS_THEME_HERO_OPACITY=0.7
```

---

## Color Token Reference

Every palette consists of the following color tokens. These are applied across the entire UI -- sidebar, headers, buttons, charts, and status indicators.

| Token | Usage |
|-------|-------|
| `primary` | Main brand color. Sidebar, primary buttons, chart accents |
| `primaryLight` | Hover states, interactive highlights |
| `primaryDark` | Headers, emphasis text, dark accents |
| `primarySoft` | Soft backgrounds, selected states |
| `primaryPale` | Subtle backgrounds, card tints |
| `accentGold` | Call-to-action highlights, premium indicators |
| `accentSilver` | Secondary accents, muted borders |

---

## Branding Assets

### Asset Paths

Branding fields (`heroImage`, `logoUrl`, `faviconUrl`, `appIconUrl`) accept either:

- **Absolute URLs**: `https://cdn.example.com/logo.png`
- **Backend asset proxy paths** (recommended): `/api/config/assets/branding/logo.png`

### Backend Asset Proxy

The backend serves branding files from `custom/branding/` through a dedicated endpoint:

```
GET /api/config/assets/branding/{filename}
```

This is the **recommended approach** for referencing branding assets because it works consistently across all environments:

- **Local development**: The Next.js dev server rewrites `/api/config/assets/*` requests to the backend at port 8500, so assets resolve automatically.
- **Production**: Your reverse proxy (Nginx, Vercel, etc.) routes `/api/*` to the backend, so the same paths work without any changes.

Using `/api/config/assets/branding/*` paths eliminates the need to manage symlinks or worry about how static files are served in different deployment targets.

### Branding Assets in `custom/branding/`

Place branding images in `custom/branding/`. They are served by the backend asset proxy at `/api/config/assets/branding/`.

```
custom/branding/
  hero.jpg        --> accessible at /api/config/assets/branding/hero.jpg
  logo.svg        --> accessible at /api/config/assets/branding/logo.svg
  ax-icon.png     --> accessible at /api/config/assets/branding/ax-icon.png
  favicon.ico     --> accessible at /api/config/assets/branding/favicon.ico
```

For local development, `make setup` also creates a symlink (`frontend/public/branding -> ../../custom/branding`) so that `/branding/*` paths work directly through Next.js static serving. However, using the `/api/config/assets/branding/*` paths is preferred because they work in both local and production environments without additional setup.

To use a custom hero image:

1. Place the image file in `custom/branding/`.
2. Reference it in your theme config:

    ```yaml
    heroImage: "/api/config/assets/branding/my-hero.jpg"
    ```

!!! tip "Cache behavior"
    Branding images served through the asset proxy get a 1-year immutable cache header. Use filename changes (not overwrites) when updating assets.

### Recommended Asset Sizes

| Asset | Format | Recommended Size |
|-------|--------|------------------|
| Hero image | JPG, PNG, WebP | 1920x400 or wider |
| Logo | SVG, PNG | 200x50 (landscape) |
| Favicon | ICO, PNG | 32x32 or 16x16 |
| App icon | PNG, SVG | 40x40 (square) |

---

## Hero Image Filters

The hero section supports CSS-based image filters to adjust the appearance of your background image without editing the source file.

| Filter | Default | Description |
|--------|---------|-------------|
| `heroContrast` | `1.0` | Contrast level. Values below 1.0 reduce contrast |
| `heroSaturation` | `1.0` | Color saturation. Values below 1.0 desaturate toward grayscale |
| `heroBrightness` | `1.0` | Brightness level. Values below 1.0 darken the image |
| `heroOpacity` | `1.0` | Opacity. Values below 1.0 make the image semi-transparent |
| `heroMode` | `dark` | `dark` uses a dark overlay; `light` uses a white background |

Example -- a subtle, professional hero:

```yaml
heroContrast: 0.85
heroSaturation: 0.8
heroBrightness: 1.0
heroOpacity: 0.9
heroMode: "dark"
```

---

## Fork / White-Label Checklist

When deploying AXIS as a white-labeled product, follow this checklist:

- [ ] Create `custom/config/theme.yaml` with your branded palette
- [ ] Set `theme.active` to your custom palette name
- [ ] Place logo, favicon, app icon, and hero image in `custom/branding/`
- [ ] Set `heroImage`, `logoUrl`, `faviconUrl`, and `appIconUrl` in the palette
- [ ] Adjust hero filters (`heroContrast`, `heroSaturation`, etc.) to match your brand
- [ ] Update `APP_NAME` in `backend/.env` if you want a different name in the API docs
- [ ] Test both light and dark mode in the frontend to verify contrast

---

## Full Environment Variable Reference

For quick reference, here are all `AXIS_THEME_*` variables. See [Environment Variables](environment-variables.md) for the complete table.

| Variable | Type | Description |
|----------|------|-------------|
| `AXIS_THEME_ACTIVE` | `str` | Active palette name |
| `AXIS_THEME_PRIMARY` | `str` | Primary color (hex) |
| `AXIS_THEME_PRIMARY_LIGHT` | `str` | Primary light (hex) |
| `AXIS_THEME_PRIMARY_DARK` | `str` | Primary dark (hex) |
| `AXIS_THEME_PRIMARY_SOFT` | `str` | Primary soft (hex) |
| `AXIS_THEME_PRIMARY_PALE` | `str` | Primary pale (hex) |
| `AXIS_THEME_ACCENT_GOLD` | `str` | Accent gold (hex) |
| `AXIS_THEME_ACCENT_SILVER` | `str` | Accent silver (hex) |
| `AXIS_THEME_HERO_IMAGE` | `str` | Hero background image |
| `AXIS_THEME_LOGO_URL` | `str` | Logo image |
| `AXIS_THEME_FAVICON_URL` | `str` | Favicon |
| `AXIS_THEME_APP_ICON_URL` | `str` | Sidebar app icon |
| `AXIS_THEME_HERO_CONTRAST` | `float` | Contrast filter |
| `AXIS_THEME_HERO_SATURATION` | `float` | Saturation filter |
| `AXIS_THEME_HERO_BRIGHTNESS` | `float` | Brightness filter |
| `AXIS_THEME_HERO_OPACITY` | `float` | Opacity |
| `AXIS_THEME_HERO_MODE` | `str` | `dark` or `light` |

---

## Related

- [YAML Configs](yaml-configs.md) -- full YAML file schema including theme palette fields
- [Environment Variables](environment-variables.md) -- complete env var reference
- [Configuration Overview](index.md) -- precedence rules and file layout
