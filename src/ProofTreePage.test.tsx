// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProofTreePage } from './ProofTreePage';
let host: HTMLDivElement;
beforeEach(async () => {
  host = document.createElement('div'); document.body.append(host);
  await act(() => render(<ProofTreePage />, host));
});
afterEach(async () => { await act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label || b.getAttribute('aria-label') === label)!;
const zoom = () => Number(host.querySelector('output')!.textContent!.replace('%', ''));
const canvas = () => host.querySelector<HTMLElement>('.proof-canvas')!;
const transform = () => host.querySelector<HTMLElement>('.proof-drawing')!.style.transform;
async function key(target: Element, key: string) { await act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); }

it('lets keyboard users inspect steps and exact polynomial slots without a node connection', async () => {
  await key(host.querySelector('[data-node="NullifierDerive"]')!, 'Enter');
  expect(host.querySelector('aside h3')?.textContent).toBe('NullifierDerive');
  expect(host.querySelector('aside .proof-red')?.textContent).toContain('seq');
  expect(host.querySelector('.proof-source')?.getAttribute('href')).toContain('/delegation.rs#L');
  await key(host.querySelector('[data-node="NoteNullifiers"]')!, ' ');
  expect(host.querySelector('aside h3')?.textContent).toBe('NoteNullifiers');
  expect(host.querySelector('.proof-slots')?.textContent).toContain('O0NfSeqPolyO1Padding');
});

it('supports buttons, keyboard pan/zoom, wheel zoom, and fit reset', async () => {
  const initialZoom = zoom(), initialTransform = transform();
  await act(() => button('Zoom in').click()); expect(zoom()).toBeGreaterThan(initialZoom);
  await key(canvas(), 'ArrowLeft'); expect(transform()).not.toBe(initialTransform);
  await key(canvas(), '+');
  const beforeWheel = zoom();
  await act(() => { canvas().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 100, bubbles: true, cancelable: true })); });
  expect(zoom()).toBeGreaterThan(beforeWheel);
  await act(() => button('Fit').click()); expect(transform()).toBe(initialTransform);
  await act(() => button('100%').click()); expect(zoom()).toBe(100);
  await key(canvas(), '0'); expect(zoom()).toBe(initialZoom);
});

it('switches views and exposes all 39 steps in the complete map', async () => {
  await act(() => button('Epoch → buckets').click());
  expect(host.querySelector('[data-node="QrBucketSeal"]')).not.toBeNull();
  expect(host.querySelector('[data-node="SpendBind"]')).toBeNull();
  await act(() => button('Complete map').click());
  expect(host.querySelectorAll('[data-node]')).toHaveLength(56);
});

it('distinguishes a pointer click from a drag and supports two-finger zoom', async () => {
  // JSDOM has no native PointerEvent, so provide its public event fields.
  const pointer = async (target: Element, type: string, id: number, x: number, y: number) => {
    const event = new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: id });
    await act(() => { target.dispatchEvent(event); });
  };
  const node = host.querySelector('[data-node="NoteSeed"]')!;
  await pointer(node, 'pointerdown', 1, 20, 20);
  await pointer(canvas(), 'pointerup', 1, 20, 20);
  expect(host.querySelector('aside h3')?.textContent).toBe('NoteSeed');
  const previous = transform();
  await pointer(host.querySelector('[data-node="SpendBind"]')!, 'pointerdown', 1, 20, 20);
  await pointer(canvas(), 'pointermove', 1, 90, 60);
  await pointer(canvas(), 'pointerup', 1, 90, 60);
  expect(host.querySelector('aside h3')?.textContent).toBe('NoteSeed');
  expect(transform()).not.toBe(previous);
  const beforePinch = zoom();
  await pointer(canvas(), 'pointerdown', 1, 100, 100);
  await pointer(canvas(), 'pointerdown', 2, 200, 100);
  await pointer(canvas(), 'pointermove', 2, 300, 100);
  await pointer(canvas(), 'pointerup', 2, 300, 100);
  await pointer(canvas(), 'pointerup', 1, 100, 100);
  expect(zoom()).toBeGreaterThan(beforePinch);
});


it('finds a step in another view and focuses it at readable scale', async () => {
  const select = host.querySelector('select')!;
  await act(async () => {
    select.value = 'QrBucketSeal';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(button('Epoch → buckets').getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('aside h3')?.textContent).toBe('QrBucketSeal');
  expect(zoom()).toBe(100);
});
