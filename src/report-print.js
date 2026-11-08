// Transient DOM layout only: no match state, statistics or persisted data.
// These dimensions match the A4 landscape @page rule (14mm margins).
const PRINT_WIDTH = '269mm';
const PRINT_HEIGHT = '182mm';
let restorePrintLayout = null;

export function prepareReportPrint(document) {
  restoreReportPrint();
  const report = document.querySelector('.report-view');
  if (!report) return;
  const classes = new Map(), containers = new Map();
  const remember = node => { if (!classes.has(node)) classes.set(node, node.getAttribute('class')); };
  restorePrintLayout = () => {
    for (const [node, children] of containers) node.replaceChildren(...children);
    for (const [node, value] of classes) value === null ? node.removeAttribute('class') : node.setAttribute('class', value);
  };
  const pairKeepers = (root, save) => {
    for (const container of root.querySelectorAll('.goalkeeper-cards')) {
      if (save) containers.set(container, [...container.childNodes]);
      const cards = [...container.querySelectorAll('.goalkeeper-card')];
      const ours = cards.filter(c => c.dataset.gkCard.startsWith('our:'));
      const theirs = cards.filter(c => c.dataset.gkCard.startsWith('opposition:'));
      for (let i = 0; i < Math.max(ours.length, theirs.length); i++) {
        const pair = document.createElement('div');pair.dataset.printKeeperPair = '';
        for (const card of [ours[i], theirs[i]]) if (card) pair.append(card);
        container.append(pair);
      }
    }
  };
  // beforeprint can fire while the browser still reports screen media. Scope
  // the existing print declarations to the hidden probe so measurements always
  // use the final print fonts/spacing, including in native Safari preview.
  const printStyles = document.createElement('style');
  const declarations = [];
  for (const sheet of document.styleSheets) {
    let rules;try { rules = sheet.cssRules; } catch { continue; }
    for (const media of rules) if (media.conditionText === 'print') {
      for (const rule of media.cssRules) if (rule.selectorText) {
        const selectors = rule.selectorText.split(',').map(selector => {
          selector = selector.trim();
          if (selector.startsWith('.report-view')) return selector.replace('.report-view', '[data-report-print-probe]');
          if (selector === 'body' || selector === 'html') return ':where([data-report-print-probe])';
          return `:where([data-report-print-probe]) ${selector}`;
        });
        declarations.push(`${selectors.join(',')} { ${rule.style.cssText} }`);
      }
    }
  }
  printStyles.textContent = declarations.join('\n');document.head.append(printStyles);
  const probe = report.cloneNode(true);
  probe.dataset.reportPrintProbe = '';probe.setAttribute('aria-hidden', 'true');probe.inert = true;
  probe.style.cssText = `position:absolute;left:-100000px;top:0;width:${PRINT_WIDTH};visibility:hidden;page:auto;margin:0;padding:0`;
  const ruler = document.createElement('div');ruler.style.height = PRINT_HEIGHT;probe.append(ruler);
  document.body.append(probe);
  try {
    pairKeepers(probe, false);pairKeepers(report, true);
    const available = ruler.getBoundingClientRect().height;ruler.remove();
    const classify = selector => {
      const measured = [...probe.querySelectorAll(selector)], originals = [...report.querySelectorAll(selector)];
      measured.forEach((node, i) => {
        const style = document.defaultView.getComputedStyle(node), first = node.firstElementChild;
        const top = Math.max(parseFloat(style.marginTop)||0, first ? parseFloat(document.defaultView.getComputedStyle(first).marginTop)||0 : 0);
        const height = node.getBoundingClientRect().height + top + (parseFloat(style.marginBottom)||0);
        // A small physical rounding allowance prevents borderline page overflow.
        const fits = height > 0 && height <= available - 2;
        for (const target of [node, originals[i]]) {
          if (!target) continue;
          if (target === originals[i]) remember(target);
          target.classList.add(fits ? 'report-print-fit' : 'report-print-continuation');
        }
      });
    };
    classify(':scope > .analysis-section, :scope > p[data-report-substitutions]');
    // Long paired tables use normal block flow; classify each resulting subgroup.
    classify('.report-pair > div, [data-print-keeper-pair], .goalkeeper-card');
  } catch (error) {
    restoreReportPrint();throw error;
  } finally {
    probe.remove();printStyles.remove();
  }
}
export function restoreReportPrint() {
  if (restorePrintLayout) { const restore = restorePrintLayout;restorePrintLayout = null;restore(); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => prepareReportPrint(window.document));
  window.addEventListener('afterprint', restoreReportPrint);
  // Also restore after cancelling/leaving native print preview (including Safari).
  const media = window.matchMedia('print');
  const changed = event => event.matches ? prepareReportPrint(window.document) : restoreReportPrint();
  if (media.addEventListener) media.addEventListener('change', changed);
  else media.addListener(changed);
}
