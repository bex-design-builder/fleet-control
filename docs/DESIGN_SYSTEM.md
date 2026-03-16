# Design system – variables and text styles

This project’s design tokens and text styles live in **`src/index.css`**. Use this file as the single source of truth so rebranding and style changes ripple across the app.

---

## 1. How variables are organized

Variables are grouped in **numbered sections** in `:root`:

| Section | Purpose | Naming pattern | Example |
|--------|---------|----------------|---------|
| **1. Brand palette** | Colours you change to rebrand | `--color-brand-*`, `--color-danger*` | `--color-brand-green` |
| **2. Typography** | Font family, sizes, weights, line heights | `--font-family-*`, `--font-size-*`, `--font-weight-*`, `--line-height-*` | `--font-size-body`, `--font-weight-semibold` |
| **3. Surfaces & neutrals** | Backgrounds and text roles | `--bg-*`, `--text-*` | `--bg-panel`, `--text-primary` |
| **4. Borders, radii, shadows** | Shape and depth | `--border-*`, `--radius-*`, `--shadow-*` | `--radius-panel`, `--shadow-btn` |
| **5. Focus & interaction** | Buttons, hover, focus | `--focus-*`, `--btn-*`, `--hover-*`, `--overlay-*` | `--btn-bg-hover`, `--focus-ring` |
| **6. Glass panels** | Floating panels | `--glass-*` | `--glass-bg`, `--glass-border` |

**Recommendations:**

- **Don’t use raw values** (e.g. `#34a853`, `14px`) in component CSS. Use tokens: `var(--accent-green)`, `var(--font-size-body)`.
- **Prefer semantic names** in components: `--text-primary`, `--btn-bg`, not `--gray-100`.
- **Keep brand in one place**: only the “Brand palette” block holds hex/rgba for brand colours; everything else references those or other tokens.

---

## 2. Typography variables

Use these in component CSS so type stays consistent and easy to change.

**Font family**

- `--font-family-base` – Use for body and most UI (already set on `body`).

**Scale (sizes)**

- `--font-size-xs` (11px) – Fine print, captions.
- `--font-size-sm` (12px) – Labels, metadata.
- `--font-size-body` (14px) – Default body and inputs.
- `--font-size-body-lg` (15px) – Slightly larger body/titles.
- `--font-size-title-sm` (13px) – Small titles/labels.
- `--font-size-title` (15px) – Card/section titles.
- `--font-size-heading` (20px) – Panel/section headings.
- `--font-size-heading-lg` (22px) – Large headings.
- `--font-size-icon-sm` (20px) – Small icon size.

**Weights**

- `--font-weight-light` (300)
- `--font-weight-regular` (400)
- `--font-weight-medium` (500)
- `--font-weight-semibold` (600)
- `--font-weight-bold` (700)
- `--font-weight-heavy` (800)

**Line heights**

- `--line-height-tight` (1)
- `--line-height-snug` (1.2)
- `--line-height-normal` (1.3)
- `--line-height-relaxed` (1.4)
- `--line-height-body` (1.45)

**Example in a component:**

```css
.my-panel-title {
  font-size: var(--font-size-title);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-snug);
  color: var(--text-primary);
}
```

---

## 3. Text style classes

For a full “text style” in one class, use the `.ds-text-*` utilities (defined in `index.css`):

| Class | Use for |
|-------|--------|
| `.ds-text-caption` | Fine print, timestamps, small labels |
| `.ds-text-label` | Form labels, metadata |
| `.ds-text-body` | Default body copy |
| `.ds-text-body-semibold` | Emphasised body |
| `.ds-text-title-sm` | Small titles (e.g. list row title) |
| `.ds-text-title` | Card/section title |
| `.ds-text-heading` | Panel/section heading |
| `.ds-text-heading-lg` | Large heading |

**Example:**

```jsx
<h2 className="ds-text-heading">Vehicles</h2>
<span className="ds-text-caption">Last updated 2m ago</span>
```

You can still use the **variables** in your own component CSS when you need a custom combination (e.g. body size + heavy weight).

---

## 4. Changing brand colours

Edit only the **Brand palette** block in `src/index.css`:

- `--color-brand-green`, `--color-brand-green-light`, `--color-brand-green-pill-bg`, `--color-brand-green-pill-text`
- Same four for **purple** and **blue**.
- `--color-danger`, `--color-danger-hover` for alerts/primary actions.

All accents, avatars, pills, and danger UI use these via semantic tokens; no need to search the rest of the app for hex values.

---

## 5. Optional: spacing scale

If you want consistent spacing, you can add a scale to `index.css` and use it in components:

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 20px;
--space-2xl: 24px;
```

Then use `padding: var(--space-md)` etc. instead of random `12px` / `16px` values.
