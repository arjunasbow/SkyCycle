/** Scene disposal fires Three.js listeners which still need live renderer caches.
 * Release the world first, then its postprocessing/renderer, exactly once.
 * A failed resource release must not escape a React effect cleanup and blank the app.
 */
export function graphicsDisposer(world: { dispose(): void }, graphics: { dispose(): void }) {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const resource of [world, graphics]) {
      try { resource.dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length) console.warn('Recovered from graphics cleanup errors during scene transition.', ...errors);
  };
}
