import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('parametros_tributarios')
export class ParametroTributario {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'decimal', precision: 10, scale: 5, default: 2.50000 })
    valor_ufv!: number; // Valor de la Unidad de Fomento de Vivienda

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 100.00 })
    multa_base_mora!: number; // Multa inicial por entrar en mora

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 1.50 })
    interes_mensual_porcentaje!: number; // Porcentaje de interés por mes de retraso

    @Column({ type: 'int', default: 2026 })
    gestion_actual!: number; // Año de gestión activa

    @UpdateDateColumn()
    fecha_actualizacion!: Date;
}