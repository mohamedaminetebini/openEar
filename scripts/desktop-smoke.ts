import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { nativeStateSchema, type NativeCommand } from '../src/features/system-audio/schema.ts';

const driver = process.env.OPENEAR_WEBDRIVER ?? 'http://127.0.0.1:4444';
const binary = resolve(process.env.OPENEAR_DESKTOP_BINARY ?? 'src-tauri/target/debug/openear');
const execute = promisify(execFile);
const previousOutput = (await execute('pactl', ['get-default-sink'])).stdout.trim();
const driverUrl = new URL(driver);
assert.equal(driverUrl.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(driverUrl.hostname));
const resultSchema = z.object({ value: z.unknown() });
async function request(path: string, body?: unknown, method = 'POST'): Promise<unknown> {
  const response = await fetch(driver + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const result = z
      .object({ value: z.object({ error: z.string(), message: z.string() }) })
      .parse(await response.json());
    throw new Error(
      `Desktop WebDriver HTTP ${response.status}: ${result.value.error}: ${result.value.message}`,
    );
  }
  return resultSchema.parse(await response.json()).value;
}
const session = z.object({ sessionId: z.string() }).parse(
  await request('/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: binary } } },
  }),
);
const base = '/session/' + session.sessionId;
const script = (source: string, args: unknown[] = []) =>
  request(base + '/execute/sync', { script: source, args });
async function native(input?: NativeCommand) {
  const result = await request(base + '/execute/async', {
    script:
      "const done = arguments[arguments.length-1]; const input = arguments[0]; window.__TAURI_INTERNALS__.invoke(input ? 'audio_command' : 'audio_state', input ? {input} : undefined).then(value => done({ok:true,value}), () => done({ok:false}));",
    args: [input ?? null],
  });
  const parsed = z.object({ ok: z.boolean(), value: z.unknown().optional() }).parse(result);
  assert.ok(parsed.ok, 'Desktop audio IPC must succeed.');
  return nativeStateSchema.parse(parsed.value);
}
async function wait(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 40; ++attempt) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Desktop condition was not reached.');
}
async function click(using: string, value: string) {
  const element = z
    .object({ 'element-6066-11e4-a52e-4f735466cecf': z.string() })
    .parse(await request(base + '/element', { using, value }));
  await script("arguments[0].scrollIntoView({block:'center',behavior:'instant'});", [element]);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await request(base + '/element/' + element['element-6066-11e4-a52e-4f735466cecf'] + '/click', {});
}
try {
  await wait(
    async () =>
      (await script('return !!document.querySelector(\'img[alt="Redragon"]\');')) === true,
  );
  assert.equal(await script("return !!document.querySelector('#companion-token');"), false);
  assert.equal((await native()).usbDevice?.vendorId, '3206');
  await mkdir('docs/screenshots', { recursive: true });
  const screenshot = z.string().parse(await request(base + '/screenshot', undefined, 'GET'));
  await writeFile('docs/screenshots/desktop.png', Buffer.from(screenshot, 'base64'));
  await click('xpath', "//button[normalize-space(.)='Enable desktop EQ']");
  await wait(async () => (await native()).active);
  await click('css selector', '#preset');
  await click('xpath', "//*[@role='option' and normalize-space(.)='Treble soften']");
  await wait(async () => (await native()).eq.bands[8] === -3);
  const rejected = await request(base + '/execute/async', {
    script:
      "const done=arguments[0];window.__TAURI_INTERNALS__.invoke('audio_command',{input:{operation:'shell',command:'anything'}}).then(()=>done(false),()=>done(true));",
    args: [],
  });
  assert.equal(rejected, true);
  await click('xpath', "//button[normalize-space(.)='Turn off desktop EQ']");
  await wait(async () => !(await native()).active);
  assert.equal((await execute('pactl', ['get-default-sink'])).stdout.trim(), previousOutput);
  console.log(
    'Desktop smoke passed: automatic USB detection, no token, native IPC, live preset EQ, invalid command rejection, and routing restoration.',
  );
} finally {
  try {
    await native({ operation: 'stop' });
  } finally {
    await request(base, undefined, 'DELETE');
  }
}
