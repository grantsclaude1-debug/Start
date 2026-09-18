import { DomainError, assert } from '../errors.js';

export class ManualVenueAudioAdapter {
  constructor({ vendorIdentity = 'ambiguous', licensingStatus = 'unverified' } = {}) { this.vendorIdentity = vendorIdentity; this.licensingStatus = licensingStatus; this.mode = 'manual'; }
  discoverCapabilities() { return Object.freeze({ vendorIdentity: this.vendorIdentity, mode: this.mode, capabilities: Object.freeze([{ name: 'schedule.write', availability: 'manual-only' }, { name: 'playback.control', availability: 'unknown' }, { name: 'webhook.receive', availability: 'unknown' }]) }); }
  execute(command) { assert(command?.idempotencyKey && command?.expiresAt, 'VALIDATION_FAILED'); if (new Date(command.expiresAt).valueOf() <= Date.now()) throw new DomainError('AUDIO_COMMAND_EXPIRED'); return Object.freeze({ commandId: command.commandId, status: 'manual-required', manualInstructions: 'Apply the approved change through the confirmed vendor process and record the external reference.', vendorReference: null }); }
  enableProgrammaticMode() { throw new DomainError(this.vendorIdentity === 'ambiguous' ? 'AUDIO_PROVIDER_UNCONFIRMED' : this.licensingStatus !== 'approved' ? 'AUDIO_LICENSING_BLOCKED' : 'AUDIO_CONTRACT_REQUIRED'); }
}
