import type { Config } from "tailwindcss";

// Namespaced tokens (--ct-*) and preflight disabled on purpose: the redesign
// coexists with the existing CSS (legacy app/globals.css) while migrating
// page by page, without breaking screens that haven't been redesigned yet.
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}"
  ],
  corePlugins: {
    preflight: false
  },
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1200px" }
    },
    extend: {
      colors: {
        border: "hsl(var(--ct-border))",
        input: "hsl(var(--ct-input))",
        ring: "hsl(var(--ct-ring))",
        background: "hsl(var(--ct-background))",
        foreground: "hsl(var(--ct-foreground))",
        primary: {
          DEFAULT: "hsl(var(--ct-primary))",
          foreground: "hsl(var(--ct-primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--ct-secondary))",
          foreground: "hsl(var(--ct-secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--ct-muted))",
          foreground: "hsl(var(--ct-muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--ct-accent))",
          foreground: "hsl(var(--ct-accent-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--ct-destructive))",
          foreground: "hsl(var(--ct-destructive-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--ct-card))",
          foreground: "hsl(var(--ct-card-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--ct-popover))",
          foreground: "hsl(var(--ct-popover-foreground))"
        },
        ink: {
          DEFAULT: "hsl(var(--ct-ink))",
          foreground: "hsl(var(--ct-ink-foreground))"
        },
        brand: {
          DEFAULT: "hsl(var(--ct-brand))",
          foreground: "hsl(var(--ct-brand-foreground))"
        },
        sidebar: {
          DEFAULT: "hsl(var(--ct-sidebar))",
          foreground: "hsl(var(--ct-sidebar-foreground))",
          primary: "hsl(var(--ct-sidebar-primary))",
          "primary-foreground": "hsl(var(--ct-sidebar-primary-foreground))",
          accent: "hsl(var(--ct-sidebar-accent))",
          "accent-foreground": "hsl(var(--ct-sidebar-accent-foreground))",
          border: "hsl(var(--ct-sidebar-border))",
          ring: "hsl(var(--ct-sidebar-ring))"
        }
      },
      borderRadius: {
        lg: "var(--ct-radius)",
        md: "calc(var(--ct-radius) - 4px)",
        sm: "calc(var(--ct-radius) - 8px)"
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 1px 2px hsl(34 15% 9% / 0.04), 0 8px 24px -12px hsl(34 15% 9% / 0.12)",
        lift: "0 2px 4px hsl(34 15% 9% / 0.05), 0 24px 48px -20px hsl(34 15% 9% / 0.18)"
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" }
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
