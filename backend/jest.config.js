/**
 * Configuración de Jest para el backend.
 *
 * `@nestjs/*` (v12) se publica como ESM ("type": "module"), por lo que Jest en
 * CommonJS no puede cargarlo directamente. El transformador compila el código
 * fuente y esos paquetes a CommonJS (incluidos los que usan `import.meta`),
 * sin necesidad de PostgreSQL ni de levantar la aplicación.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.[tj]s$': '<rootDir>/../test/import-meta-transformer.cjs',
  },
  transformIgnorePatterns: ['/node_modules/(?!(@nestjs|typeorm|uuid)/)'],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
