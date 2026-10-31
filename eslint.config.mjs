import typescriptEslint from "typescript-eslint";

export default [{
    files: ["**/*.ts"],
}, {
    plugins: {
        "@typescript-eslint": typescriptEslint.plugin,
    },

    languageOptions: {
        parser: typescriptEslint.parser,
        ecmaVersion: 2022,
        sourceType: "module",
        // Type information lets the rules below see which calls return promises.
        parserOptions: {
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
        },
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "import",
            format: ["camelCase", "PascalCase"],
        }],

        // A promise nobody awaits can fail silently; `void` marks the ones that are meant to run on their own.
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "warn",
    },
}];
