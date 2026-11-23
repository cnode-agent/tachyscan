import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import contracts from './proof-tree/contracts.json';
import views from './proof-tree/views.json';
import descriptions from './proof-tree/notes.json';
import { fitView, zoomAt, type Point, type Viewport } from './proof-tree/viewport';
import wallet from './proof-tree/graphs/wallet.svg?raw';
import routing from './proof-tree/graphs/routing.svg?raw';
import absence from './proof-tree/graphs/absence.svg?raw';
import evidence from './proof-tree/graphs/evidence.svg?raw';
import stamps from './proof-tree/graphs/stamps.svg?raw';
import all from './proof-tree/graphs/all.svg?raw';
import './ProofTreePage.css';

const graphs: Record<string, string> = { wallet, routing, absence, evidence, stamps, all };
const notes: Record<string, string> = descriptions;
const byName = new Map([...contracts.steps, ...contracts.headers].map((node) => [node.name, node]));
const sourceUrl = (module: string, line: number) => `${contracts.repository}/blob/${contracts.revision}/crates/tachyon/src/stamp/proof/${module}.rs#L${line}`;
const slotName = (slot: string) => slot.replace(/^PolySlot<|>$/g, '');

export function ProofTreePage() {
  const [section, setSection] = useState('wallet');
  const [selected, setSelected] = useState('SpendBind');
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const canvas = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pendingFocus = useRef<string | null>(null);
  const gesture = useRef({ moved: false, node: '', start: { x: 0, y: 0 } });
  const current = views.find((item) => item.id === section)!;
  const node = byName.get(selected);

  const fit = () => {
    const svg = drawing.current?.querySelector('svg');
    if (!svg || !canvas.current) return;
    // Parsing the attribute also works in DOM implementations without SVGAnimatedRect.
    const [, , width, height] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    setView(fitView(canvas.current.clientWidth || 1000, canvas.current.clientHeight || 640, width, height));
  };

  useLayoutEffect(() => {
    fit();
    if (pendingFocus.current) {
      focusNode(pendingFocus.current);
      pendingFocus.current = null;
    }
    const element = canvas.current!;
    let width = element.clientWidth, height = element.clientHeight;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      // Resizing should preserve the user's zoom and the point at the center.
      const dx = (element.clientWidth - width) / 2, dy = (element.clientHeight - height) / 2;
      width = element.clientWidth;
      height = element.clientHeight;
      if (dx || dy) setView((previous) => ({ ...previous, x: previous.x + dx, y: previous.y + dy }));
    });
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [section]);

  useEffect(() => {
    drawing.current?.querySelectorAll('[data-node]').forEach((element) => {
      element.classList.toggle('selected', element.getAttribute('data-node') === selected);
    });
  }, [selected, section]);

  const center = (): Point => ({ x: (canvas.current?.clientWidth || 1000) / 2, y: (canvas.current?.clientHeight || 640) / 2 });
  const zoom = (factor: number) => setView((previous) => zoomAt(previous, factor, center()));

  useEffect(() => {
    const element = canvas.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      setView((previous) => zoomAt(previous, Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.004),
        { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const inspect = (name: string) => setSelected(name);
  const focusNode = (name: string) => {
    inspect(name);
    const element = drawing.current?.querySelector(`[data-node="${name}"]`);
    if (!element || !canvas.current) return;
    const rect = element.getBoundingClientRect();
    const outer = canvas.current.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2 - outer.left, y: rect.top + rect.height / 2 - outer.top };
    const target = center();
    // Use the transform currently rendered in the DOM, even when a fit update
    // is queued in the same layout effect after switching diagrams.
    setView({ scale: 1, x: target.x - (point.x - view.x) / view.scale, y: target.y - (point.y - view.y) / view.scale });
  };

  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!pointers.current.size) {
      gesture.current = { moved: false, start: point, node: (event.target as Element).closest('[data-node]')?.getAttribute('data-node') ?? '' };
    } else gesture.current.moved = true;
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.current.values()];
    const midpoint = (points: Point[]) => ({ x: points.reduce((n, p) => n + p.x, 0) / points.length, y: points.reduce((n, p) => n + p.y, 0) / points.length });
    const old = midpoint(before), next = midpoint(after);
    if (Math.hypot(event.clientX - gesture.current.start.x, event.clientY - gesture.current.start.y) > 4) gesture.current.moved = true;
    const rect = event.currentTarget.getBoundingClientRect();
    const distance = (points: Point[]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const factor = before.length === 2 && distance(before) > 0 ? distance(after) / distance(before) : 1;
    setView((previous) => {
      const scaled = zoomAt(previous, factor, { x: old.x - rect.left, y: old.y - rect.top });
      return { ...scaled, x: scaled.x + next.x - old.x, y: scaled.y + next.y - old.y };
    });
  };
  const onPointerUp = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    if (!gesture.current.moved && gesture.current.node) inspect(gesture.current.node);
  };
  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const name = (event.target as Element).closest('[data-node]')?.getAttribute('data-node');
    if (name && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); inspect(name); return; }
    const delta: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
    if (event.key in delta) {
      event.preventDefault();
      const [x, y] = delta[event.key];
      setView((previous) => ({ ...previous, x: previous.x + x, y: previous.y + y }));
    } else if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') fit(); else zoom(event.key === '-' ? 1 / 1.3 : 1.3);
    }
  };

  return <section class="proof-page" aria-labelledby="proof-heading">
    <div class="proof-heading">
      <div><p class="section-kicker">INSIDE THE PROOF SYSTEM</p><h2 id="proof-heading">Tachyon proof tree</h2></div>
      <a class="proof-revision" href={`${contracts.repository}/tree/${contracts.revision}`} target="_blank" rel="noreferrer">39 steps · source {contracts.revision.slice(0, 7)} ↗</a>
    </div>
    <p class="proof-intro">Follow the proofs from a note to a stamp. Click a rectangle or rounded header to inspect it.</p>
    <div class="proof-tabs" role="group" aria-label="Proof tree views">
      {views.map((item) => <button key={item.id} aria-pressed={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}
    </div>
    <p class="proof-view-description">{current.description}</p>
    <div class="proof-workbench">
      <div class="proof-board">
        <div class="proof-toolbar">
          <div class="proof-zoom" role="group" aria-label="Diagram controls">
            <button aria-label="Zoom out" onClick={() => zoom(1 / 1.3)}>−</button>
            <output aria-label="Zoom level">{Math.round(view.scale * 100)}%</output>
            <button aria-label="Zoom in" onClick={() => zoom(1.3)}>+</button>
            <button onClick={fit}>Fit</button>
            <button onClick={() => zoom(1 / view.scale)}>100%</button>
          </div>
          <label class="proof-find">Find a step <select value="" onChange={(event) => {
            const name = event.currentTarget.value;
            if (!name) return;
            const containing = current.id === 'all' || current.steps.includes(name) ? current : views.find((v) => v.steps.includes(name))!;
            if (containing.id !== section) {
              pendingFocus.current = name;
              setSection(containing.id);
            } else focusNode(name);
          }}><option value="">Choose a step…</option>{[...contracts.steps].sort((a, b) => a.name.localeCompare(b.name)).map((step) => <option key={step.name} value={step.name}>{step.name}</option>)}</select></label>
        </div>
        <div ref={canvas} class="proof-canvas" tabIndex={0} role="region" aria-label="Interactive Tachyon proof diagram" aria-describedby="proof-help"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={(event) => pointers.current.delete(event.pointerId)} onLostPointerCapture={(event) => pointers.current.delete(event.pointerId)} onKeyDown={onKeyDown}>
          <div ref={drawing} class="proof-drawing" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} dangerouslySetInnerHTML={{ __html: graphs[section] }} />
        </div>
        <div class="proof-legend">
          <span><i class="step-symbol" />Proof step</span><span><i class="header-symbol" />PCD header</span>
          <span class="proof-black">● Fields &amp; scalar/point witnesses</span><span class="proof-red">● Polynomials (O0 / O1)</span>
          <span>× No child proof</span><span>⇢ Witness</span><span>L / R: child inputs</span>
        </div>
        <p id="proof-help" class="proof-help">Drag to pan · Scroll or pinch to zoom · Focus the canvas: arrow keys to pan, + / − to zoom, 0 to fit.</p>
      </div>
      <aside class="proof-inspector" aria-label="Proof details" aria-live="polite">
        {node && <>
          <p class="section-kicker">{'left' in node ? 'PROOF STEP' : 'PCD HEADER'}</p>
          <h3>{node.name}</h3>
          {'left' in node ? <>
            <p>{notes[node.name]}</p>
            <dl class="proof-ports">
              <dt>Left child</dt><dd>{node.left === '()' ? '× No child proof' : <button onClick={() => inspect(node.left)}>{node.left}</button>}</dd>
              <dt>Right child</dt><dd>{node.right === '()' ? '× No child proof' : <button onClick={() => inspect(node.right)}>{node.right}</button>}</dd>
              <dt>Output header</dt><dd><button onClick={() => inspect(node.output)}>{node.output}</button></dd>
            </dl>
            <h4>Witness</h4>
            {node.witness.length ? <ul class="proof-witnesses">{node.witness.map((item) => <li key={item.name} class={item.polynomial ? 'proof-red' : ''}><strong>{item.name}</strong><code>{item.type}</code></li>)}</ul> : <p>No additional witness.</p>}
          </> : <>
            <h4>Header fields</h4><p class="proof-fields">{node.fields.join(', ')}</p>
            <h4>Polynomial slots</h4>
            <ul class="proof-slots">{node.slots.map((slot, i) => <li key={i}><b>O{i}</b><span class={slot === 'Padding' ? '' : 'proof-red'}>{slot === 'Padding' ? 'Padding' : slotName(slot)}</span></li>)}</ul>
            <p class="proof-slot-note">Slot types are shown exactly as declared. A polynomial slot does not imply every consumer reads it; padding has no semantic payload.</p>
            <h4>Produced by</h4><div class="proof-related">{contracts.steps.filter((s) => s.output === node.name).map((s) => <button key={s.name} onClick={() => inspect(s.name)}>{s.name}</button>)}</div>
            <h4>Consumed by</h4><div class="proof-related">{contracts.steps.filter((s) => s.left === node.name || s.right === node.name).map((s) => <button key={s.name} onClick={() => inspect(s.name)}>{s.name}</button>)}</div>
          </>}
          <a class="proof-source" href={sourceUrl(node.module, node.line)} target="_blank" rel="noreferrer">Read {node.name} in Rust ↗</a>
        </>}
      </aside>
    </div>
    <p class="proof-footnote">A map of proof types, not a live transaction. Arrows carry proven headers and their polynomial commitments; witnesses are additional prover inputs. Loops represent repeated composition of distinct proof instances. Chain membership still depends on consensus anchor checks. This snapshot follows the source revision above, which may differ from the node serving this explorer.</p>
  </section>;
}
