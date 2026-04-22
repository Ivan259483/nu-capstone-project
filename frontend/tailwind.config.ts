import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
    darkMode: "class",
    content: [
        "./pages/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./app/**/*.{ts,tsx}",
        "./src/**/*.{ts,tsx}",
    ],
    prefix: "",
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: { "2xl": "1400px" },
        },
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                gold: {
                    DEFAULT: "hsl(var(--gold))",
                    light: "hsl(var(--gold-light))",
                    dark: "hsl(var(--gold-dark))",
                },
                sidebar: {
                    DEFAULT: "hsl(var(--sidebar-background))",
                    foreground: "hsl(var(--sidebar-foreground))",
                    primary: "hsl(var(--sidebar-primary))",
                    "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
                    accent: "hsl(var(--sidebar-accent))",
                    "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
                    border: "hsl(var(--sidebar-border))",
                    ring: "hsl(var(--sidebar-ring))",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            fontFamily: {
                sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
                serif: ["'Playfair Display'", "Georgia", "serif"],
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
                shimmer: {
                    "0%": { backgroundPosition: "-200% 0" },
                    "100%": { backgroundPosition: "200% 0" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0px)" },
                    "50%": { transform: "translateY(-12px)" },
                },
                "pulse-gold": {
                    "0%, 100%": { boxShadow: "0 0 12px rgba(212,175,55,0.3)" },
                    "50%": { boxShadow: "0 0 32px rgba(212,175,55,0.7), 0 0 60px rgba(212,175,55,0.3)" },
                },
                "slide-up": {
                    from: { opacity: "0", transform: "translateY(32px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "slide-in-left": {
                    from: { opacity: "0", transform: "translateX(-40px)" },
                    to: { opacity: "1", transform: "translateX(0)" },
                },
                "slide-in-right": {
                    from: { opacity: "0", transform: "translateX(40px)" },
                    to: { opacity: "1", transform: "translateX(0)" },
                },
                "fade-in": {
                    from: { opacity: "0" },
                    to: { opacity: "1" },
                },
                "scale-in": {
                    from: { opacity: "0", transform: "scale(0.9)" },
                    to: { opacity: "1", transform: "scale(1)" },
                },
                "spin-slow": {
                    from: { transform: "rotate(0deg)" },
                    to: { transform: "rotate(360deg)" },
                },
                marquee: {
                    from: { transform: "translateX(0)" },
                    to: { transform: "translateX(-50%)" },
                },
                "border-glow": {
                    "0%, 100%": { borderColor: "rgba(212,175,55,0.15)" },
                    "50%": { borderColor: "rgba(212,175,55,0.5)" },
                },
                "particle-float": {
                    "0%": { opacity: "0", transform: "translateY(0) scale(0)" },
                    "20%": { opacity: "0.6", transform: "translateY(-20px) scale(1)" },
                    "80%": { opacity: "0.3", transform: "translateY(-80px) scale(0.8)" },
                    "100%": { opacity: "0", transform: "translateY(-120px) scale(0)" },
                },
                "number-pop": {
                    "0%": { transform: "scale(0.5)", opacity: "0" },
                    "80%": { transform: "scale(1.1)" },
                    "100%": { transform: "scale(1)", opacity: "1" },
                },
                typing: {
                    from: { width: "0" },
                    to: { width: "100%" },
                },
                blink: {
                    "50%": { borderColor: "transparent" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                shimmer: "shimmer 2.5s infinite",
                float: "float 4s ease-in-out infinite",
                "pulse-gold": "pulse-gold 2.5s ease-in-out infinite",
                "slide-up": "slide-up 0.6s cubic-bezier(0.4,0,0.2,1) forwards",
                "slide-in-left": "slide-in-left 0.6s cubic-bezier(0.4,0,0.2,1) forwards",
                "slide-in-right": "slide-in-right 0.6s cubic-bezier(0.4,0,0.2,1) forwards",
                "fade-in": "fade-in 0.6s ease forwards",
                "scale-in": "scale-in 0.5s cubic-bezier(0.4,0,0.2,1) forwards",
                "spin-slow": "spin-slow 20s linear infinite",
                marquee: "marquee 28s linear infinite",
                "border-glow": "border-glow 3s ease-in-out infinite",
                "particle-float": "particle-float 6s ease-in-out infinite",
                "number-pop": "number-pop 0.5s cubic-bezier(0.4,0,0.2,1) forwards",
                typing: "typing 2.5s steps(30) forwards",
                blink: "blink 0.75s step-end infinite",
            },
            backgroundImage: {
                "gradient-gold": "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
                "gradient-dark": "linear-gradient(180deg, hsl(240 15% 4%), hsl(240 12% 7%))",
                "gradient-radial-gold": "radial-gradient(ellipse at center, rgba(212,175,55,0.15) 0%, transparent 70%)",
                "hero-pattern": "radial-gradient(ellipse at 60% 40%, rgba(212,175,55,0.08) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(212,175,55,0.05) 0%, transparent 50%)",
            },
            backdropBlur: {
                xs: "4px",
            },
            transitionTimingFunction: {
                smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
                bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            },
        },
    },
    plugins: [tailwindcssAnimate],
} satisfies Config;
