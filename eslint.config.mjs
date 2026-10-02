import next from 'eslint-config-next';

export default [
  ...next,
  { ignores: ['src/generated/**', '.next/**', 'public/vendor/**'] },
];
