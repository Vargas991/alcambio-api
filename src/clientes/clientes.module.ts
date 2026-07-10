import { Module } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ClienteLedgerPdfService } from './pdf/cliente-ledger-pdf.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClientesController],
  providers: [ClientesService, ClienteLedgerPdfService],
})
export class ClientesModule {}
