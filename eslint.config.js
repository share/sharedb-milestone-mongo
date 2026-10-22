const {FlatCompat} = require('@eslint/eslintrc');

const compat = new FlatCompat({baseDirectory: __dirname});

module.exports = [
  {
    ignores: ['coverage/', '**/.*'],
  },
  ...compat.extends('./eslint.base.yaml'),
  ...compat.env({
    mocha: true,
    es6: true,
    node: true,
  }),
  {
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['test/**/*'],
    rules: {
      'no-unused-expressions': 'off',
    },
  },
];
