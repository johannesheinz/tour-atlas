/// <reference types="vite/client" />

declare module 'virtual:world-topology' {
  const topology: import('./data/countryLocator.ts').WorldTopology;
  export default topology;
}

declare module 'virtual:logo-sizes' {
  const sizes: Readonly<Record<string, { readonly width: number; readonly height: number }>>;
  export default sizes;
}
