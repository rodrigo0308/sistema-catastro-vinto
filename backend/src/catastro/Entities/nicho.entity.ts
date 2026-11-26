import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PredioNicho } from './predio_nicho.entity';

/**
 * Estados del semáforo de ocupación de un nicho.
 * `Pendiente de Pago` marca un contrato recién emitido que todavía no fue
 * cancelado en caja; `Ocupado` es el espacio ya cancelado y vigente.
 */
export type EstadoNicho = 'Libre' | 'Pendiente de Pago' | 'Ocupado' | 'Mora';

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

  // Fecha completa ISO (YYYY-MM-DD). Los registros históricos solo tienen año;
  // anio_defuncion se mantiene sincronizado para no romperlos.
  @Column({
    name: 'fecha_defuncion',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  fecha_defuncion!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono_solicitante!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  solicitante!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resolucion!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'Libre' })
  estado!: EstadoNicho;

  // Condiciones del contrato de uso del espacio.
  @Column({ name: 'tipo_espacio', type: 'varchar', length: 20, default: 'Nicho' })
  tipo_espacio!: 'Nicho' | 'Mausoleo' | 'Camposanto';

  // Plazo libre en años; null cuando el contrato es perpetuo.
  @Column({ name: 'plazo_anios', type: 'int', nullable: true })
  plazo_anios!: number | null;

  @Column({ name: 'es_perpetuo', type: 'boolean', default: false })
  es_perpetuo!: boolean;

  // Calculado automáticamente: anio_defuncion + plazo_anios.
  @Column({ name: 'anio_vencimiento', type: 'int', nullable: true })
  anio_vencimiento!: number | null;

  // Fecha completa ISO del vencimiento; se sincroniza con anio_vencimiento.
  @Column({
    name: 'fecha_vencimiento',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  fecha_vencimiento!: string | null;

  // Precio acordado por el encargado para el contrato.
  @Column({
    name: 'monto_contrato_bs',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (valor: number | null) => valor,
      from: (valor: string | null) =>
        valor === null || valor === undefined ? null : Number(valor),
    },
  })
  monto_contrato_bs!: number | null;

  // Sector o bloque interno del camposanto (sitios en tierra).
  @Column({
    name: 'sector_camposanto',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  sector_camposanto!: string | null;

  // Observaciones de campo del encargado del cementerio.
  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;
}
