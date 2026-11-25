/**
 * Transformador de Jest: ts-jest + compatibilidad con `import.meta`.
 *
 * Algunos paquetes de `@nestjs/*` publicados como ESM usan
 * `createRequire(import.meta.url)`. En CommonJS `import.meta` no existe, así
 * que antes de compilar se reemplaza por `__filename`, que es equivalente para
 * `createRequire` y permite ejecutar los tests sin Node 24 ni ESM nativo.
 */
const tsJest = require('ts-jest');

const tsJestTransformer = tsJest.default.createTransformer({
  tsconfig: {
    module: 'commonjs',
    moduleResolution: 'node',
    resolvePackageJsonExports: false,
    target: 'ES2022',
    allowJs: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    isolatedModules: true,
    skipLibCheck: true,
  },
});

module.exports = {
  process(sourceText, sourcePath, transformOptions) {
    let source = sourceText;

    if (sourcePath.includes('node_modules') && source.includes('import.meta')) {
      // En CommonJS `require` ya existe: se elimina el alias que lo redeclararía.
      source = source.replace(
        /const require = createRequire\(import\.meta\.url\);/g,
        '/* require CJS nativo */',
      );
      source = source.replace(/import\.meta\.url/g, '__filename');
    }

    return tsJestTransformer.process(source, sourcePath, transformOptions);
  },

  getCacheKey(sourceText, sourcePath, transformOptions) {
    const key = tsJestTransformer.getCacheKey(
      sourceText,
      sourcePath,
      transformOptions,
    );
    return `${key}:import-meta-compat`;
  },
};
