export class UniqueConstraintError extends Error {
  constructor(
    readonly constraint: string,
    readonly key: string,
  ) {
    super(`Unique constraint ihlali: ${constraint} (${key})`);
    this.name = 'UniqueConstraintError';
  }
}

export class CheckConstraintError extends Error {
  constructor(
    readonly constraint: string,
    message: string,
  ) {
    super(message);
    this.name = 'CheckConstraintError';
  }
}

export class AppendOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppendOnlyError';
  }
}

export class HardDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HardDeleteError';
  }
}

export class OrphanAuditError extends Error {
  constructor(message = 'Audit kaydı, başarılı bir kullanıcı işlemi olmadan yazılamaz.') {
    super(message);
    this.name = 'OrphanAuditError';
  }
}
