import { memo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Music2, Copy, Pencil, Trash2, Star, Check, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionBar } from '@/components/section-bar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { profiles, type Profile } from '@/lib/db/database';
import { applySavedEq, useApp } from '@/stores/app-store';
import { useNativeAudio } from '@/features/system-audio/store';
import { useProfiles, usePreferredProfile } from './hooks';
import { ProfileDialog } from './profile-dialog';
import { applyProfile } from './apply-profile';

function ProfilesPanelBase({ compact = false }: { compact?: boolean }) {
  const query = useProfiles();
  const preferred = usePreferredProfile();
  const client = useQueryClient();
  const lastProfile = useApp((state) => state.lastProfile);
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (id: string, operation: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await operation();
      await client.invalidateQueries({ queryKey: ['profiles'] });
      await client.invalidateQueries({ queryKey: ['preferred-profile'] });
      setNotice(message);
    } catch {
      setError(
        'The profile operation failed. Check your audio output and local storage, then retry. Profiles with manufacturer firmware settings require an integration that is not installed.',
      );
    } finally {
      setBusy(null);
    }
  };
  const apply = (profile: Profile) => {
    // The profile only reaches system audio while desktop EQ is on.
    const listening = useNativeAudio.getState().state?.active === true;
    return run(
      profile.id,
      async () => {
        await applyProfile(profile, applySavedEq);
        useApp.getState().setLastProfile(profile.id);
      },
      listening
        ? `Applied ${profile.name}.`
        : `Applied ${profile.name}. Turn on desktop EQ to hear it.`,
    );
  };
  const items = compact ? query.data?.slice(0, 3) : query.data;
  return (
    <section
      className={`profiles-panel panel ${compact ? 'compact' : ''}`}
      aria-labelledby={compact ? 'profiles-summary-heading' : 'profiles-heading'}
    >
      <SectionBar
        id={compact ? 'profiles-summary-heading' : 'profiles-heading'}
        title="Your sound profiles"
      >
        <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus />
          {compact ? 'Save' : 'New profile'}
        </Button>
      </SectionBar>
      {query.isLoading && <p className="empty-copy">Loading saved profiles…</p>}
      {query.error && (
        <p className="inline-error" role="alert">
          Profiles could not be loaded from IndexedDB. Enable local storage and retry.
        </p>
      )}
      {query.data?.length === 0 && (
        <div className="profiles-empty">
          <Music2 />
          <div>
            <h3>Keep the settings you love</h3>
            <p>Adjust the EQ, then save it.</p>
          </div>
        </div>
      )}
      <div className="profile-list">
        {items?.map((profile) => (
          <article className="profile-row" key={profile.id}>
            <div className="profile-identity">
              <Music2 />
              <div>
                <h3>
                  {profile.name}
                  {preferred.data === profile.id && (
                    <Star className="preferred-icon" aria-label="Preferred profile" />
                  )}
                </h3>
                <p>
                  {profile.hardware ? 'Audio + hardware settings' : 'Audio EQ'}
                  {profile.targetDeviceId ? ' · associated device' : ' · any audio output'}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={lastProfile === profile.id ? 'secondary' : 'outline'}
              disabled={busy !== null}
              onClick={() => void apply(profile)}
            >
              {lastProfile === profile.id ? (
                <>
                  <Check />
                  Applied
                </>
              ) : (
                'Apply'
              )}
            </Button>
            {!compact && (
              <div className="profile-actions">
                <Action
                  label="Rename profile"
                  onClick={() => setRenaming(profile)}
                  disabled={busy !== null}
                >
                  <Pencil />
                </Action>
                <Action
                  label="Update profile from current EQ"
                  onClick={() =>
                    void run(
                      profile.id,
                      () => profiles.updateEq(profile.id, useApp.getState().eq),
                      'Profile updated from current EQ.',
                    )
                  }
                  disabled={busy !== null}
                >
                  <Save />
                </Action>
                <Action
                  label="Duplicate profile"
                  onClick={() =>
                    void run(
                      profile.id,
                      () => profiles.duplicate(profile.id),
                      'Profile duplicated.',
                    )
                  }
                  disabled={busy !== null}
                >
                  <Copy />
                </Action>
                <Action
                  label="Set preferred profile"
                  onClick={() =>
                    void run(
                      profile.id,
                      () => profiles.setPreferred(profile.id),
                      'Preferred profile saved.',
                    )
                  }
                  disabled={busy !== null}
                >
                  <Star />
                </Action>
                <Action
                  label="Delete profile"
                  onClick={() => setDeleting(profile)}
                  disabled={busy !== null}
                >
                  <Trash2 />
                </Action>
              </div>
            )}
          </article>
        ))}
      </div>
      <div role="status" aria-live="polite">
        {notice && <p className="operation-notice">{notice}</p>}
        {error && <p className="inline-error">{error}</p>}
      </div>
      {!compact && (
        <p className="fine-print">
          Applying a profile updates the desktop EQ when it is on. Headset hardware is never changed
          automatically.
        </p>
      )}
      <ProfileDialog open={createOpen} onOpenChange={setCreateOpen} />
      {renaming && (
        <ProfileDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          profile={renaming}
        />
      )}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete profile?</DialogTitle>
            <DialogDescription>
              {deleting?.name} will be removed from local storage. Current EQ settings will stay as
              they are.
            </DialogDescription>
          </DialogHeader>
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep profile
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const profile = deleting;
                if (!profile) return;
                void run(
                  profile.id,
                  async () => {
                    await profiles.remove(profile.id);
                    if (useApp.getState().lastProfile === profile.id)
                      useApp.getState().setLastProfile(null);
                    setDeleting(null);
                  },
                  'Profile deleted.',
                );
              }}
              disabled={busy !== null}
            >
              Delete profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function Action({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export const ProfilesPanel = memo(ProfilesPanelBase);
