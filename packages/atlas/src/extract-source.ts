/**
 * Source-structure extractor.
 *
 * A single project is drawn as its src tree: one node per top-level folder
 * or loose file, with import edges between those parts. Files stay on the
 * node so the tooltip can list them.
 */

import {readdir, readFile} from 'node:fs/promises';
import {existsSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {
  IMPORTS,
  atlasEdgeId,
  type AtlasEdge,
  type AtlasSnapshot,
  type PackageNode,
} from './model.js';

const SOURCE_FILE = /\.(?:[cm]?[jt]s|tsx)$/;
const FROM_SPECIFIER =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"`]{0,500}?\bfrom\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

interface SourceFile {
  readonly absolute: string;
  readonly relativeToSource: string;
}

/**
 * Maps one project's source tree.
 *
 * An edge A → B means A must exist before B: the imported part points at the
 * part that imports it. Rank 0 is a part that imports nothing else in src.
 */
export async function extractSource(root: string): Promise<AtlasSnapshot> {
  const resolvedRoot = resolve(root);
  const sourceDirectory = await findSourceRoot(resolvedRoot);
  const files = sourceDirectory === null ? [] : await sourceFiles(sourceDirectory, sourceDirectory);

  const grouped = new Map<string, SourceFile[]>();
  for (const file of files) {
    const key = file.relativeToSource.split('/')[0] ?? file.relativeToSource;
    const group = grouped.get(key);
    if (group) group.push(file);
    else grouped.set(key, [file]);
  }

  const nodes: PackageNode[] = [...grouped.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([id, members]) => {
      const folder = members.some((file) => file.relativeToSource.includes('/'));
      const listed = members
        .map((file) =>
          folder ? file.relativeToSource.slice(id.length + 1) : file.relativeToSource,
        )
        .sort();

      return {
        id,
        version: '',
        private: false,
        path: toPosix(relative(resolvedRoot, join(sourceDirectory ?? resolvedRoot, id))),
        description: '',
        files: listed,
      };
    });

  const nodeOf = new Map<string, string>();
  for (const [id, members] of grouped) {
    for (const file of members) nodeOf.set(file.absolute, id);
  }

  const edges = new Map<string, AtlasEdge>();
  const texts = await Promise.all(
    files.map(async (file) => ({file, text: await readFile(file.absolute, 'utf8')})),
  );

  for (const {file, text} of texts) {
    const importer = nodeOf.get(file.absolute);
    if (importer === undefined) continue;

    for (const specifier of specifiers(text)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveSpecifier(file.absolute, specifier);
      if (resolved === null) continue;
      const imported = nodeOf.get(resolved);
      if (imported === undefined || imported === importer) continue;
      const id = atlasEdgeId(IMPORTS, imported, importer);
      if (!edges.has(id)) {
        edges.set(id, {id, from: imported, to: importer, relation: IMPORTS});
      }
    }
  }

  return {
    nodes,
    edges: [...edges.values()].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
    extractedAt: new Date().toISOString(),
    root: resolvedRoot,
    kind: 'source',
  };
}

/**
 * Opens one folder or file from a source map.
 *
 * The nodes are the files inside that part, plus the files they import and
 * the files that import them. Edges stay `imports`.
 */
export async function extractSourceFocus(
  root: string,
  nodePath: string,
): Promise<AtlasSnapshot | null> {
  const resolvedRoot = resolve(root);
  const sourceDirectory = await findSourceRoot(resolvedRoot);
  if (sourceDirectory === null || nodePath.length === 0) return null;

  const files = await sourceFiles(sourceDirectory, sourceDirectory);
  const focus = files.filter((file) => {
    const fromRoot = toPosix(relative(resolvedRoot, file.absolute));
    return fromRoot === nodePath || fromRoot.startsWith(`${nodePath}/`);
  });
  if (focus.length === 0) return null;

  const texts = await Promise.all(
    files.map(async (file) => ({file, text: await readFile(file.absolute, 'utf8')})),
  );
  const importsOf = new Map<string, readonly string[]>();

  for (const {file, text} of texts) {
    const imported: string[] = [];
    for (const specifier of specifiers(text)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveSpecifier(file.absolute, specifier);
      if (resolved !== null) imported.push(resolved);
    }
    importsOf.set(file.absolute, imported);
  }

  const focusPaths = new Set(focus.map((file) => file.absolute));
  const include = new Set(focusPaths);

  for (const file of focus) {
    for (const target of importsOf.get(file.absolute) ?? []) include.add(target);
  }

  for (const [importer, targets] of importsOf) {
    if (targets.some((target) => focusPaths.has(target))) include.add(importer);
  }

  const byAbsolute = new Map(files.map((file) => [file.absolute, file]));
  const visible: SourceFile[] = [];

  for (const absolute of include) {
    const known = byAbsolute.get(absolute);
    if (known) {
      visible.push(known);
      continue;
    }
    visible.push({
      absolute,
      relativeToSource: toPosix(relative(sourceDirectory, absolute)),
    });
  }

  const ids = fileIds(visible);
  const nodes: PackageNode[] = visible
    .map((file) => {
      const fromRoot = toPosix(relative(resolvedRoot, file.absolute));
      const inside = fromRoot === nodePath || fromRoot.startsWith(`${nodePath}/`);
      return {
        id: ids.get(file.absolute) ?? file.relativeToSource,
        version: inside ? '' : 'link',
        private: false,
        path: fromRoot,
        description: inside ? '' : 'Outside this part.',
      };
    })
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  const idOf = new Map<string, string>();
  for (const file of visible) {
    const id = ids.get(file.absolute);
    if (id) idOf.set(file.absolute, id);
  }

  const edges = new Map<string, AtlasEdge>();
  for (const [importer, targets] of importsOf) {
    const to = idOf.get(importer);
    if (to === undefined) continue;
    for (const target of targets) {
      const from = idOf.get(target);
      if (from === undefined || from === to) continue;
      const id = atlasEdgeId(IMPORTS, from, to);
      if (!edges.has(id)) edges.set(id, {id, from, to, relation: IMPORTS});
    }
  }

  return {
    nodes,
    edges: [...edges.values()].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
    extractedAt: new Date().toISOString(),
    root: resolvedRoot,
    kind: 'source',
  };
}

function fileIds(files: readonly SourceFile[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const base = file.relativeToSource.split('/').pop() ?? file.relativeToSource;
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }

  const ids = new Map<string, string>();
  for (const file of files) {
    const base = file.relativeToSource.split('/').pop() ?? file.relativeToSource;
    ids.set(file.absolute, (counts.get(base) ?? 0) > 1 ? file.relativeToSource : base);
  }
  return ids;
}

async function findSourceRoot(root: string): Promise<string | null> {
  const src = join(root, 'src');
  if ((await sourceFiles(src, src)).length > 0) return src;
  if ((await sourceFiles(root, root)).length > 0) return root;
  return null;
}

async function sourceFiles(directory: string, sourceRoot: string): Promise<SourceFile[]> {
  let entries;
  try {
    entries = await readdir(directory, {withFileTypes: true});
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'coverage' ||
        entry.name.startsWith('.')
      ) {
        return [];
      }

      const full = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full, sourceRoot);
      if (!SOURCE_FILE.test(entry.name) || entry.name.endsWith('.d.ts')) return [];
      return [{absolute: full, relativeToSource: toPosix(relative(sourceRoot, full))}];
    }),
  );

  return nested.flat();
}

function specifiers(text: string): string[] {
  const source = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found = new Set<string>();

  for (const match of source.matchAll(FROM_SPECIFIER)) {
    const specifier = match[1];
    if (specifier) found.add(specifier);
  }

  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    const specifier = match[1];
    if (specifier) found.add(specifier);
  }

  return [...found];
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base];

  if (base.endsWith('.js')) {
    candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  } else if (base.endsWith('.mjs')) {
    candidates.push(`${base.slice(0, -4)}.ts`);
  }

  candidates.push(
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }

  return null;
}

function toPosix(value: string): string {
  return value.split(sep).join('/');
}
