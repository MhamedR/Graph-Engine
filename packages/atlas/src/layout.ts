/**
 * Rank layout for one workspace snapshot.
 *
 * Cycles are contracted through strongly connected components so the
 * remaining DAG can be ranked. Pixel positions stay in the atlas.
 */

import type {AtlasSnapshot, Viewport} from './model.js';
import {buildPackageGraph, components, cycles} from './structural.js';

export interface PlacedNode {
  readonly id: string;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cyclic: boolean;
}

export interface PlacedEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly cyclic: boolean;
}

export interface RankBand {
  readonly index: number;
  readonly ids: readonly string[];
  readonly x: number;
  readonly width: number;
}

export interface AtlasLayout {
  readonly ranks: readonly RankBand[];
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  readonly width: number;
  readonly height: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
}

const NODE_HEIGHT = 54;
const NODE_GAP = 22;
const RANK_GAP = 76;
const PAD_X = 32;
const PAD_TOP = 36;
const PAD_BOTTOM = 24;

export function labelWidth(id: string): number {
  return Math.max(184, Math.ceil(id.length * 8.15 + 40));
}

/**
 * Places packages in ranks. Rank 0 is the leftmost column: packages with no
 * incoming edge in the contracted graph.
 */
export function layoutSnapshot(snapshot: AtlasSnapshot, viewport: Viewport): AtlasLayout {
  const width = Math.max(0, viewport.width);
  const height = Math.max(0, viewport.height);

  if (snapshot.nodes.length === 0 || width < 40 || height < 40) {
    return {ranks: [], nodes: [], edges: [], width, height, frameWidth: width, frameHeight: height};
  }

  const structure = buildPackageGraph(snapshot);
  const groups = components(structure);
  const componentOf = new Map<string, number>();

  groups.forEach((group, index) => {
    for (const id of group) componentOf.set(id, index);
  });

  const cyclicIds = new Set(cycles(structure).flat());
  const incoming: Array<Set<number>> = groups.map(() => new Set<number>());

  for (const edge of snapshot.edges) {
    const from = componentOf.get(edge.from);
    const to = componentOf.get(edge.to);
    if (from === undefined || to === undefined || from === to) continue;
    incoming[to]?.add(from);
  }

  const componentRank = rankComponents(incoming);
  const members = new Map<number, string[]>();

  for (const node of structure.graph.getNodes()) {
    const component = componentOf.get(node.id) ?? 0;
    const rank = componentRank[component] ?? 0;
    const list = members.get(rank) ?? [];
    list.push(node.id);
    members.set(rank, list);
  }

  const rankIndexes = [...members.keys()].sort((left, right) => left - right);

  for (const ids of members.values()) {
    ids.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  }

  const columnWidths = rankIndexes.map((rank) => {
    const ids = members.get(rank) ?? [];
    const widest = ids.reduce((max, id) => Math.max(max, labelWidth(id)), 0);
    return widest;
  });

  const gaps = Math.max(0, columnWidths.length - 1);
  const columnsTotal = columnWidths.reduce((sum, column) => sum + column, 0);
  const available = width - PAD_X * 2 - columnsTotal;
  const gap = gaps === 0 ? 0 : Math.max(RANK_GAP, available / gaps);

  const rankX = new Map<number, number>();
  let cursor = PAD_X;

  rankIndexes.forEach((rank, index) => {
    const column = columnWidths[index] ?? 0;
    rankX.set(rank, cursor);
    cursor += column + gap;
  });

  let contentHeight = height;

  for (const ids of members.values()) {
    const stack = ids.length * NODE_HEIGHT + Math.max(0, ids.length - 1) * NODE_GAP;
    contentHeight = Math.max(contentHeight, PAD_TOP + stack + PAD_BOTTOM);
  }

  const nodes: PlacedNode[] = [];

  for (const rank of rankIndexes) {
    const ids = members.get(rank) ?? [];
    const stack = ids.length * NODE_HEIGHT + Math.max(0, ids.length - 1) * NODE_GAP;
    let y = PAD_TOP + Math.max(0, (contentHeight - PAD_TOP - PAD_BOTTOM - stack) / 2);
    const x = rankX.get(rank) ?? PAD_X;

    for (const id of ids) {
      nodes.push({
        id,
        rank,
        x,
        y,
        width: labelWidth(id),
        height: NODE_HEIGHT,
        cyclic: cyclicIds.has(id),
      });
      y += NODE_HEIGHT + NODE_GAP;
    }
  }

  const placed = new Map(nodes.map((node) => [node.id, node]));
  const edges: PlacedEdge[] = snapshot.edges.flatMap((edge) => {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) return [];

    const sameComponent = componentOf.get(edge.from) === componentOf.get(edge.to);
    return [
      {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        relation: edge.relation,
        cyclic: sameComponent && (cyclicIds.has(edge.from) || edge.from === edge.to),
      },
    ];
  });

  const layoutWidth = Math.max(width, cursor - gap + PAD_X);
  const ranks: RankBand[] = rankIndexes.map((rank, index) => {
    const next = rankIndexes[index + 1];
    const start = index === 0 ? 0 : (rankX.get(rank) ?? 0);
    const end = next === undefined ? layoutWidth : (rankX.get(next) ?? layoutWidth);
    return {
      index: rank,
      ids: members.get(rank) ?? [],
      x: start,
      width: Math.max(0, end - start),
    };
  });

  return {
    ranks,
    nodes,
    edges,
    width: layoutWidth,
    height: contentHeight,
    frameWidth: width,
    frameHeight: height,
  };
}

function rankComponents(incoming: ReadonlyArray<ReadonlySet<number>>): number[] {
  const memo = new Map<number, number>();
  const visiting = new Set<number>();

  const rank = (index: number): number => {
    const cached = memo.get(index);
    if (cached !== undefined) return cached;
    if (visiting.has(index)) return 0;

    visiting.add(index);
    let value = 0;

    for (const predecessor of incoming[index] ?? []) {
      value = Math.max(value, rank(predecessor) + 1);
    }

    visiting.delete(index);
    memo.set(index, value);
    return value;
  };

  return incoming.map((_, index) => rank(index));
}
