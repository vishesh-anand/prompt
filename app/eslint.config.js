// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Screens use color tokens from src/design, never raw color values (CLAUDE.md).
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\\()/]",
          message: "No raw colors in screens. Use a color token from @/design.",
        },
      ],
    },
  },
]);
