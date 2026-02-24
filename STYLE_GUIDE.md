# BoardBrawl: Modern Medieval Style Guide

This project follows a "Modern Medieval" design aesthetic. It prioritizes clean, readable modern layouts with medieval flavor added through texture, framing, ornaments, and iconography.

## 1. Color Palette

The application uses a warm parchment base with restrained gold and green accents.

| Color | Variable | Hex/Value | Usage |
| :--- | :--- | :--- | :--- |
| **Paper** | `--color-paper` | `#f4efe5` | Primary background |
| **Paper 2** | `--color-paper-2` | `#efe7da` | Secondary/Warm background |
| **Ink** | `--color-ink` | `#191613` | Primary text |
| **Muted** | `--color-muted` | `rgba(25, 22, 19, 0.62)` | Secondary/Subtle text |
| **Gold** | `--color-gold` | `#b8923b` | Primary accent / Icons |
| **Gold 2** | `--color-gold-2` | `rgba(184, 146, 59, 0.45)` | Lines, borders, and glows |
| **Green** | `--color-green` | `#2f6b4f` | Success states / Primary buttons |
| **Border** | `--color-border` | `rgba(25, 22, 19, 0.14)` | Primary component borders |
| **Surface** | `--color-surface` | `rgba(255, 255, 255, 0.62)` | Card/panel background (warmer than pure white) |
| **Surface 2** | `--color-surface-2` | `rgba(244, 239, 229, 0.65)` | Subtle elevated surfaces on parchment (inputs, inner panels) |

**Palette Rules**
- **Green is reserved for “Primary Actions”** only (e.g., Get Started, Create Tournament, Add Play). Do not use green for decorative accents.
- **Gold is decorative/semantic** (icons, dividers, selected states), not a primary button fill.
- Avoid pure #000 and pure #fff. Use `--color-ink` and `--color-surface` instead.

## 2. Typography

