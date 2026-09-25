/**
 * Chooses the map for one root.
 *
 * A workspace of several packages stays a package graph. A single project
 * with a source tree is drawn as that tree instead of one package node.
 */

import {extractSource} from './extract-source.js';
import {extractWorkspace} from './extract-workspace.js';
import type {AtlasSnapshot} from './model.js';

export async function extractProject(root: string): Promise<AtlasSnapshot> {
  let workspace: AtlasSnapshot | null = null;
  let failure: unknown = null;

  try {
    workspace = await extractWorkspace(root);
  } catch (error) {
    failure = error;
  }

  if (workspace && workspace.nodes.length > 1) {
    return {...workspace, kind: 'workspace'};
  }

  const source = await extractSource(root);
  if (source.nodes.length > 0) return source;
  if (workspace) return {...workspace, kind: 'workspace'};

  throw failure instanceof Error ? failure : new Error(`Cannot read project root ${root}`);
}
