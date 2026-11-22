import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Stage } from '../../.agents/skills/stageshow/kit/stage';
import { Window } from '../../.agents/skills/stageshow/kit/window';
import { Button } from '../../.agents/skills/stageshow/kit/controls/Button';
import { Card } from '../../.agents/skills/stageshow/kit/parts/Card';
import { Kbd } from '../../.agents/skills/stageshow/kit/parts/Kbd';
import cityPicker from '../index.html?raw';
import '../theme.css';
import './review.css';

const map = new DOMParser()
  .parseFromString(cityPicker, 'text/html')
  .querySelector('[data-href="gion-taxi.html"] svg')?.outerHTML ?? '';

const chapters = ['Palette', 'Typography', 'Controls', 'Crew'] as const;
type Chapter = typeof chapters[number];

const notes: Record<Chapter, string> = {
  Palette: 'Linen sets the ground, cream lifts the cards, terracotta marks the primary action, and taxi yellow identifies the shift ticket.',
  Typography: 'Zimula InkSpot Medium is specified for headings and Suisse Intl for body text. Inter is the fallback. Driving stats and room codes use tabular digits.',
  Controls: 'Terracotta leads to solo play, beige offers crew play, and keycaps group the driving shortcuts.',
  Crew: 'Role names stay visible on the phone. A green surface and a checkmark confirm readiness.',
};

const swatches = [
  ['Linen', '--paper'], ['Cream', '--panel'], ['Terracotta', '--color-accent-500'],
  ['Taxi yellow', '--ticket'], ['Ink', '--ink'],
] as const;

function Specimen({ chapter }: { chapter: Chapter }) {
  switch (chapter) {
    case 'Palette':
      return <div className="swatches">{swatches.map(([name, token]) => (
        <div key={token}>
          <div className="swatch" style={{ background: `var(${token})` }} />
          <strong>{name}</strong>
        </div>
      ))}</div>;
    case 'Typography':
      return <div className="type-samples">
        <div><strong className="type-title">Crew shift</strong><small>Title · 24 px · Medium</small></div>
        <div><strong className="type-body">Play with phones</strong><small>Body · 14 px · Medium</small></div>
        <div><strong className="type-caption">ROOM CODE</strong><small>Caption · 12 px · Semibold</small></div>
      </div>;
    case 'Controls':
      return <div className="keys">
        <span><Kbd keys={["W"]} /> Drive</span>
        <span><Kbd keys={["S"]} /> Brake / reverse</span>
        <span><Kbd keys={["C"]} /> Camera</span>
        <span><Kbd keys={["Esc"]} /> End shift</span>
      </div>;
    case 'Crew':
      return <div className="crew-sample">
        <div><small>Room · Taxi shift</small><strong className="type-title">Player 1</strong></div>
        <Button role="presentation" className="ready" size="large">Ready ✓</Button>
        <span className="crew-roles">Wheel · Pedals · Doors</span>
      </div>;
  }
}

function Review() {
  const [chapter, setChapter] = useState<Chapter>('Palette');
  return (
    <main className="review">
      <header className="review-header">
        <span className="review-brand">tandem</span>
        <h1>Design system</h1>
      </header>
      <nav className="chapter-nav" aria-label="Design system sections">
        {chapters.map(item => (
          <button key={item} type="button" aria-pressed={chapter === item} onClick={() => setChapter(item)}>{item}</button>
        ))}
      </nav>
      <p className="review-note" aria-live="polite">{notes[chapter]}</p>
      <Stage width={870} height={385} compact={{ below: 700, width: 358, height: 478 }} fidelity="realistic" className="review-stage"
        tokens={{
          '--ss-font': 'var(--sans)', '--ss-canvas': 'var(--paper)', '--ss-surface': 'var(--panel)',
          '--ss-accent': 'var(--color-accent-500)', '--ss-accent-soft': 'var(--color-accent-100)',
          '--ss-text-strong': 'var(--ink)', '--ss-text': 'var(--muted)', '--ss-line': 'var(--rule)',
        }}>
        {() => <>
          <Window title="Tandem · Kyoto" chrome="hairline" className="review-window">
            <div className="review-scene">
              <div className="review-map" aria-hidden="true" dangerouslySetInnerHTML={{ __html: map }} />
              <Card className="shift-sample" lift>
                <div className="sample-ticket"><small>Gion</small><strong>tandem</strong></div>
                <div className="action-samples">
                  <Button role="presentation" variant="primary" size="large">Start driving</Button>
                  <Button role="presentation" variant="secondary" size="large">Play with phones</Button>
                </div>
              </Card>
            </div>
          </Window>
          <Card className="detail-sample" lift>
            <h2>{chapter}</h2>
            <Specimen chapter={chapter} />
          </Card>
        </>}
      </Stage>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Review />);
