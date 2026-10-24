// Tailwind CSS v4 through its PostCSS plugin. Without this file the @theme and
// @import 'tailwindcss' rules pass through unprocessed and no utilities are generated.
// Plain object export keeps this dependency-free; Next loads it through postcss-load-config.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
