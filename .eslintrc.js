module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['airbnb-base', 'plugin:import/typescript', 'prettier'],
  globals: {
    Optional: 'readonly',
    MapType: 'readonly',
    NumMapType: 'readonly',
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 13,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'no-unused-vars': 0,
    'no-use-before-define': 0,
    'no-unused-expressions': 0,
    'no-shadow': 0,
    'object-curly-newline': 0,
    'implicit-arrow-linebreak': 0,
    'no-restricted-syntax': 0,
    'import/prefer-default-export': 0,
    'import/no-unresolved': 0,
    'arrow-body-style': 0,
    'operator-linebreak': 0,
    'function-paren-newline': 0,
    'require-await': 'error',
    'import/extensions': ['error', 'ignorePackages', { ts: 'never' }],
  },
  ignorePatterns: ['dist'],
};
