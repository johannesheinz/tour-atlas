import type { BandDiff } from '../data/diff.ts';
import type { IdentifiedShow } from '../data/types.ts';
import { formatIssue, type ValidationIssue } from '../data/validate.ts';
import type { PreviewResult } from '../preview.ts';
import { h } from './dom.ts';
import { formatDate, plural } from './format.ts';

export interface PreviewPanelCallbacks {
  onBack(): void;
  onDownload(preview: PreviewResult): void;
  onRemove(preview: PreviewResult): void;
  onClearAll(): void;
}

export interface PreviewPanelView {
  render(previews: readonly PreviewResult[], backLabel: string): void;
}

const MAX_LISTED = 40;
const STATUS_TEXT = { valid: 'Valid', partial: 'Valid rows kept', invalid: 'Not usable' } as const;

export function createPreviewPanel(container: HTMLElement, callbacks: PreviewPanelCallbacks): PreviewPanelView {
  let previous: { previews: readonly PreviewResult[]; backLabel: string } | null = null;

  return {
    render(previews, backLabel) {
      if (previous !== null && previous.previews === previews && previous.backLabel === backLabel) return;
      previous = { previews, backLabel };
      if (previews.length === 0) {
        container.replaceChildren();
        return;
      }
      const clear = h('button', { type: 'button', class: 'text-button' }, 'Remove all previews');
      clear.addEventListener('click', () => callbacks.onClearAll());
      const back = h('button', { type: 'button', class: 'selection-back' }, backLabel);
      back.addEventListener('click', () => callbacks.onBack());
      container.replaceChildren(
        back,
        h(
          'div',
          { class: 'preview-head' },
          h('h2', { class: 'preview-title' }, `Previewing ${plural(previews.length, 'file')}`),
          h('p', { class: 'preview-note' }, 'Held in this tab only. Nothing is uploaded or saved.'),
          clear,
        ),
        ...previews.map((preview) => previewCard(preview, callbacks)),
      );
    },
  };
}

function previewCard(preview: PreviewResult, callbacks: PreviewPanelCallbacks): HTMLElement {
  const band = preview.normalized?.band;
  const remove = h('button', { type: 'button', class: 'text-button' }, 'Remove');
  remove.addEventListener('click', () => callbacks.onRemove(preview));

  const actions: HTMLElement[] = [];
  if (preview.normalized !== null) {
    const download = h('button', { type: 'button', class: 'button' }, 'Download normalized file');
    download.addEventListener('click', () => callbacks.onDownload(preview));
    const hint =
      preview.missingGeoCount > 0
        ? `Run "npm run geocode", then commit ${band?.id ?? 'the file'}.json to data/bands/ and open a pull request.`
        : `Commit ${band?.id ?? 'the file'}.json to data/bands/ and open a pull request.`;
    actions.push(download, h('p', { class: 'preview-hint' }, hint));
  }

  const usable = preview.normalized?.shows.length ?? 0;
  const summary =
    preview.status === 'invalid'
      ? 'This file cannot be used. Fix the errors below and drop it again.'
      : `${usable} of ${plural(preview.totalShows, 'show')} usable${preview.errors.length > 0 ? `; rows with errors are left out` : ''}.`;

  return h(
    'article',
    { class: `preview-card is-${preview.status}` },
    h(
      'header',
      { class: 'preview-card-head' },
      h('h3', { class: 'preview-band' }, band?.name ?? preview.fileName),
      h('span', { class: `status-tag preview-status-${preview.status}` }, STATUS_TEXT[preview.status]),
      h('span', { class: 'preview-file' }, preview.fileName),
      remove,
    ),
    h('p', { class: 'preview-summary' }, summary),
    preview.diff === null ? null : diffSection(preview.diff),
    issueList('Errors', preview.errors, 'is-error'),
    issueList('Warnings', preview.warnings, 'is-warning'),
    actions.length === 0 ? null : h('div', { class: 'preview-actions' }, ...actions),
  );
}

function diffSection(diff: BandDiff): HTMLElement {
  if (diff.isNewBand) {
    return h('p', { class: 'preview-diff' }, `New band: ${plural(diff.added.length, 'show')} added to the published data.`);
  }
  const counts = `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed, ${diff.unchangedCount} unchanged`;
  const bandChanges = diff.bandFields.length === 0 ? null : h('li', {}, `Band ${diff.bandFields.join(' and ')} changed`);
  const rows = [
    ...diff.added.map((show) => h('li', { class: 'diff-added' }, h('span', { class: 'diff-sign' }, 'Added'), describeShow(show))),
    ...diff.removed.map((show) => h('li', { class: 'diff-removed' }, h('span', { class: 'diff-sign' }, 'Removed'), describeShow(show))),
    ...diff.changed.map((change) =>
      h('li', { class: 'diff-changed' }, h('span', { class: 'diff-sign' }, 'Changed'), `${describeShow(change.after)}: ${change.fields.join(', ')}`),
    ),
  ];
  const hasChanges = rows.length > 0 || bandChanges !== null;
  return h(
    'details',
    { class: 'preview-diff', open: hasChanges && rows.length <= 12 },
    h('summary', {}, `Compared with the published data: ${counts}`),
    hasChanges ? h('ul', { class: 'diff-list' }, bandChanges, ...rows.slice(0, MAX_LISTED)) : h('p', {}, 'No differences.'),
    rows.length > MAX_LISTED ? h('p', { class: 'preview-more' }, `${rows.length - MAX_LISTED} more not listed.`) : null,
  );
}

function describeShow(show: IdentifiedShow): string {
  return `${formatDate(show.date)}, ${show.city}${show.venue === null ? '' : `, ${show.venue}`}`;
}

function issueList(title: string, issues: readonly ValidationIssue[], className: string): HTMLElement | null {
  if (issues.length === 0) return null;
  const items = issues.slice(0, MAX_LISTED).map((issue) => h('li', {}, h('code', {}, formatIssue(issue))));
  return h(
    'details',
    { class: `preview-issues ${className}`, open: true },
    h('summary', {}, `${title} (${issues.length})`),
    h('ul', {}, ...items),
    issues.length > MAX_LISTED ? h('p', { class: 'preview-more' }, `${issues.length - MAX_LISTED} more. Run "npm run validate" locally for the full list.`) : null,
  );
}
