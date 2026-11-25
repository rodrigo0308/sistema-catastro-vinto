import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PredioNicho } from './predio_nicho.entity';

/** Estados del semáforo de ocupación de un nicho. */
export type EstadoNicho = 'Libre' | 'Ocupado' | 'Mora';

/**
 * Nicho individual dentro de un bloque (predio_nicho).
 * La posición se expresa como fila/columna para poder dibujar la cuadrícula
 * tipo Excel en el geovisor.
 */
@Entity('nichos')
@Unique('uq_nicho_posicion', ['predio_id', 'fila', 'columna'])
export class Nicho {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'predio_id', type: 'uuid' })
  predio_id!: string;

  @ManyToOne(() => PredioNicho, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'predio_id' })
  predio!: PredioNicho;

  @Column({ type: 'int' })
  fila!: number;

  @Column({ type: 'int' })
  columna!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nombre_difunto!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  apellido_difunto!: string | null;

  // Registro formal boliviano (se mantienen los campos anteriores para el
  // buscador y el seed).
  @Column({ type: 'varchar', length: 255, nullable: true })
  apellido_paterno!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  apellido_materno!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nombres!: string | null;

  @Column({ type: 'int', nullable: true })
  anio_defuncion!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono_solicitante!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  solicitante!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resolucion!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'Libre' })
  estado!: EstadoNicho;
}
