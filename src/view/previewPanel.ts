import type { BandDiff } from '../data/diff.ts';
import type { IdentifiedShow } from '../data/types.ts';
import { issueText } from '../data/issues.ts';
import type { ValidationIssue } from '../data/validate.ts';
import { t } from '../i18n/index.ts';
import type { PreviewResult } from '../preview.ts';
import { h } from './dom.ts';
import { formatDate, formatList } from './format.ts';

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
      const clear = h('button', { type: 'button', class: 'text-button' }, t().preview.removeAll);
      clear.addEventListener('click', () => callbacks.onClearAll());
      const back = h('button', { type: 'button', class: 'selection-back' }, backLabel);
      back.addEventListener('click', () => callbacks.onBack());
      container.replaceChildren(
        back,
        h(
          'div',
          { class: 'preview-head' },
          h('h2', { class: 'preview-title' }, t().preview.title(previews.length)),
          h('p', { class: 'preview-note' }, t().preview.note),
          clear,
        ),
        ...previews.map((preview) => previewCard(preview, callbacks)),
      );
    },
  };
}

function previewCard(preview: PreviewResult, callbacks: PreviewPanelCallbacks): HTMLElement {
  const band = preview.normalized?.band;
  const remove = h('button', { type: 'button', class: 'text-button' }, t().preview.remove);
  remove.addEventListener('click', () => callbacks.onRemove(preview));

  const actions: HTMLElement[] = [];
  if (preview.normalized !== null) {
    const noteId = `preview-download-note-${preview.normalized.band.id}`;
    const download = h('button', { type: 'button', class: 'button', 'aria-describedby': noteId }, t().preview.download);
    download.addEventListener('click', () => callbacks.onDownload(preview));
    const file = `${preview.normalized.band.id}.json`;
    const hint = preview.missingGeoCount > 0 ? t().preview.geocodeHint(file) : t().preview.commitHint(file);
    actions.push(download, h('p', { class: 'preview-hint', id: noteId }, t().preview.downloadNote), h('p', { class: 'preview-hint' }, hint));
  }

  const usable = preview.normalized?.shows.length ?? 0;
  const summary =
    preview.status === 'invalid' ? t().preview.unusable : t().preview.usable(usable, preview.totalShows, preview.errors.length > 0);

  return h(
    'article',
    { class: `preview-card is-${preview.status}` },
    h(
      'header',
      { class: 'preview-card-head' },
      h('h3', { class: 'preview-band' }, band?.name ?? preview.fileName),
      h('span', { class: `status-tag preview-status-${preview.status}` }, t().preview.statuses[preview.status]),
      h('span', { class: 'preview-file' }, preview.fileName),
      remove,
    ),
    h('p', { class: 'preview-summary' }, summary),
    preview.diff === null ? null : diffSection(preview.diff),
    issueList(t().preview.errors(preview.errors.length), preview.errors, 'is-error'),
    issueList(t().preview.warnings(preview.warnings.length), preview.warnings, 'is-warning'),
    actions.length === 0 ? null : h('div', { class: 'preview-actions' }, ...actions),
  );
}

function diffSection(diff: BandDiff): HTMLElement {
  if (diff.isNewBand) {
    return h('p', { class: 'preview-diff' }, t().preview.newBand(diff.added.length));
  }
  const bandChanges = diff.bandFields.length === 0 ? null : h('li', {}, t().preview.bandChanged(formatList(diff.bandFields)));
  const rows = [
    ...diff.added.map((show) => h('li', { class: 'diff-added' }, h('span', { class: 'diff-sign' }, t().preview.added), describeShow(show))),
    ...diff.removed.map((show) => h('li', { class: 'diff-removed' }, h('span', { class: 'diff-sign' }, t().preview.removed), describeShow(show))),
    ...diff.changed.map((change) =>
      h('li', { class: 'diff-changed' }, h('span', { class: 'diff-sign' }, t().preview.changed), `${describeShow(change.after)}: ${change.fields.join(', ')}`),
    ),
  ];
  const hasChanges = rows.length > 0 || bandChanges !== null;
  return h(
    'details',
    { class: 'preview-diff', open: hasChanges && rows.length <= 12 },
    h('summary', {}, t().preview.compared(diff.added.length, diff.removed.length, diff.changed.length, diff.unchangedCount)),
    hasChanges ? h('ul', { class: 'diff-list' }, bandChanges, ...rows.slice(0, MAX_LISTED)) : h('p', {}, t().preview.noDifferences),
    rows.length > MAX_LISTED ? h('p', { class: 'preview-more' }, t().preview.moreNotListed(rows.length - MAX_LISTED)) : null,
  );
}

function describeShow(show: IdentifiedShow): string {
  return `${formatDate(show.date)}, ${show.city}${show.venue === null ? '' : `, ${show.venue}`}`;
}

function issueList(title: string, issues: readonly ValidationIssue[], className: string): HTMLElement | null {
  if (issues.length === 0) return null;
  const items = issues.slice(0, MAX_LISTED).map((issue) => h('li', {}, h('code', {}, localizedIssue(issue))));
  return h(
    'details',
    { class: `preview-issues ${className}`, open: true },
    h('summary', {}, title),
    h('ul', {}, ...items),
    issues.length > MAX_LISTED ? h('p', { class: 'preview-more' }, t().preview.moreIssues(issues.length - MAX_LISTED)) : null,
  );
}

/** Like the command-line output ("file path: message"), with the message in the viewer's language. */
function localizedIssue(issue: ValidationIssue): string {
  const message = issueText(t().issues, issue);
  return issue.path === '' ? `${issue.file}: ${message}` : `${issue.file} ${issue.path}: ${message}`;
}
