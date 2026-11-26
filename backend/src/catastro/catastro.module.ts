import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatastroService } from './catastro.service';
import { CatastroController } from './catastro.controller';
import { PublicoController } from './publico.controller';
import { PredioNicho } from './Entities/predio_nicho.entity';
import { Nicho } from './Entities/nicho.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PredioNicho, Nicho])],
  controllers: [CatastroController, PublicoController],
  providers: [CatastroService],
})
export class CatastroModule {}
