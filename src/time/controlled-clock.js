import { DomainError } from '../errors.js';

export class ControlledClock {
  constructor(start = Date.now()) { const value = new Date(start).valueOf(); if (!Number.isFinite(value)) throw new DomainError('VALIDATION_FAILED'); this.value = value; }
  now = () => this.value;
  iso = () => new Date(this.value).toISOString();
  advance(milliseconds) { if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new DomainError('VALIDATION_FAILED'); this.value += milliseconds; return this.iso(); }
  set(value) { const next = new Date(value).valueOf(); if (!Number.isFinite(next) || next < this.value) throw new DomainError('CLOCK_CANNOT_MOVE_BACKWARD'); this.value = next; return this.iso(); }
}

export class DeterministicJobRunner {
  constructor({ clock }) { this.clock = clock; this.jobs = []; }
  schedule({ id, kind, runAt, payload = {} }) { if (!id || this.jobs.some((job) => job.id === id)) throw new DomainError('VALIDATION_FAILED'); const at = new Date(runAt).valueOf(); if (!Number.isFinite(at)) throw new DomainError('VALIDATION_FAILED'); const job = { id, kind, runAt: new Date(at).toISOString(), payload: structuredClone(payload), status: 'QUEUED', attempts: 0 }; this.jobs.push(job); return Object.freeze({ ...job }); }
  runDue(handlers) { const completed = []; for (const job of this.jobs.filter((item) => item.status === 'QUEUED' && new Date(item.runAt).valueOf() <= this.clock.now()).sort((a, b) => a.runAt.localeCompare(b.runAt) || a.id.localeCompare(b.id))) { job.attempts += 1; try { handlers[job.kind]?.(structuredClone(job.payload)); job.status = 'COMPLETED'; job.completedAt = this.clock.iso(); } catch (error) { job.status = 'FAILED'; job.errorCode = error.code ?? 'JOB_FAILED'; } completed.push(Object.freeze({ ...job })); } return completed; }
  list() { return this.jobs.map((job) => ({ ...job, payload: structuredClone(job.payload) })); }
}
