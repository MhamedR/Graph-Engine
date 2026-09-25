/**
 * Public atlas API. The dev server and the picture stay behind their own
 * entry points so a library import does not start a browser bundle.
 */

export {
  BUNDLE_INCLUDES,
  CYCLE_CLEAR,
  DIRECTION_LINE,
  EMPTY_LINE,
  LENSES,
  LENS_QUESTION,
  READING_LINE,
  WORKSPACE_DEPENDS,
  atlasEdgeId,
  isLens,
  type AtlasBoot,
  type AtlasEdge,
  type AtlasSnapshot,
  type Lens,
  type PackageNode,
  type Relation,
  type Viewport,
} from './model.js';

export {extractWorkspace} from './extract-workspace.js';

export {
  buildPackageGraph,
  components,
  cycles,
  degrees,
  downstream,
  order,
  path,
  relationOf,
  upstream,
  type BuildOrder,
  type Degrees,
  type PackageGraph,
} from './structural.js';

export {diffSnapshots, type AtlasDiff, type NodeChange} from './diff.js';

export {
  labelWidth,
  layoutSnapshot,
  type AtlasLayout,
  type PlacedEdge,
  type PlacedNode,
  type RankBand,
} from './layout.js';

export {
  connectAtlasSession,
  createAtlasSession,
  parseCommand,
  type AtlasConnection,
  type AtlasSession,
  type Emphasis,
} from './session.js';
