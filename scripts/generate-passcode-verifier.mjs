import { encodeScryptVerifier } from '../src/auth/passcode-gate.js';

const passcode = process.env.PRIVATE_GATE_SETUP_PASSCODE;
if (!passcode) {
  console.error('PRIVATE_GATE_SETUP_PASSCODE must be supplied through an approved transient masked secret input.');
  process.exitCode = 1;
} else {
  try { console.log(await encodeScryptVerifier(passcode)); }
  finally { delete process.env.PRIVATE_GATE_SETUP_PASSCODE; }
}
