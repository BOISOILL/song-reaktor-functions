module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "script",
  },
  extends: ["eslint:recommended"],
  rules: {
    "max-len": "off",
    "indent": "off",
    "object-curly-spacing": "off",
    "comma-dangle": "off",
    "require-jsdoc": "off",
    "operator-linebreak": "off",
    "eol-last": "off",
  },
};
