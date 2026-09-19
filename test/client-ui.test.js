import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('client preserves structured error responses for expected conflict states', () => {
  assert.match(script, /error\.data=data/);
  assert.match(script, /error\.data\?\.result&&error\.data\?\.state/);
  assert.match(script, /Check-in result:/);
});

test('client recovers active holds after refresh and keeps confirmation available', () => {
  assert.match(script, /find\(hold=>hold\.status==='ACTIVE'\)/);
  assert.match(script, /confirm-order'\)\.disabled=!activeHold/);
});

test('login transitions move focus to visible headings and clear stale status', () => {
  assert.match(page, /<link rel="icon" href="data:,">/);
  assert.match(page, /id="login-title" tabindex="-1"/);
  assert.match(page, /id="capacity-title" tabindex="-1"/);
  assert.match(script, /focusConsole:true/);
  assert.match(script, /focusLogin:true/);
  assert.match(script, /\/api\/auth\/status/);
});

test('client escapes every server-provided value before dynamic markup rendering', () => {
  assert.match(script, /const escapeHtml=/);
  assert.match(script, /escapeHtml\(product\.name\)/);
  assert.match(script, /escapeHtml\(report\.title\)/);
  assert.match(script, /escapeHtml\(item\.name\)/);
  assert.match(script, /escapeHtml\(ticket\.displayCode\)/);
});

test('mutation controls lock while requests are pending to prevent duplicate actions', () => {
  assert.match(script, /let state=null,csrf='',activeHold=null,mutationPending=false/);
  assert.match(script, /if\(!activeHold\|\|mutationPending\)return/);
  assert.match(script, /setBusy\(button,true,'Creating hold…'\)/);
  assert.match(script, /setBusy\(button,true,'Recording…'\)/);
});

test('all operator views are keyboard-addressable and mobile navigation mirrors routes', () => {
  for (const id of ['capacity','sales','tickets','reports','operations']) {
    assert.match(page, new RegExp(`id="${id}"`));
    assert.match(page, new RegExp(`data-nav="${id}"`));
  }
  assert.match(page, /id="mobile-nav"/);
  assert.match(script, /setAttribute\('aria-current','page'\)/);
  assert.match(script, /showView\(event\.target\.value,\{focus:true\}\)/);
});

test('hidden authentication and application shells leave the keyboard order', async () => {
  const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\[hidden\]\{display:none!important\}/);
});

test('short passcodes are rejected before a network authentication attempt', () => {
  assert.match(script, /!field\.value\|\|field\.value\.length<16\|\|!field\.checkValidity\(\)/);
  assert.match(script, /Enter a passcode of at least 16 characters/);
});

test('persistent safety boundaries and inert report links remain visible', () => {
  assert.match(page, /NON-PRODUCTION · SYNTHETIC DATA ONLY/);
  assert.match(page, /Ephemeral session/);
  assert.match(page, /No payment collected/);
  assert.match(page, /No report was downloaded during verification/);
  assert.match(script, /download>CSV report/);
  assert.match(script, /download>JSON report/);
});
