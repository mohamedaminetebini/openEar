import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { profiles, type Profile } from '@/lib/db/database';
import { useApp } from '@/stores/app-store';

export function ProfileDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: Profile;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{profile ? 'Rename profile' : 'Save your sound'}</DialogTitle>
          <DialogDescription>
            {profile
              ? 'Choose a new name for this saved profile.'
              : 'Save the current EQ. Your profile stays on this device.'}
          </DialogDescription>
        </DialogHeader>
        <ProfileForm profile={profile} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
function ProfileForm({ profile, close }: { profile: Profile | undefined; close: () => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eq = useApp((state) => state.eq);
  const client = useQueryClient();
  return (
    <form
      className="profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError(null);
        void (async () => {
          try {
            if (profile) await profiles.rename(profile.id, name);
            else {
              const saved = await profiles.create(name, eq, null);
              useApp.getState().setLastProfile(saved.id);
            }
            await client.invalidateQueries({ queryKey: ['profiles'] });
            close();
          } catch {
            setError(
              'Could not save the profile. Use a name of 1–80 characters and check that local storage is available.',
            );
          } finally {
            setSaving(false);
          }
        })();
      }}
    >
      <label htmlFor="profile-name">Profile name</label>
      <Input
        id="profile-name"
        name="profile-name"
        autoComplete="off"
        autoFocus
        required
        maxLength={80}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Late night listening"
      />
      {!profile && <p className="fine-print">Saves the current EQ settings.</p>}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : profile ? 'Save name' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}
