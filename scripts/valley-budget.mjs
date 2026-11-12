import { createServer } from 'vite';

// CPU-side scene inventory only; these are not measured GPU draw calls or FPS.
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { createWorld } = await server.ssrLoadModule('/src/game/world.ts');
  for (const quality of ['low', 'medium', 'high']) {
    const world = createWorld(quality, 'valley', 'enhanced');
    try {
      const geometries = new Set();
      let batches = 0, instances = 0, triangles = 0;
      world.scene.traverse(object => {
        if (!object.isMesh && !object.isPoints) return;
        geometries.add(object.geometry);
        if (object.isInstancedMesh) { batches++; instances += object.count; }
        if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
      });
      console.log(JSON.stringify({ quality, instanceBatches: batches, instances, totalSceneTriangles: Math.round(triangles), geometries: geometries.size }));
    } finally { world.dispose(); }
  }
} finally { await server.close(); }
