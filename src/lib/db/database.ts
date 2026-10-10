import Dexie, { type EntityTable } from 'dexie';
import { z } from 'zod';
import { eqSchema, type EqSettings } from '@/features/equalizer/model';

export const profileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  eq: eqSchema,
  targetDeviceId: z.string().max(256).nullable(),
  hardware: z
    .object({
      noise: z.enum(['off', 'anc', 'transparency']).nullable(),
      equalizer: z.array(z.number().min(-24).max(24)).max(32).nullable(),
    })
    .nullable(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
});
export type Profile = z.infer<typeof profileSchema>;
interface Setting {
  key: string;
  value: unknown;
}
export interface DeviceMetadata {
  id: string;
  name: string;
  transport: string;
  lastSeen: number;
  adapterId: string | null;
}

export class OpenearDatabase extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  devices!: EntityTable<DeviceMetadata, 'id'>;
  constructor(name = 'headroom') {
    super(name);
    this.version(1).stores({ profiles: 'id, name, updatedAt', settings: 'key' });
    this.version(2).stores({
      profiles: 'id, name, updatedAt',
      settings: 'key',
      devices: 'id, lastSeen',
    });
  }
}
export class ProfileRepository {
  constructor(private readonly db: OpenearDatabase) {}
  async list(): Promise<Profile[]> {
    return (await this.db.profiles.orderBy('updatedAt').reverse().toArray()).map((value) =>
      profileSchema.parse(value),
    );
  }
  async create(name: string, eq: EqSettings, targetDeviceId: string | null): Promise<Profile> {
    const now = Date.now();
    const profile = profileSchema.parse({
      id: crypto.randomUUID(),
      name,
      eq,
      targetDeviceId,
      hardware: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.profiles.add(profile);
    return profile;
  }
  private async require(id: string): Promise<Profile> {
    const value = await this.db.profiles.get(id);
    if (!value) throw new Error('This profile no longer exists.');
    return profileSchema.parse(value);
  }
  async rename(id: string, name: string) {
    const profile = await this.require(id);
    await this.db.profiles.put(profileSchema.parse({ ...profile, name, updatedAt: Date.now() }));
  }
  async updateEq(id: string, eq: EqSettings) {
    const profile = await this.require(id);
    await this.db.profiles.put(profileSchema.parse({ ...profile, eq, updatedAt: Date.now() }));
  }
  async duplicate(id: string): Promise<Profile> {
    const profile = await this.require(id);
    const copy = profileSchema.parse({
      ...profile,
      id: crypto.randomUUID(),
      name: `${profile.name.slice(0, 75)} copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await this.db.profiles.add(copy);
    return copy;
  }
  async remove(id: string) {
    await this.db.transaction('rw', this.db.profiles, this.db.settings, async () => {
      await this.db.profiles.delete(id);
      for (const key of ['preferredProfile', 'lastProfile']) {
        if ((await this.db.settings.get(key))?.value === id) await this.db.settings.delete(key);
      }
    });
  }
  async setPreferred(id: string) {
    await this.require(id);
    await this.db.settings.put({ key: 'preferredProfile', value: id });
  }
}
export const database = new OpenearDatabase();
export const profiles = new ProfileRepository(database);
