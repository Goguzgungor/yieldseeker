// Minimal ambient declaration for d3-force-3d so tsc can resolve the import.
// The full API surface is not typed here — we only use forceCollide.
declare module "d3-force-3d" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceCollide(radius?: number | ((node: any) => number)): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceLink(links?: any[]): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceManyBody(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceCenter(x?: number, y?: number): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceSimulation(nodes?: any[]): any;
}
