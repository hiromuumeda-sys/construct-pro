/**
 * CONSTRUCT_PRO - Stitch Design System Configuration
 * Based on: Lumina Soft-Modern Design System (Material Design 3)
 *
 * Color Palette:
 *   - Primary: #104356 (Refined Teal)
 *   - Secondary: #a33c2d (Muted Terracotta)
 *   - Tertiary: #57360e (Warm Brown)
 *   - Surfaces: Warm neutrals (#faf9f7, #efeeec, etc.)
 *
 * Typography: Inter (400-700) + Noto Sans JP
 * Spacing: 8px linear scale (4px, 8px, 16px, 24px, 40px, 64px)
 * Rounding: Medium roundness (8px-16px)
 */

tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Surface Colors (Soft Cream/Warm Neutrals)
        surface: "#faf9f7",
        "surface-bright": "#faf9f7",
        "surface-dim": "#dadad8",
        "surface-tint": "#376478",
        background: "#faf9f7",

        // Surface Containers (Layering)
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f4f3f1",
        "surface-container": "#efeeec",
        "surface-container-high": "#e9e8e6",
        "surface-container-highest": "#e3e2e0",
        "surface-variant": "#e3e2e0",

        // Primary Colors (Refined Teal)
        primary: "#104356",
        "on-primary": "#ffffff",
        "primary-container": "#2d5a6e",
        "on-primary-container": "#a3d0e7",
        "primary-fixed": "#bfe9ff",
        "primary-fixed-dim": "#a0cde4",
        "on-primary-fixed": "#001f2a",
        "on-primary-fixed-variant": "#1d4c5f",
        "inverse-primary": "#a0cde4",

        // Secondary Colors (Muted Terracotta)
        secondary: "#a33c2d",
        "on-secondary": "#ffffff",
        "secondary-container": "#ff816d",
        "on-secondary-container": "#731a0f",
        "secondary-fixed": "#ffdad4",
        "secondary-fixed-dim": "#ffb4a7",
        "on-secondary-fixed": "#400100",
        "on-secondary-fixed-variant": "#832519",

        // Tertiary Colors (Warm Brown)
        tertiary: "#57360e",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#724d23",
        "on-tertiary-container": "#f3c08c",
        "tertiary-fixed": "#ffdcbc",
        "tertiary-fixed-dim": "#f0bd89",
        "on-tertiary-fixed": "#2c1700",
        "on-tertiary-fixed-variant": "#623f16",

        // Text Colors
        "on-surface": "#1a1c1b",
        "on-surface-variant": "#41484c",
        "on-background": "#1a1c1b",
        "inverse-surface": "#2f3130",
        "inverse-on-surface": "#f1f1ef",

        // Outline Colors (Soft Borders)
        outline: "#71787c",
        "outline-variant": "#c1c7cc",

        // Error States
        error: "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a"
      },

      borderRadius: {
        DEFAULT: "0.25rem",      // 4px for minimal rounding
        lg: "0.5rem",            // 8px for small elements (buttons, inputs)
        xl: "12px",              // 12px for standard components
        "2xl": "16px",           // 16px for large cards/containers
        full: "9999px"           // Pill-shaped (chips, badges)
      },

      spacing: {
        base: "4px",              // Smallest increment
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",               // Primary spacing unit
        xl: "40px",
        xxl: "64px",
        gutter: "24px",           // Grid gutter
        "container-padding": "32px" // Main content padding
      },

      fontFamily: {
        sans: ["Inter", "Noto Sans JP", "sans-serif"]
      },

      typography: {
        DEFAULT: {
          css: {
            "font-family": ["Inter", "Noto Sans JP", "sans-serif"],
            "line-height": "1.5"
          }
        }
      }
    }
  }
};
