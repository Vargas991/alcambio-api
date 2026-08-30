import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { RolUsuario } from '../../../generated/prisma/client';
import type { AuthUser } from '../../auth/types/auth-user';

export type TenantContextValue = {
  userId: string;
  rol: RolUsuario;
  tenantId: string | null;
};

export const TenantContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContextValue => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado.');
    }

    return {
      userId: user.id,
      rol: user.rol,
      tenantId: user.tenantId,
    };
  },
);

export function requireTenantId(context: TenantContextValue) {
  if (!context.tenantId) {
    throw new ForbiddenException(
      'Esta accion requiere un tenant asociado al usuario.',
    );
  }

  return context.tenantId;
}
