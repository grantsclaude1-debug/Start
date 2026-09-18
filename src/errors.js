export class DomainError extends Error {
  constructor(code, message = code, details = undefined) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function assert(condition, code, message = code, details) {
  if (!condition) throw new DomainError(code, message, details);
}
