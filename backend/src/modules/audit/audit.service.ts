import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const DEFAULT_AUDIT_ACTOR = 'local-admin';

export type AuditWriteInput = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  /** CREATE / DELETE için null olabilir. */
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  /** Phase 1: varsayılan local-admin */
  actor?: string;
};

/**
 * Prisma transaction client veya kök PrismaService.
 * Kritik değişikliklerde audit insert için aynı tx geçirilmelidir.
 */
export type AuditDbClient = Prisma.TransactionClient | PrismaService;

/**
 * Append-only audit yazıcı.
 *
 * Kullanım (kritik değişiklik ile aynı transaction):
 *
 *   await this.prisma.$transaction(async (tx) => {
 *     await tx.rawMaterialPrice.create({ data: ... });
 *     await this.auditService.record({ ... }, tx);
 *   });
 *
 * - Asıl değişiklik başarısız → audit commit edilmez
 * - Audit insert başarısız → transaction rollback → kritik değişiklik de yazılmaz
 *
 * UPDATE / DELETE API'si yoktur; audit kayıtları sonradan değiştirilmez.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditWriteInput, tx?: AuditDbClient): Promise<AuditEvent> {
    const db = tx ?? this.prisma;

    return db.auditEvent.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        fieldName: input.fieldName ?? null,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        reason: input.reason ?? null,
        actor: input.actor ?? DEFAULT_AUDIT_ACTOR,
      },
    });
  }
}
