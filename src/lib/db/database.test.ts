import { afterEach, expect, it } from 'vitest';
import { OpenearDatabase, ProfileRepository, profileSchema } from './database';
import Dexie from 'dexie';

const databases: OpenearDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});

it('persists, renames, duplicates, edits and deletes actual IndexedDB profiles', async () => {
  const db = new OpenearDatabase(`test-${crypto.randomUUID()}`);
  databases.push(db);
  const repo = new ProfileRepository(db);
  const profile = await repo.create(
    'Late night',
    { enabled: true, bands: Array(10).fill(-3) },
    null,
  );
  await repo.rename(profile.id, 'Quiet night');
  const copy = await repo.duplicate(profile.id);
  expect(copy.name).toBe('Quiet night copy');
  expect(copy.id).not.toBe(profile.id);
  await repo.updateEq(profile.id, { enabled: false, bands: Array(10).fill(0) });
  await repo.setPreferred(profile.id);
  expect((await repo.list()).find((item) => item.id === profile.id)?.eq.enabled).toBe(false);
  expect((await db.settings.get('preferredProfile'))?.value).toBe(profile.id);
  await repo.remove(profile.id);
  expect(await repo.list()).toHaveLength(1);
  expect(await db.settings.get('preferredProfile')).toBeUndefined();
});

it('rejects malicious or malformed profile data without storing it', async () => {
  const db = new OpenearDatabase(`test-${crypto.randomUUID()}`);
  databases.push(db);
  const repo = new ProfileRepository(db);
  await expect(
    repo.create(' ', { enabled: true, bands: Array(10).fill(0) }, null),
  ).rejects.toThrow();
  expect(profileSchema.safeParse({ name: 'Invalid', eq: { bands: [1] } }).success).toBe(false);
  expect(await repo.list()).toEqual([]);
});

it('upgrades the v1 database without losing existing sound profiles', async () => {
  const name = `migration-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(1).stores({ profiles: 'id, name, updatedAt', settings: 'key' });
  await old.table('profiles').add({
    id: '4dc5115f-e1e6-4b6d-81e1-bbf2cd575455',
    name: 'Existing',
    eq: { enabled: true, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    targetDeviceId: null,
    hardware: null,
    createdAt: 1,
    updatedAt: 1,
  });
  old.close();
  const db = new OpenearDatabase(name);
  databases.push(db);
  expect((await new ProfileRepository(db).list())[0]?.name).toBe('Existing');
  await db.devices.put({
    id: 'permitted-id',
    name: 'Battery device',
    transport: 'web-bluetooth',
    lastSeen: 2,
    adapterId: 'generic-ble-battery',
  });
  expect((await db.devices.get('permitted-id'))?.lastSeen).toBe(2);
});