- **Font Family (UI):** [Inter](https://rsms.me/inter/) (all UI by default).
- **Display Serif (Optional, Headings Only):** Use a modern serif with subtle medieval DNA (e.g., Fraunces / Cormorant Garamond / EB Garamond) for H1/H2 on marketing pages and key app headings.
  - Rule: Serif is for *headline moments*, not dense UI or tables.
- **The "Engraved" Look:** Achieved via CSS utility class `.engraved`.
  - `letter-spacing: 0.05em;`
  - `text-shadow: 0.5px 0.5px 0px rgba(255, 255, 255, 0.5);`
  - *Note: Natural casing is preferred. Avoid forced uppercase for long strings.*
- **Minimum Font Size:** Never go below **14px**. In our Tailwind configuration:
  - `text-xs`: 14px (0.875rem)
  - `text-sm`: 15px (0.9375rem)
  - `text-base`: 16px (1rem)
- **Numeric Data:** Use the `.tabular` class for columns of numbers to ensure vertical alignment.
  - `font-variant-numeric: tabular-nums;`

## 3. Visual Texture (The Three Layers)

The background is composed of three layered CSS effects:
1. **Base Parchment:** Multi-radial + linear gradients for warmth.
2. **Grain Overlay (`body::before`):** A fractal noise SVG as a data-URI with `mix-blend-mode: multiply`.
3. **Linen/Vignette (`body::after`):** Repeating line gradients for "manuscript" texture and a radial vignette.

**Watermark Icon Rules (Background Ornamentation)**
- Use **2–4 large watermark icons max** per page/section (crown/shield/die/meeple).
- Place them intentionally near corners or section edges (not evenly tiled).
- Keep opacity extremely low; slight blur is allowed to feel “embedded in paper”.
- Do not mix many different icon styles. Use the same stroke weight and family.

## 4. Interactions (The "Feel")

To maintain a consistent physical feel, all interactive elements follow these rules:

- **The Medieval Lift:** All interactive cards and buttons must shift upwards on hover.
  - CSS: `hover:translate-y-[-2px]`
  - Shadow: Use `shadow-main` on hover for cards.
- **Transitions:** Use `transition: all 0.2s ease-out` for a responsive but weighted feel.
- **Feedback:**
    - Hover states for cards/buttons include a subtle border change to `var(--color-gold-2)`.
    - **Action Icons:** Small action icons (Edit, Trash, Save, Cancel) should be `text-muted` by default and transition to `text-gold` (or `text-red-600` for destructive actions) on hover.
    - **Touch Devices:** Hover actions (like Edit/Trash icons) must be permanently visible on mobile devices where hover is not possible.

**Depth Tokens (Consistency)**
- Use a small set of shadows consistently across the entire product:
  - `shadow-soft`: default for cards/panels
  - `shadow-main`: hover/active lift
- Avoid mixing many shadow styles across components.

## 5. Mobile-First Refinements

1. **Sticky Header Padding:** Reduce vertical padding on mobile (`py-4` vs `py-6`) to maximize content area.
2. **Primary Actions:** Use a fixed bottom container for the primary page action (e.g., "Add Game Session") on mobile to keep it within thumb reach. Remove background blur/fill on this container to allow content to flow behind it.
3. **Hit Targets:** Ensure entire cards are clickable for selection tasks (e.g., summoning players for a game) to provide large, accessible touch targets.
4. **Input Stacking:** In complex forms (like adding/editing players), stack controls vertically on mobile (e.g., Color Selector above Name Input) while maintaining a horizontal layout on desktop.
5. **Table Stability:** Use `table-fixed` and explicit column widths for ledgers. Hide non-essential decorative elements (like sorting arrows or expansion chevrons) on mobile if they compromise the primary data columns.

## 6. Components & Utilities

### Global Header / Navigation
A single header pattern should be reusable across marketing and app pages.

**Logged OUT (Marketing)**
- Left: logo + mark
- Middle: a small set of links (Features/About/Login)
- Right: **Primary CTA = Get Started Free** (`btn-medieval-primary`)
- Mobile: hamburger menu; CTA remains visible or appears as the first item in the menu.

**Logged IN (App)**
- Left: logo + mark
- Middle: app nav items (Tournaments / Stats / Library / Plays) with icons
- Right: primary CTA becomes the page’s main action (e.g., **New Tournament** or **Add Play**), plus user/avatar menu.
- Mobile: hamburger menu; icons remain (do not remove icons for the app nav).

### Page Frame
Apply `.page-frame` to the top-level container of any page to add a subtle fixed border glow.

### Section Divider Ornament (Marketing + Key App Sections)
Use a thin ink line with a small centered crest mark to separate major sections.
- Purpose: add medieval flavor while staying minimalist.
- Keep it subtle: `--color-gold-2` or `--color-border`.

### Cards (`.card-medieval`)
- Use **Surface** backgrounds (avoid pure white).
- Soft shadows + subtle borders.
- Beveled effect via inset highlights.
- **Interactive Variant:** Use `.card-medieval-interactive` for clickable cards.
- **Content Constraint:** Use `truncate` (1 line) or `line-clamp-2` (2 lines) to prevent content from expanding card heights unexpectedly.

### Table Shell (`.table-shell`)
Wraps tables to give them an "inlaid board" look. Tables should use `text-base` for data cells and `text-sm` for headers. Ensure tables are wrapped in `overflow-x-auto`.

### Inline Editing
When switching from static text to an input/textarea:
- Match the height and padding of the static text to prevent layout shift.
- Use `bg-paper/50` for inputs on the parchment background to blend them in.
- Display character counters for fields with strict limits.

### Buttons
- **Primary:** Green-tinted gradient (`btn-medieval-primary`).
  - Rule: Green = primary action only.
- **Secondary/Standard:** Subtle white-to-parchment gradient (`btn-medieval`).
- **Implementation:** Always use the `Button` component from `@/components/ui/button`.

### Marketing “3 Pillars” Pattern (Landing Page)
When summarizing the product value, use three simple pillars:
- **Run the Night**
- **Track Everything**
- **Show Your Collection**
These should appear before a longer feature grid (if used).

## 7. Implementation Rules

1. **Icons:** Use `stroke-width: 2` (icons from Lucide). Inherit `currentColor`.
2. **Icon Selection:** Use distinct icons for different concepts (e.g., `User` for Free-for-all, `Users` for Teams).
3. **Decoration:** Use pseudo-elements (`::before`/`::after`) for ornaments to keep them separate from content.
4. **Spacing:** Maintain clean, modern white space despite the medieval decorations.
5. **Casing:** Use Sentence Case or Title Case for headers. Avoid full `uppercase` transforms.
6. **Character Limits:**
    - **Tournament Names:** Max 25 characters.
    - **Tournament Descriptions:** Max 60 characters.
    - **Player Names:** Max 20 characters.

## 8. Virtual Shelf (Library) Realism Guidelines

The virtual shelf should feel like a real Kallax-inspired display without becoming “3D fantasy”.

**Lighting**
- Choose a single lighting direction (recommended: **top-left**) and apply consistently:
  - Slight left-to-right or top-to-bottom gradient on surfaces.
  - Highlights and shadows must agree with the direction.

**Shelf Frame Material**
- Add a subtle wood texture to the outer frame (keep grain restrained).
- Add a gentle gradient (slightly lighter on the lit side) to fake ambient light.

**Cubby Depth**
- Each cubby should have a subtle inner shadow (recessed feeling).
- The back panel should have a slight vignette/gradient to imply depth.

**Game Boxes**
- Add a soft drop shadow per box to avoid “sticker” feel.
- Reduce corner radius: aim for very slight rounding (~2px). Avoid overly rounded corners.
- Optional: a 1px edge highlight on the lit side of spines for separation.

