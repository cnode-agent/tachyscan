import { useMemo } from 'preact/hooks';
import type { EpochProgress } from './lib';
import type { Dashboard } from './types';
import { durationUntil, epochProgress, formatBytes, indexLag, pruningDate } from './lib';

export function EpochPanel({ dashboard, now, pulse }: {
  dashboard: Dashboard;
  now: number;
  /** Changes when a new block lands so the ring can acknowledge it once. */
  pulse: number | null;
}) {
  const progress = epochProgress(dashboard.height, dashboard.activationHeight, dashboard.epochLength);
  const lag = indexLag(dashboard.index, dashboard.height);
  const pruneAt = useMemo(
    () => pruningDate(dashboard.height, dashboard.activationHeight, dashboard.epochLength, dashboard.blockTargetSeconds),
    [dashboard.height, dashboard.activationHeight, dashboard.epochLength, dashboard.blockTargetSeconds],
  );

  if (!progress) {
    return (
      <section class="panel epoch-panel">
        <div class="panel-label"><span>EPOCH</span><b>not active</b></div>
        <p class="epoch-empty">Tachyon activates at block {dashboard.activationHeight.toLocaleString()}.</p>
      </section>
    );
  }

  return (
    <section class="panel epoch-panel">
      <div class="panel-label">
        <span>EPOCH {progress.epoch.toLocaleString()}</span>
        <b class="epoch-retention">
          <span>{dashboard.retainedTachygramCount.toLocaleString()} retained</span>
          <span aria-hidden="true">·</span>
          <span>{formatBytes(dashboard.tachygramPayloadBytes)} non-pruned</span>
          {lag > 0 && <em class="index-lag" title={`The tachygram index is ${lag} block${lag === 1 ? '' : 's'} behind the chain tip`}>indexing {dashboard.index.scannedHeight?.toLocaleString()}</em>}
        </b>
      </div>

      <EpochRing progress={progress} pruneText={durationUntil(pruneAt, now)} pulse={pulse} />
    </section>
  );
}

const RING_SIZE = 220;
const RING_RADIUS = 88;
const RING_TICKS = 32;

/** The epoch as a dial: the boundary sits at twelve o'clock, the filled arc is the blocks
 *  seen so far, and the particle is the tip. */
function EpochRing({ progress, pruneText, pulse }: {
  progress: EpochProgress;
  pruneText: string;
  pulse: number | null;
}) {
  const centre = RING_SIZE / 2;
  const circumference = 2 * Math.PI * RING_RADIUS;
  const angle = progress.fraction * 2 * Math.PI;
  const tipX = centre + RING_RADIUS * Math.sin(angle);
  const tipY = centre - RING_RADIUS * Math.cos(angle);
  const ticks = Array.from({ length: RING_TICKS }, (_, index) => {
    const theta = (index / RING_TICKS) * 2 * Math.PI;
    const inner = RING_RADIUS - (index % 8 === 0 ? 9 : 5);
    const outer = RING_RADIUS - 1;
    return {
      x1: centre + inner * Math.sin(theta), y1: centre - inner * Math.cos(theta),
      x2: centre + outer * Math.sin(theta), y2: centre - outer * Math.cos(theta),
      major: index % 8 === 0,
      lit: index / RING_TICKS <= progress.fraction,
    };
  });
  return (
    <div class="epoch-ring" role="group" aria-label={`Block ${progress.index.toLocaleString()} of ${progress.length.toLocaleString()} in epoch ${progress.epoch.toLocaleString()}`}>
      <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true" key={pulse ?? 'ring'} class={pulse !== null ? 'pulse' : ''}>
        <circle class="ring-track" cx={centre} cy={centre} r={RING_RADIUS} />
        {ticks.map((tick, index) => (
          <line key={index} class={`ring-tick ${tick.major ? 'major' : ''} ${tick.lit ? 'lit' : ''}`} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />
        ))}
        <circle
          class="ring-arc"
          cx={centre}
          cy={centre}
          r={RING_RADIUS}
          transform={`rotate(-90 ${centre} ${centre})`}
          stroke-dasharray={`${circumference * progress.fraction} ${circumference}`}
        />
        <line class="ring-boundary" x1={centre} y1={centre - RING_RADIUS - 10} x2={centre} y2={centre - RING_RADIUS + 10} />
        <circle class="ring-tip-glow" cx={tipX} cy={tipY} r={11} />
        <circle class="ring-tip" cx={tipX} cy={tipY} r={4} />
      </svg>
      <div class="ring-centre">
        <span class="ring-label">epoch</span>
        <strong>{progress.epoch.toLocaleString()}</strong>
        <span class="ring-detail">block <b>{progress.index.toLocaleString()}</b> of {progress.length.toLocaleString()}</span>
        <span class="ring-detail">prunes in <b>{pruneText}</b></span>
      </div>
    </div>
  );
}
