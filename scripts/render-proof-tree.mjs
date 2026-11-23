// Graphviz runs only here, at development time. No WASM or layout engine is shipped.
import { instance } from '@viz-js/viz';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const read = async (name) => JSON.parse(await readFile(`src/proof-tree/${name}.json`, 'utf8'));
const { steps, headers } = await read('contracts');
const views = await read('views');
const viz = await instance();
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const row = (text, color = '#171717', size = 13) => `<TR><TD><FONT COLOR="${color}" POINT-SIZE="${size}">${escape(text)}</FONT></TD></TR>`;
const table = (rows) => `<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="3">${rows.join('')}</TABLE>`;
await mkdir('src/proof-tree/graphs', { recursive: true });
for (const view of views) {
  const selected = view.id === 'all' ? steps : steps.filter((s) => view.steps.includes(s.name));
  const needed = new Set(selected.flatMap((s) => [s.left, s.right, s.output]));
  const lines = [
    'digraph { graph [rankdir=LR, bgcolor="transparent", pad="0.35", nodesep="0.45", ranksep="0.9", outputorder=edgesfirst];',
    'node [fontname="Helvetica", fontsize=16, color="#171717", penwidth=1.5, style=filled, fillcolor="#fffef9"];',
    'edge [fontname="Helvetica", fontsize=11, color="#44413b", arrowsize=0.7];',
  ];
  for (const header of headers.filter((h) => needed.has(h.name))) {
    const rows = [row(header.name, '#171717', 17)];
    for (let i = 0; i < header.fields.length; i += 3) rows.push(row(header.fields.slice(i, i + 3).join(', ')));
    header.slots.forEach((slot, i) => {
      if (slot !== 'Padding') rows.push(row(`O${i}: ${slot.replace(/^PolySlot<|>$/g, '')}`, '#b91c32'));
    });
    lines.push(`"${header.name}" [id="node-${header.name}", shape=ellipse, margin="0.16,0.08", label=<${table(rows)}>];`);
  }
  for (const step of selected) {
    lines.push(`"${step.name}" [id="node-${step.name}", shape=box, margin="0.18,0.14", label="${step.name}"];`);
    for (const [port, header] of [['L', step.left], ['R', step.right]]) {
      if (header === '()') {
        // Keep absent inputs visible without introducing imaginary proof headers.
        lines.push(`"${step.name}-${port}" [shape=plaintext, label="×", fontsize=19];`);
        lines.push(`"${step.name}-${port}" -> "${step.name}" [headlabel="${port}"];`);
      } else {
        lines.push(`"${header}" -> "${step.name}" [headlabel="${port}", labeldistance=2, constraint=${header !== step.output}];`);
      }
    }
    lines.push(`"${step.name}" -> "${step.output}" [weight=4];`);
    if (step.witness.length) {
      const rows = [row('witness', '#57534e', 11), ...step.witness.map((w) => row(`${w.name}${w.polynomial ? `: ${w.type}` : ''}`, w.polynomial ? '#b91c32' : '#171717'))];
      lines.push(`"w-${step.name}" [shape=plaintext, label=<${table(rows)}>];`);
      lines.push(`{ rank=same; "${step.name}"; "w-${step.name}"; }`);
      lines.push(`"w-${step.name}" -> "${step.name}" [style=dashed, constraint=false];`);
    }
  }
  lines.push('}');
  let svg = viz.renderString(lines.join('\n'), { format: 'svg', engine: 'dot' });
  svg = svg.slice(svg.indexOf('<svg')).replace(/<svg[^>]*>/, (tag) => tag.replace(/ width="[^"]*"| height="[^"]*"/g, '').replace('<svg', '<svg role="group" aria-label="Proof types and their dependencies"'));
  // Give nodes stable accessible targets; their text details also appear in the inspector.
  svg = svg.replace(/<g id="node(?:-|&#45;)([\w]+)" class="node">/g, (_, name) =>
    `<g id="node-${name}" class="node" data-node="${name}" role="button" tabindex="0" aria-label="Inspect ${name}">`);
  await writeFile(`src/proof-tree/graphs/${view.id}.svg`, svg);
  console.log(`${view.id}: ${selected.length} steps, ${svg.length.toLocaleString()} bytes`);
}
