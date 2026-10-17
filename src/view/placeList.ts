import type { CountryPlace, PlaceKey } from '../places.ts';
import { h } from './dom.ts';
import { withClearButton } from './searchField.ts';
import { plural } from './format.ts';
import { foldForSearch } from './searchIndex.ts';

export interface PlaceListProps {
  /** Countries with shows in the time window. */
  readonly places: readonly CountryPlace[];
  readonly selected: ReadonlySet<PlaceKey>;
}

export interface PlaceListCallbacks {
  onSelect(key: PlaceKey): void;
}

export interface PlaceListView {
  render(props: PlaceListProps): void;
  clearFilter(): void;
}

export function createPlaceList(container: HTMLElement, callbacks: PlaceListCallbacks): PlaceListView {
  const filter = h('input', { type: 'search', class: 'place-filter', placeholder: 'Filter cities and countries', 'aria-label': 'Filter cities and countries' });
  const count = h('p', { class: 'band-count', 'aria-live': 'polite' });
  const list = h('ul', { class: 'place-rows' });
  const empty = h('p', { class: 'band-empty', hidden: true });
  container.append(withClearButton(filter, 'Clear the place filter'), count, list, empty);

  const open = new Set<PlaceKey>();
  let props: PlaceListProps | null = null;
  filter.addEventListener('input', () => {
    if (props !== null) draw(props);
  });

  function draw(current: PlaceListProps) {
    const query = foldForSearch(filter.value);
    const matching = current.places.flatMap((country) => {
      if (query === '' || foldForSearch(country.name).includes(query)) return [{ country, cities: country.cities, forceOpen: false }];
      const cities = country.cities.filter((city) => foldForSearch(city.city).includes(query));
      return cities.length > 0 ? [{ country, cities, forceOpen: true }] : [];
    });
    const cityCount = current.places.reduce((sum, country) => sum + country.cities.length, 0);
    count.textContent = `${plural(cityCount, 'city', 'cities')} in ${plural(current.places.length, 'country', 'countries')} have shows in the time window`;
    empty.hidden = matching.length > 0;
    empty.textContent = current.places.length === 0 ? 'No shows in the time window. Pick a wider time range.' : `No city or country matches “${filter.value.trim()}”.`;

    list.replaceChildren(
      ...matching.map(({ country, cities, forceOpen }) => {
        const isOpen = forceOpen || open.has(country.key);
        const expand = h('button', { type: 'button', class: 'place-expand', 'aria-expanded': String(isOpen), 'aria-label': `${isOpen ? 'Hide' : 'Show'} cities in ${country.name}` });
        expand.addEventListener('click', () => {
          if (open.has(country.key)) open.delete(country.key);
          else open.add(country.key);
          draw(current);
        });
        const select = h(
          'button',
          { type: 'button', class: 'place-button place-country', 'aria-pressed': String(current.selected.has(country.key)) },
          h('span', { class: 'place-name' }, country.name),
          h('span', { class: 'place-count' }, plural(country.showCount, 'show')),
        );
        select.addEventListener('click', () => callbacks.onSelect(country.key));
        const cityRows = isOpen
          ? h(
              'ul',
              { class: 'place-cities' },
              ...cities.map((city) => {
                const button = h(
                  'button',
                  { type: 'button', class: 'place-button', 'aria-pressed': String(current.selected.has(city.key)) },
                  h('span', { class: 'place-name' }, city.city),
                  h('span', { class: 'place-count' }, `${plural(city.showCount, 'show')}${city.bandCount > 1 ? `, ${city.bandCount} bands` : ''}`),
                );
                button.addEventListener('click', () => callbacks.onSelect(city.key));
                return h('li', {}, button);
              }),
            )
          : null;
        return h('li', { class: 'place-row' }, h('div', { class: 'place-head' }, expand, select), cityRows);
      }),
    );
  }

  return {
    clearFilter() {
      filter.value = '';
      open.clear();
      if (props !== null) draw(props);
    },
    render(next) {
      if (props !== null && props.places === next.places && props.selected === next.selected) return;
      props = next;
      draw(next);
    },
  };
}
