module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:jsx-a11y/recommended'
  ],
  plugins: ['jsx-a11y'],
  env: {
    browser: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/interactive-supports-focus': 'warn',
    'jsx-a11y/no-noninteractive-element-interactions': 'warn'
  },
  overrides: [
    {
      files: ['**/*.svelte'],
      processor: 'svelte3/svelte3'
    }
  ]
}; 