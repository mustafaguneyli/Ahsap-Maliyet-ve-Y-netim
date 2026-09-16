import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto';

@Controller('audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  listRecent(@Query() query: ListAuditEventsQueryDto) {
    return this.auditService.listRecent(query.limit ?? 8);
  }
}
