import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { Usuario } from './entities/usuario.entity';
import { ROL_POR_DEFECTO, Rol } from '../common/roles';

const RONDAS_BCRYPT = 10;

export type UsuarioSinContrasena = Omit<Usuario, 'contrasena'>;

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
  ) {}

  /** Quita el hash de la contraseña antes de devolver un usuario por HTTP. */
  private sinContrasena(usuario: Usuario): UsuarioSinContrasena {
    const { contrasena, ...resto } = usuario;
    return resto;
  }

  async create(createUsuarioDto: CreateUsuarioDto): Promise<UsuarioSinContrasena> {
    const usuario = await this.crearEntidad(createUsuarioDto);
    return this.sinContrasena(usuario);
  }

  /**
   * Crea la entidad encriptando la contraseña.
   * Uso interno (también lo usa la siembra del admin por defecto).
   */
  async crearEntidad(datos: {
    nombreUsuario: string;
    contrasena: string;
    rol?: Rol;
    estaActivo?: boolean;
  }): Promise<Usuario> {
    const nombreUsuario = datos.nombreUsuario.trim();

    const existente = await this.usuarioRepo.findOne({ where: { nombreUsuario } });
    if (existente) {
      throw new ConflictException(`Ya existe un usuario con el nombre "${nombreUsuario}"`);
    }

    const contrasena = await bcrypt.hash(datos.contrasena, RONDAS_BCRYPT);

    const usuario = this.usuarioRepo.create({
      nombreUsuario,
      contrasena,
      rol: datos.rol ?? ROL_POR_DEFECTO,
      estaActivo: datos.estaActivo ?? true,
    });

    return this.usuarioRepo.save(usuario);
  }

  async findAll(): Promise<UsuarioSinContrasena[]> {
    const usuarios = await this.usuarioRepo.find({
      order: { fechaCreacion: 'DESC' },
    });
    return usuarios.map((usuario) => this.sinContrasena(usuario));
  }

  async findOne(id: string): Promise<UsuarioSinContrasena> {
    const usuario = await this.buscarEntidadPorId(id);
    if (!usuario) {
      throw new NotFoundException(`No existe un usuario con el id ${id}`);
    }
    return this.sinContrasena(usuario);
  }

  /** Devuelve la entidad completa (incluye el hash). Uso interno del AuthModule. */
  async buscarEntidadPorId(id: string): Promise<Usuario | null> {
    return this.usuarioRepo.findOne({ where: { id } });
  }

  /** Devuelve la entidad completa (incluye el hash). Uso interno del AuthService. */
  async buscarPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null> {
    return this.usuarioRepo.findOne({ where: { nombreUsuario } });
  }

  async contarUsuarios(): Promise<number> {
    return this.usuarioRepo.count();
  }

  async update(
    id: string,
    updateUsuarioDto: UpdateUsuarioDto,
  ): Promise<UsuarioSinContrasena> {
    const usuario = await this.buscarEntidadPorId(id);
    if (!usuario) {
      throw new NotFoundException(`No existe un usuario con el id ${id}`);
    }

    if (
      updateUsuarioDto.nombreUsuario &&
      updateUsuarioDto.nombreUsuario.trim() !== usuario.nombreUsuario
    ) {
      const nombreUsuario = updateUsuarioDto.nombreUsuario.trim();
      const existente = await this.buscarPorNombreUsuario(nombreUsuario);
      if (existente) {
        throw new ConflictException(`Ya existe un usuario con el nombre "${nombreUsuario}"`);
      }
      usuario.nombreUsuario = nombreUsuario;
    }

    if (updateUsuarioDto.contrasena) {
      usuario.contrasena = await bcrypt.hash(updateUsuarioDto.contrasena, RONDAS_BCRYPT);
    }

    if (updateUsuarioDto.rol) {
      usuario.rol = updateUsuarioDto.rol;
    }

    if (typeof updateUsuarioDto.estaActivo === 'boolean') {
      usuario.estaActivo = updateUsuarioDto.estaActivo;
    }

    const actualizado = await this.usuarioRepo.save(usuario);
    return this.sinContrasena(actualizado);
  }

  async remove(id: string): Promise<{ mensaje: string }> {
    const usuario = await this.buscarEntidadPorId(id);
    if (!usuario) {
      throw new NotFoundException(`No existe un usuario con el id ${id}`);
    }

    await this.usuarioRepo.remove(usuario);
    return { mensaje: `Usuario "${usuario.nombreUsuario}" eliminado correctamente` };
  }
}
