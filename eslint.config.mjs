import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore server.js - it's a CommonJS Node.js server file for local HTTPS dev
    "server.js",
  ]),
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Disallow console.log in production (allow console.error and console.warn for error handling)
      "no-console":
        process.env.NODE_ENV === "production" ? ["error", { allow: ["warn", "error"] }] : "warn",

      // Unused imports plugin - automatically remove unused imports
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Disable the base rule as it conflicts with unused-imports
      "@typescript-eslint/no-unused-vars": "off",

      // Enforce strict type checking
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off", // Too strict for React components
      "@typescript-eslint/no-non-null-assertion": "warn",
      // Disable type-aware rules that require parserOptions (can be enabled later if needed)
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "off",

      // React best practices
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "warn",

      // General code quality
      "no-debugger": process.env.NODE_ENV === "production" ? "error" : "warn",
      "no-alert": "warn",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
]);

export default eslintConfig;
