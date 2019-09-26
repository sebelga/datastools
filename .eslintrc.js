'use strict';

module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'script',
  },
  extends: ['airbnb-base', 'plugin:prettier/recommended'],
  env: {
    node: true,
    mocha: true,
  },
  plugins: ['mocha'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx'],
      },
    },
  },
  rules: {
    strict: ['error', 'global'],
    'arrow-parens': ['error', 'as-needed'],
    indent: [
      'error',
      2,
      {
        SwitchCase: 1,
      },
    ],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: ['**/test/**/*.js'],
      },
    ],
    'no-use-before-define': [
      'error',
      {
        functions: false,
      },
    ],
    'import/prefer-default-export': 'off',
    'prefer-rest-params': 'off',
    'prefer-spread': 'off',
    'no-restricted-globals': 'off',
    'no-underscore-dangle': 'off',
    'no-param-reassign': 'off',
    'max-len': ['error', { code: 120, ignoreUrls: true }],
    'mocha/no-exclusive-tests': 'error',
  },
};
