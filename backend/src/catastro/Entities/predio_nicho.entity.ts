import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('predio_nicho')
export class PredioNicho {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ unique: true, length: 50 })
    codigo_lote!: string;

  // Semáforo de estados: Libre, Ocupado, Mora
    @Column({ default: 'Libre' })
    estado!: string; 

  // Configuración de la Geometría Espacial (PostGIS)
    @Index({ spatial: true }) // Esto genera el índice GIST automáticamente
    @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326, // Estándar de coordenadas
    })
    poligono!: string; 

    @CreateDateColumn()
    fecha_registro!: Date;
}