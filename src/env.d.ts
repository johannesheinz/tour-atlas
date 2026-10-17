/// <reference types="vite/client" />

declare module 'virtual:world-topology' {
  const topology: import('./data/countryLocator.ts').WorldTopology;
  export default topology;
}
