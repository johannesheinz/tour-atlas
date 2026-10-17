import world from 'virtual:world-topology';
import { createBundledStore } from './store/bundled.ts';

const app = document.getElementById('app');
if (app === null) throw new Error('missing #app element');

const store = createBundledStore();
const showCount = store.listBands().reduce((sum, file) => sum + file.shows.length, 0);
app.textContent = `Tour Atlas: ${store.listBands().length} bands, ${showCount} shows, ${world.arcs.length} arcs`;
