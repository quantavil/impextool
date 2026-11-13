import { CurrencySection } from "./sections/CurrencySection";
import { Dock } from "./sections/Dock";
import { HsnSection } from "./sections/HsnSection";
import { ReviewSection } from "./sections/ReviewSection";
import { ShipmentSection } from "./sections/ShipmentSection";
import { LoadError, UploadHero } from "./sections/UploadSection";
import * as s from "./store";
import { ThemeToggle, useFileDrop } from "./ui";

export function App() {
  const wb = s.workbook.value;
  const reviewing = s.reviewing.value && s.review.value !== null && s.output.value !== null;
  const dragging = useFileDrop((file) => void s.loadFile(file));
  return (
    <>
      <header className="topbar">
        <h1>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="var(--accent)" />
            <path
              d="M7 12.5l3.2 3.2L17 8.5"
              fill="none"
              stroke="var(--accent-ink)"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          ImpexTool
        </h1>
        <div className="bar-right">
          <ThemeToggle />
        </div>
      </header>
      {wb ? (
        <main className="workspace">
          <div className="load-error">
            <LoadError />
          </div>
          <div className="sheet">
            {reviewing ? (
              <ReviewSection />
            ) : (
              <>
                <ShipmentSection wb={wb} />
                <HsnSection wb={wb} />
                <CurrencySection wb={wb} />
              </>
            )}
          </div>
          <Dock wb={wb} />
        </main>
      ) : (
        <main className="landing">
          <UploadHero />
        </main>
      )}
      {dragging && (
        <div className="drop-veil" aria-hidden="true">
          Drop the workbook to load it
        </div>
      )}
    </>
  );
}
