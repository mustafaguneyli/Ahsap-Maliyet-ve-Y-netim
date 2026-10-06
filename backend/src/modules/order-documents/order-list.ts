import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../common/decimal/decimal.util';

export const ORDER_LIST_DEFAULT_PAGE_SIZE = 20;

export function normalizeOrderListQuery(input: {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? ORDER_LIST_DEFAULT_PAGE_SIZE;
  const q = input.q?.trim() ?? '';
  const from = parseListDay(input.dateFrom, false);
  const to = parseListDay(input.dateTo, true);
  if (from && to && from.getTime() > to.getTime()) {
    throw new BadRequestException('Başlangıç tarihi bitişten sonra olamaz.');
  }
  return { page, pageSize, q, from, to };
}

export function orderListWhere(input: {
  q: string;
  from?: Date;
  to?: Date;
}): Prisma.OrderDocumentWhereInput {
  const where: Prisma.OrderDocumentWhereInput = {};
  if (input.q) {
    where.OR = [
      { orderNumber: { contains: input.q, mode: 'insensitive' } },
      { customerName: { contains: input.q, mode: 'insensitive' } },
    ];
  }
  if (input.from || input.to) {
    where.createdAt = {
      ...(input.from ? { gte: input.from } : {}),
      ...(input.to ? { lte: input.to } : {}),
    };
  }
  return where;
}

export function sumQuantities(values: string[]): string {
  return values
    .reduce((sum, value) => sum.plus(toDecimal(value)), new Decimal(0))
    .toFixed();
}

export function formatQuantityText(value: string): string {
  return toDecimal(value).toFixed().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function claimStoredLine<T extends { lineNo: number }>(
  lines: T[],
  consumed: Set<number>,
  matches: (line: T) => boolean,
): T | undefined {
  const found = lines.find((line) => !consumed.has(line.lineNo) && matches(line));
  if (found) consumed.add(found.lineNo);
  return found;
}

function parseListDay(raw: string | undefined, endOfDay: boolean): Date | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const text = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    throw new BadRequestException('Tarih YYYY-AA-GG biçiminde olmalıdır.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new BadRequestException('Tarih geçerli bir gün olmalıdır.');
  }
  return date;
}
