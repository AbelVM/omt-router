/**
 * attachArrangeShim(Graph)
 *
 * Temporarily overrides `Graph.prototype._arrangeContractedPaths` with a
 * safer implementation that never calls `process.exit()`. Returns a function
 * that restores the original implementation when called.
 */
export function attachArrangeShim(Graph) {

  const originalArrange = Graph.prototype._arrangeContractedPaths;

  Graph.prototype._arrangeContractedPaths = function(adj_list) {
    const self = this;

    adj_list.forEach((node, index) => {

      node.forEach(edge => {

        const start_node = index;

        // collect simple (uncontracted) ids composing this edge
        let simpleIds = [];
        let ids = [edge.attrs];
        while (ids.length) {
          const id = ids.pop();
          if (id <= self._maxUncontractedEdgeIndex) {
            simpleIds.push(id);
          } else {
            const ep = self._edgeProperties[id];
            if (ep && Array.isArray(ep._id)) ids.push(...ep._id);
          }
        }

        // build node->edge map
        const links = {};
        simpleIds.forEach(id => {
          const properties = self._edgeProperties[id];
          const s = String(properties._start_index);
          const e = String(properties._end_index);
          if (!links[s]) links[s] = [];
          links[s].push(id);
          if (!links[e]) links[e] = [];
          links[e].push(id);
        });

        // trivial case
        if (simpleIds.length <= 1) {
          self._edgeProperties[edge.attrs]._ordered = simpleIds;
          return;
        }

        // Try to find a contiguous sequence using backtracking (DFS).
        const total = simpleIds.length;
        const visited = new Set();
        let foundSeq = null;

        const backtrack = (curNode, seq) => {
          if (seq.length === total) {
            foundSeq = seq.slice();
            return true;
          }
          const arr = links[curNode] || [];
          for (const eid of arr) {
            if (visited.has(eid)) continue;
            visited.add(eid);
            const props = self._edgeProperties[eid];
            const n1 = String(props._start_index);
            const n2 = String(props._end_index);
            const nextNode = curNode === n1 ? n2 : n1;
            seq.push(eid);
            if (backtrack(nextNode, seq)) return true;
            seq.pop();
            visited.delete(eid);
          }
          return false;
        };

        backtrack(String(start_node), []);

        if (foundSeq) {
          self._edgeProperties[edge.attrs]._ordered = foundSeq;
          return;
        }

        // Greedy fallback: walk from the start node choosing an unseen
        // adjacent segment, then append any remaining segments.
        const ordered = [];
        let last_node = String(start_node);
        const startArr = links[last_node] || [];
        let current_edge_id = startArr.length ? startArr[0] : null;

        while (current_edge_id != null) {
          ordered.push(current_edge_id);
          const props = self._edgeProperties[current_edge_id];
          const c1 = String(props._start_index);
          const c2 = String(props._end_index);
          const next_node = c1 === last_node ? c2 : c1;
          last_node = next_node;
          const arr = links[next_node] || [];
          if (arr.length === 1) break;
          let pick = null;
          for (const e of arr) {
            if (e !== current_edge_id && !ordered.includes(e)) { pick = e; break; }
          }
          if (pick == null) break;
          current_edge_id = pick;
        }

        for (const id of simpleIds) {
          if (!ordered.includes(id)) ordered.push(id);
        }

        self._edgeProperties[edge.attrs]._ordered = ordered;

      });

    });

  };

  return function restore() {
    if (originalArrange) Graph.prototype._arrangeContractedPaths = originalArrange;
    else delete Graph.prototype._arrangeContractedPaths;
  };

}

export default attachArrangeShim;
