import { EstadoEntidad, RolUsuario } from '../../../generated/prisma/client';

export type AuthUser = {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  estado: EstadoEntidad;
  tenantId: string | null;
  tenant?: {
    id: string;
    nombre: string;
    slug: string;
    activo: boolean;
  } | null;
};
