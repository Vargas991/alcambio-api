import { Module } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ClienteLedgerPdfService } from './pdf/cliente-ledger-pdf.service';
import { ConfiguracionModule } from 'src/configuracion/configuracion.module';

@Module({
  imports: [PrismaModule, ConfiguracionModule],
  controllers: [ClientesController],
  providers: [ClientesService, ClienteLedgerPdfService],
})
export class ClientesModule {}
