import { Shield, HardDrive, Palette } from 'lucide-react';
import { SectionBar } from '@/components/section-bar';
import { Diagnostics } from '@/features/diagnostics/diagnostics';
export function Settings() {
  return (
    <>
      <section className="panel settings-panel">
        <SectionBar title="About Openear">
          <span className="subtle-label">0.1 · Linux desktop</span>
        </SectionBar>
        <div className="settings-explanation">
          <Palette />
          <div>
            <h3>Matches your device</h3>
            <p>Known receivers show their brand colors. Other outputs use a neutral theme.</p>
          </div>
        </div>
        <div className="settings-explanation">
          <HardDrive />
          <div>
            <h3>Saved on this computer</h3>
            <p>Profiles and preferences stay on this computer.</p>
          </div>
        </div>
        <div className="settings-explanation">
          <Shield />
          <div>
            <h3>Private by default</h3>
            <p>No analytics or remote requests. Quit from the tray to restore audio.</p>
          </div>
        </div>
      </section>
      <Diagnostics />
    </>
  );
}
