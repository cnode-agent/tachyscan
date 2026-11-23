// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import contracts from './contracts.json';
import views from './views.json';
import notes from './notes.json';
import { fitView, zoomAt, MIN_SCALE, MAX_SCALE } from './viewport';

const graphs = import.meta.glob('./graphs/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const readGraph = (id: string) => new DOMParser().parseFromString(graphs[`./graphs/${id}.svg`], 'image/svg+xml');

describe('pinned Tachyon proof contracts', () => {
  it('covers every registered step, including optional serving and stamp operations', () => {
    expect(contracts.steps.map((step) => step.index)).toEqual(Array.from({ length: 39 }, (_, index) => index));
    expect(contracts.headers).toHaveLength(17);
    expect(new Set(contracts.steps.map((step) => step.name))).toEqual(new Set(Object.keys(notes)));
    expect(new Set(views.flatMap((view) => view.steps))).toEqual(new Set(contracts.steps.map((step) => step.name)));
    expect(contracts.revision).toMatch(/^[a-f0-9]{40}$/);
  });

  it('preserves subtle contracts that must not be inferred from step names', () => {
    const step = (name: string) => contracts.steps.find((item) => item.name === name)!;
    const header = (name: string) => contracts.headers.find((item) => item.name === name)!;
    expect(step('SpendableInit').left).toBe('NoteNullifiers');
    expect(step('SpendBind').right).toBe('NoteSecret');
    expect(step('QrIntakeSplit').witness.map((w) => w.name)).toEqual(['non_residue', 'residue']);
    expect(header('QrIntakeSides').slots).toEqual(['PolySlot<TachygramSetPoly, ResidueSide>', 'PolySlot<TachygramSetPoly, NonResidueSide>']);
    expect(header('QrBucket').slots).toEqual(['Padding', 'PolySlot<TachygramSetPoly>']);
    expect(header('QrIntake').slots).toEqual(['Padding', 'PolySlot<TachygramSetPoly>']);
    expect(step('EvidenceTreeFuse').left).toBe('EvidenceTreePair');
    expect(step('FeeFuse').witness.map((w) => w.type)).toEqual(['Note', 'value::Positive', 'ActionSetPoly', 'TachygramSetPoly']);
  });

  it.each(views)('renders exact inputs, outputs and witness colors in $id', (view) => {
    const graph = readGraph(view.id);
    expect(graph.querySelector('parsererror')).toBeNull();
    // SVG is trusted build output, never executable markup or fetched user content.
    expect(graph.querySelector('script, foreignObject, a, image')).toBeNull();
    const selected = view.id === 'all' ? contracts.steps : contracts.steps.filter((s) => view.steps.includes(s.name));
    const neededHeaders = new Set(selected.flatMap((s) => [s.left, s.right, s.output]).filter((s) => s !== '()'));
    expect(graph.querySelectorAll('[data-node]').length).toBe(selected.length + neededHeaders.size);
    const edges = [...graph.querySelectorAll('.edge > title')].map((t) => t.textContent);
    for (const step of selected) {
      const target = graph.querySelector(`[data-node="${step.name}"]`)!;
      expect(target.getAttribute('role')).toBe('button');
      expect(target.getAttribute('tabindex')).toBe('0');
      expect(edges).toContain(`${step.name}->${step.output}`);
      for (const [port, header] of [['L', step.left], ['R', step.right]]) {
        expect(edges).toContain(`${header === '()' ? `${step.name}-${port}` : header}->${step.name}`);
      }
      if (step.left === step.right && step.left !== '()') {
        expect(edges.filter((edge) => edge === `${step.left}->${step.name}`)).toHaveLength(2);
      }
      if (step.witness.length) {
        expect(edges).toContain(`w-${step.name}->${step.name}`);
        const witness = [...graph.querySelectorAll('.node')].find((n) => n.querySelector('title')?.textContent === `w-${step.name}`)!;
        for (const item of step.witness) {
          const label = `${item.name}${item.polynomial ? `: ${item.type}` : ''}`;
          const text = [...witness.querySelectorAll('text')].find((t) => t.textContent === label)!;
          expect(text.getAttribute('fill')).toBe(item.polynomial ? '#b91c32' : '#171717');
        }
      }
    }
    for (const header of contracts.headers.filter((h) => neededHeaders.has(h.name))) {
      const target = graph.querySelector(`[data-node="${header.name}"]`)!;
      header.slots.forEach((slot, i) => {
        const labels = [...target.querySelectorAll('text')].filter((t) => t.textContent?.startsWith(`O${i}:`));
        expect(labels).toHaveLength(slot === 'Padding' ? 0 : 1);
        if (labels.length) expect(labels[0].getAttribute('fill')).toBe('#b91c32');
      });
    }
  });
});

describe('pan/zoom geometry', () => {
  it('keeps the world point under the cursor fixed, including at zoom limits', () => {
    const view = { x: -320, y: 90, scale: 0.6 }, point = { x: 600, y: 200 };
    for (const factor of [0.01, 1.3, 100]) {
      const next = zoomAt(view, factor, point);
      expect((point.x - next.x) / next.scale).toBeCloseTo((point.x - view.x) / view.scale);
      expect((point.y - next.y) / next.scale).toBeCloseTo((point.y - view.y) / view.scale);
      expect(next.scale).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(next.scale).toBeLessThanOrEqual(MAX_SCALE);
    }
  });
  it('fits a wide graph within the board and centers it', () => {
    const view = fitView(1000, 600, 5000, 1500);
    expect(view.scale * 5000).toBeLessThanOrEqual(968);
    expect(view.x * 2 + 5000 * view.scale).toBeCloseTo(1000);
    expect(view.y * 2 + 1500 * view.scale).toBeCloseTo(600);
  });
});
