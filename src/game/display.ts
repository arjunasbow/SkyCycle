/** Call directly from a tap. Page expansion is the fallback when native fullscreen is unsupported. */
export async function enterFlightFullscreen(element: HTMLElement): Promise<boolean> {
  if (typeof element.requestFullscreen !== 'function') return false;
  try { await element.requestFullscreen(); return true; } catch { return false; }
}
