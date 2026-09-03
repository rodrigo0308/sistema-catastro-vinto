import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
    imports: [
    UsuariosModule,
    JwtModule.register({
        global: true,
        secret: 'ClaveSuperSeguraVinto2026', // En producción, esto se oculta en un archivo .env
        signOptions: { expiresIn: '8h' }, // El token durará 8 horas
    }),
],
    providers: [AuthService],
    controllers: [AuthController],
})
export class AuthModule {}