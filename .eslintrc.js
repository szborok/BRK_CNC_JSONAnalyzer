module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'prefer-const': 'warn',
    'no-var': 'error',
    
    // Catch common runtime errors
    'no-undef': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'error',
    'valid-typeof': 'error',
    
    // Best practices
    'eqeqeq': ['error', 'always'],
    'no-throw-literal': 'error',
    'no-unused-expressions': 'error',
  },
};
