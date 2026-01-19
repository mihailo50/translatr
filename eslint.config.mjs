import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  ]),
  {
    rules: {
      // Disallow console.log in production (allow console.error and console.warn for error handling)
      "no-console": process.env.NODE_ENV === "production" 
        ? ["error", { allow: ["warn", "error"] }]
        : "warn",
      
      // Enforce strict type checking
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off", // Too strict for React components
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      
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
