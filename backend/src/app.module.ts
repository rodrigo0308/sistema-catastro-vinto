import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // Configuración de conexión a PostgreSQL/PostGIS
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5433, // El puerto que mapeamos en Docker
      username: 'postgres',
      password: 'supersecretpassword', // La contraseña del docker-compose
      database: 'catastro_vinto',
      autoLoadEntities: true,
      synchronize: true, // Útil para desarrollo (crea las tablas automáticamente)
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}