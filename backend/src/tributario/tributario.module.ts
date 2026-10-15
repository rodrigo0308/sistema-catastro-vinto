import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TributarioService } from './tributario.service';
import { TributarioController } from './tributario.controller';
import { ParametroTributario } from './entities/parametro_tributario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ParametroTributario])],
  controllers: [TributarioController],
  providers: [TributarioService]
})
export class TributarioModule {}