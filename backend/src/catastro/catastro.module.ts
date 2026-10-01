import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatastroService } from './catastro.service';
import { CatastroController } from './catastro.controller';
import { PredioNicho } from './Entities/predio_nicho.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PredioNicho])],
  controllers: [CatastroController],
  providers: [CatastroService]
})
export class CatastroModule {}