/**
 * Roles disponibles en el sistema de catastro y recaudación.
 * Se usan tanto en los DTOs (validación) como en el decorador @Roles y el RolesGuard.
 */
export const ROLES = ['ADMIN', 'RECAUDADOR', 'PANTEONERO'] as const;

export type Rol = (typeof ROLES)[number];

/** Rol asignado cuando no se especifica uno al crear un funcionario. */
export const ROL_POR_DEFECTO: Rol = 'RECAUDADOR';

/** Copia mutable (string[]) para usarla en validaciones de class-validator. */
export const ROLES_LISTA: string[] = [...ROLES];
