import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseService } from '../../firebase/firebase.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly firebase: FirebaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      method?: string;
      headers?: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();

    if (request.method === 'OPTIONS') {
      return true;
    }

    if (!this.firebase.isEnabled) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Giriş yapmanız gerekiyor.');
      }
      return true;
    }

    const header = request.headers?.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw || !raw.startsWith('Bearer ') || raw.slice(7).trim().length === 0) {
      throw new UnauthorizedException('Giriş yapmanız gerekiyor.');
    }

    const token = raw.slice(7).trim();
    try {
      request.user = await this.firebase.verifyIdToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Oturum geçersiz veya süresi doldu.');
    }
  }
}
