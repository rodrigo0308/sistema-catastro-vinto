/**
 * Configuración del token JWT.
 * En producción el secreto debe definirse en la variable de entorno JWT_SECRET.
 */
export const JWT_SECRET = process.env.JWT_SECRET ?? 'ClaveSuperSeguraVinto2026';

export const JWT_EXPIRACION = '8h';
