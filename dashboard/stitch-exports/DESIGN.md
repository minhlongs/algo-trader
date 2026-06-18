# Design System — CashClaw Negative Risk Scanner

## Theme
- Color mode: DARK
- Font: INTER
- Roundness: ROUND_FOUR
- Custom color: #06b6d4
- Headline font: INTER
- Body font: INTER
- Label font: JETBRAINS_MONO

## Named Colors
{
  "background": "#051424",
  "error": "#ffb4ab",
  "error_container": "#93000a",
  "inverse_on_surface": "#233143",
  "inverse_primary": "#00687a",
  "inverse_surface": "#d4e4fa",
  "on_background": "#d4e4fa",
  "on_error": "#690005",
  "on_error_container": "#ffdad6",
  "on_primary": "#003640",
  "on_primary_container": "#00424f",
  "on_primary_fixed": "#001f26",
  "on_primary_fixed_variant": "#004e5c",
  "on_secondary": "#263143",
  "on_secondary_container": "#aeb9d0",
  "on_secondary_fixed": "#111c2d",
  "on_secondary_fixed_variant": "#3c475a",
  "on_surface": "#d4e4fa",
  "on_surface_variant": "#bcc9cd",
  "on_tertiary": "#4b2800",
  "on_tertiary_container": "#5b3200",
  "on_tertiary_fixed": "#2d1600",
  "on_tertiary_fixed_variant": "#6a3b00",
  "outline": "#869397",
  "outline_variant": "#3d494c",
  "primary": "#4cd7f6",
  "primary_container": "#06b6d4",
  "primary_fixed": "#acedff",
  "primary_fixed_dim": "#4cd7f6",
  "secondary": "#bcc7de",
  "secondary_container": "#3e495d",
  "secondary_fixed": "#d8e3fb",
  "secondary_fixed_dim": "#bcc7de",
  "surface": "#051424",
  "surface_bright": "#2c3a4c",
  "surface_container": "#122131",
  "surface_container_high": "#1c2b3c",
  "surface_container_highest": "#273647",
  "surface_container_low": "#0d1c2d",
  "surface_container_lowest": "#010f1f",
  "surface_dim": "#051424",
  "surface_tint": "#4cd7f6",
  "surface_variant": "#273647",
  "tertiary": "#ffb873",
  "tertiary_container": "#e89337",
  "tertiary_fixed": "#ffdcbf",
  "tertiary_fixed_dim": "#ffb873"
}

## Style Guidelines
## Brand & Style
The design system focuses on high-precision data density and "Negative Risk" scanning, requiring a visual language that feels secure, analytical, and authoritative. The brand personality is professional and clinical, designed to reduce cognitive load during high-stakes financial monitoring.

The design style is **Corporate / Modern** with a lean toward **Minimalism**. It prioritizes clarity through a strict hierarchy, using the dark Slate base to minimize eye strain. Visual interest is generated through precise Cyan accents and purposeful data visualization rather than decorative elements. The UI should evoke a sense of "command and control," providing users with an immediate grasp of complex risk metrics.

## Layout & Spacing
The layout follows a **Fluid Grid** model optimized for data density. The standard spacing unit is 4px, creating a tight, efficient rhythm.

- **Dashboard Layout:** A 12-column grid with 16px gutters. In the desktop view, a fixed left sidebar (240px) contains primary navigation, while the main content area expands to fill the viewport.
- **Padding:** Use "md" (16px) for standard card padding to maximize the data visible on screen.
- **Responsive Behavior:** 
  - **Desktop:** Multi-column layouts for stat cards and side-by-side data tables.
  - **Tablet:** 12-column grid collapses to 8 columns; charts move above tables.
  - **Mobile:** 4-column grid; tables transition to a "card-list" format where horizontal scrolling is minimized.

## Elevation & Depth
In this dark UI, depth is communicated through **Tonal Layers** rather than heavy shadows.

- **Level 0 (Background):** Slate-950 (#0f172a). The lowest layer.
- **Level 1 (Cards/Sidebar):** Slate-900 (#1e293b). Elevated slightly with a 1px border of Slate-800 to define edges.
- **Level 2 (Modals/Popovers):** Slate-800 (#1e293b) with a subtle Cyan-tinted ambient shadow (`box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4)`).
- **Interactions:** Hover states on table rows use a subtle background shift to Slate-800, providing immediate feedback without breaking the visual plane.

## Components
- **Stat Cards:** Feature a "data-mono" large figure, a small Sparkline chart (Cyan or Red), and a percentage change label. 
- **Data Tables:** Highly condensed. Headers are "label-caps". Rows include a subtle 1px border-bottom. Row-level actions (e.g., "Scan", "Ignore") appear as Cyan icon-buttons on hover.
- **Buttons:**
  - **Primary:** Solid Cyan-500 with Slate-950 text.
  - **Secondary:** Outlined with Cyan-500 or Slate-700.
- **Sliders:** For risk thresholds, use a Cyan track with a Slate-50 circular thumb.
- **Navigation:** A sleek top header for global search and profile, with a vertical sidebar for primary tools (Scanner, Portfolio, History, Settings).
- **Risk Indicators:** Small, circular badges (Chips) using semantic colors with a 10% opacity background of the same color for high legibility (e.g., Red text on a faint Red tint).
