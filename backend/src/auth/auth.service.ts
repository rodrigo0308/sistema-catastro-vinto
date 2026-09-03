import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(private jwtService: JwtService) {}

    async login(nombreUsuario: string, contrasena: string) {
    // Por ahora, crearemos un acceso "falso" para probar que la generación de tokens funciona.
    // Más adelante lo conectaremos a la tabla "usuarios" que acabas de crear.
    if (nombreUsuario !== 'admin' || contrasena !== '123456') {
        throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Si la contraseña es correcta, armamos el contenido del token (payload)
    const payload = { sub: 'uuid-temporal', nombreUsuario: nombreUsuario, rol: 'ADMIN' };
    
    // Retornamos el token generado
    return {
        access_token: await this.jwtService.signAsync(payload),
    };
}
}