import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('usuarios')
export class Usuario {
@PrimaryGeneratedColumn('uuid')
    id!: string;

@Column({ unique: true })
    nombreUsuario!: string;

@Column()
  contrasena!: string; // Aquí guardaremos la contraseña encriptada

@Column({ default: 'ADMIN' })
  rol!: string; // Puede ser ADMIN, RECAUDADOR o PANTEONERO

@Column({ default: true })
    estaActivo!: boolean;

@CreateDateColumn()
    fechaCreacion!: Date;
}