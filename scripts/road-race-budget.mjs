import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { createWorld } = await server.ssrLoadModule('/src/game/world.ts');
  const { initialRace, stepRace, racePosition } = await server.ssrLoadModule('/src/game/race.ts');
  for (const quality of ['low', 'medium', 'high']) {
    const world = createWorld(quality, 'road');
    try {
      let triangles = 0, batches = 0, instances = 0; const geometries = new Set();
      world.scene.traverse(object => {
        if (!object.isMesh && !object.isPoints) return;
        geometries.add(object.geometry);
        if (object.isInstancedMesh) { batches++; instances += object.count; }
        if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
      });
      console.log(JSON.stringify({ quality, wholeSceneTriangles: Math.round(triangles), instanceBatches: batches, instances, geometries: geometries.size }));
    } finally { world.dispose(); }
  }
  for (const difficulty of ['gentle', 'moderate', 'challenging']) {
    for (const effort of [1, 1.05, 1.15]) {
      const race = initialRace();
      for (let frame = 0; frame < 18000; frame++) stepRace(race, effort, difficulty, 1 / 60, true);
      console.log(JSON.stringify({ difficulty, effort, position: racePosition(race), metres: Math.round(race.distance) }));
    }
  }
} finally { await server.close(); }
