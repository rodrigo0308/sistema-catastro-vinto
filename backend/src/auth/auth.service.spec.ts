import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsuariosService } from '../usuarios/usuarios.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usuariosService: {
    contarUsuarios: jest.Mock;
    buscarPorNombreUsuario: jest.Mock;
    crearEntidad: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };

  const usuarioAdmin = {
    id: '11111111-1111-1111-1111-111111111111',
    nombreUsuario: 'admin',
    contrasena: '$2b$10$hash-de-prueba',
    rol: 'ADMIN',
    estaActivo: true,
  };

  beforeEach(async () => {
    jwtService = { signAsync: jest.fn().mockResolvedValue('jwt.de.prueba') };
    usuariosService = {
      contarUsuarios: jest.fn().mockResolvedValue(1),
      buscarPorNombreUsuario: jest.fn(),
      crearEntidad: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: UsuariosService, useValue: usuariosService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('debería devolver un access_token JWT con credenciales válidas', async () => {
    usuariosService.buscarPorNombreUsuario.mockResolvedValue(usuarioAdmin);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const resultado = await service.login('admin', 'admin123');

    expect(usuariosService.buscarPorNombreUsuario).toHaveBeenCalledWith('admin');
    expect(bcrypt.compare).toHaveBeenCalledWith(
      'admin123',
      usuarioAdmin.contrasena,
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: usuarioAdmin.id,
      nombreUsuario: 'admin',
      rol: 'ADMIN',
    });
    expect(resultado.access_token).toBe('jwt.de.prueba');
    expect(resultado.usuario).toEqual({
      id: usuarioAdmin.id,
      nombreUsuario: 'admin',
      rol: 'ADMIN',
    });
  });

  it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
    usuariosService.buscarPorNombreUsuario.mockResolvedValue(usuarioAdmin);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.login('admin', 'clave-mala')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('debería lanzar UnauthorizedException si el usuario no existe', async () => {
    usuariosService.buscarPorNombreUsuario.mockResolvedValue(null);

    await expect(service.login('fantasma', 'x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('debería lanzar UnauthorizedException si el usuario está inactivo', async () => {
    usuariosService.buscarPorNombreUsuario.mockResolvedValue({
      ...usuarioAdmin,
      estaActivo: false,
    });

    await expect(service.login('admin', 'admin123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
