const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    ignores: ["node_modules/**", "lib/**"],
  },
  {
    files: ["src/**/*.ts", "src/**/*.js", "index.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      quotes: ["error", "double"],
      indent: ["error", 2],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {argsIgnorePattern: "^_", varsIgnorePattern: "^_"},
      ],
    },
  },
];
module.exports = [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "lib/**"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {},
  },
];

