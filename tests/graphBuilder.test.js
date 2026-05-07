import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeSegments, buildGraph, parseTile } from '../src/graphs/graphBuilder.js';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('graphBuilder mergeSegments', () => {
  it('merges clipped boundary endpoints even when coordKey differs by 2 units', () => {
    const firstBatch = [
      {
        c1: [0, 0],
        c2: [0.001, 0],
        oneway: 0,
        speed: 50,
        props: { class: 'residential' },
        roadId: 1,
        c1boundary: false,
        c2boundary: true,
        clipped: true,
      },
    ];

    const secondBatch = [
      {
        c1: [0.001002, 0],
        c2: [0.002, 0],
        oneway: 0,
        speed: 50,
        props: { class: 'residential' },
        roadId: 2,
        c1boundary: true,
        c2boundary: false,
        clipped: true,
      },
    ];

    const graph = mergeSegments([firstBatch, secondBatch], 'car');
    expect(graph.nodes.size).toBe(3);
    expect(graph.edges.length).toBe(2);
    expect(graph.nodeIndex.get('1000,0')).toBe(graph.nodeIndex.get('1002,0'));
  });

  it('ignores one-way restrictions for pedestrian graphs', () => {
    const graph = mergeSegments([
      [
        {
          c1: [0, 0],
          c2: [0.001, 0],
          oneway: 1,
          speed: 5,
          props: { class: 'path' },
          roadId: 1,
          c1boundary: false,
          c2boundary: false,
          clipped: false,
        },
      ],
    ], 'pedestrian');

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].cost).toBeGreaterThan(0);
    expect(graph.edges[0].cost).toBe(graph.edges[0].reverseCost);
  });

  it('does not merge non-clipped boundary endpoints when roadId differs', () => {
    const firstBatch = [
      {
        c1: [0, 0],
        c2: [0.001, 0],
        oneway: 0,
        speed: 50,
        props: { class: 'residential' },
        roadId: 1,
        c1boundary: false,
        c2boundary: true,
        clipped: false,
      },
    ];

    const secondBatch = [
      {
        c1: [0.001002, 0],
        c2: [0.002, 0],
        oneway: 0,
        speed: 50,
        props: { class: 'residential' },
        roadId: 2,
        c1boundary: true,
        c2boundary: false,
        clipped: false,
      },
    ];

    const graph = mergeSegments([firstBatch, secondBatch], 'car');
    expect(graph.nodes.size).toBe(4);
    expect(graph.edges.length).toBe(2);
    expect(graph.nodeIndex.get('1000,0')).not.toBe(graph.nodeIndex.get('1002,0'));
  });

  it('still merges clipped endpoints when the actual distance is less than the matching threshold', () => {
    const firstBatch = [
      {
        c1: [0, 0],
        c2: [0.001, 0],
        oneway: 0,
        speed: 50,
        props: { class: 'residential' },
        roadId: 1,
        c1boundary: false,
        c2boundary: true,
        clipped: true,
      },
    ];

    const secondBatch = [
      {
        c1: [0.001001, 0],
        c2: [0.002, 0],
        oneway: 0,
        speed: 50,
        props: { class: 'residential' },
        roadId: 2,
        c1boundary: true,
        c2boundary: false,
        clipped: true,
      },
    ];

    const graph = mergeSegments([firstBatch, secondBatch], 'car');
    expect(graph.nodes.size).toBe(3);
    expect(graph.nodeIndex.get('1000,0')).toBe(graph.nodeIndex.get('1001,0'));
  });

  it('merges all clipped boundary endpoints from the central tile with neighbouring tiles', async () => {
    const zoom = 14;
    const tiles = [
      { x: 8023, y: 6177 },
      { x: 8022, y: 6177 },
      { x: 8024, y: 6177 },
      { x: 8023, y: 6176 },
      { x: 8023, y: 6178 },
    ];

    const loadedTiles = await Promise.all(
      tiles.map(async ({ x, y }) => ({
        x,
        y,
        buffer: await readFile(path.join(FIXTURES_DIR, `14-${x}-${y}.pbf`)),
      }))
    );

    const graph = buildGraph(
      loadedTiles.map(({ buffer, x, y }) => ({ buffer, x, y, z: zoom })),
      'car'
    );

    const coordKey = (lng, lat) => `${Math.round(lng * 1e6)},${Math.round(lat * 1e6)}`;
    const targetTile = loadedTiles.find((tile) => tile.x === 8023 && tile.y === 6177);
    const targetClippedEndpointKeys = new Set();
    const parsedTargetSegments = parseTile(targetTile.buffer, targetTile.x, targetTile.y, zoom, 'car');

    for (let i = 0; i < parsedTargetSegments.length; i += 13) {
      const clipped = !!parsedTargetSegments[i + 12];
      if (!clipped) continue;
      const c1boundary = !!parsedTargetSegments[i + 10];
      const c2boundary = !!parsedTargetSegments[i + 11];
      const c1lng = parsedTargetSegments[i];
      const c1lat = parsedTargetSegments[i + 1];
      const c2lng = parsedTargetSegments[i + 2];
      const c2lat = parsedTargetSegments[i + 3];
      if (c1boundary) targetClippedEndpointKeys.add(coordKey(c1lng, c1lat));
      if (c2boundary) targetClippedEndpointKeys.add(coordKey(c2lng, c2lat));
    }

    expect(targetClippedEndpointKeys.size).toBeGreaterThan(0);

    const targetClippedNodeIds = new Set(
      [...targetClippedEndpointKeys].map((key) => graph.nodeIndex.get(key))
    );
    expect([...targetClippedNodeIds]).not.toContain(undefined);

    const neighbourBoundaryNodeIds = new Set();
    for (const tile of loadedTiles.filter((tile) => tile.x !== 8023 || tile.y !== 6177)) {
      const parsedNeighbourSegments = parseTile(tile.buffer, tile.x, tile.y, zoom, 'car');
      for (let i = 0; i < parsedNeighbourSegments.length; i += 13) {
        const c1boundary = !!parsedNeighbourSegments[i + 10];
        const c2boundary = !!parsedNeighbourSegments[i + 11];
        const c1lng = parsedNeighbourSegments[i];
        const c1lat = parsedNeighbourSegments[i + 1];
        const c2lng = parsedNeighbourSegments[i + 2];
        const c2lat = parsedNeighbourSegments[i + 3];
        if (c1boundary) neighbourBoundaryNodeIds.add(graph.nodeIndex.get(coordKey(c1lng, c1lat)));
        if (c2boundary) neighbourBoundaryNodeIds.add(graph.nodeIndex.get(coordKey(c2lng, c2lat)));
      }
    }
    neighbourBoundaryNodeIds.delete(undefined);

    expect([...targetClippedNodeIds].every((id) => neighbourBoundaryNodeIds.has(id))).toBe(true);
  });
});
