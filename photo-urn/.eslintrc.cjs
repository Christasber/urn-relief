// Dynamically choose an ESLint config. If the richer Next.js config is
// available locally we extend it; otherwise we fall back to `eslint:recommended`
// and skip TypeScript sources so `next lint` runs non-interactively in CI.

const hasNextConfig = (() => {
  try {
    require.resolve('eslint-config-next');
    return true;
  } catch (err) {
    return false;
  }
})();

/** @type {import('eslint').Linter.FlatConfig | import('eslint').Linter.Config} */
const baseConfig = {
  $schema: 'https://json.schemastore.org/eslintrc',
  root: true,
};

if (hasNextConfig) {
  module.exports = {
    ...baseConfig,
    extends: ['next/core-web-vitals'],
  };
} else {
  module.exports = {
    ...baseConfig,
    extends: ['eslint:recommended'],
    env: {
      browser: true,
      es2021: true,
      node: true,
    },
    parserOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true,
      },
    },
    ignorePatterns: ['**/*.ts', '**/*.tsx'],
    rules: {},
  };
}
