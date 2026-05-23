/** @module src/graphs/graphValidation */

/**
 * Return true when value exposes the minimal routable graph node API.
 * @param {unknown} nodes
 * @returns {boolean}
 */
export function isRoutableNodeCollection(nodes) {
  return (
    nodes != null &&
    typeof nodes === 'object' &&
    typeof nodes.get === 'function' &&
    typeof nodes.has === 'function' &&
    typeof nodes.size === 'number'
  );
}

/**
 * Return true for raw routing graphs and augmented graph views.
 * @param {unknown} graph
 * @returns {boolean}
 */
export function isRoutableGraph(graph) {
  return (
    graph != null &&
    typeof graph === 'object' &&
    isRoutableNodeCollection(graph.nodes) &&
    Array.isArray(graph.edges)
  );
}
