/**
 * Public entry point for the graph engine.
 *
 * Re-exports the reactive system so consumers can import the engine from
 * the package root instead of reaching into internal directories.
 */

// Expose the complete reactive API from the package root.
export * from './reactive/index.js';
