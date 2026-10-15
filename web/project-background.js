import { BACKGROUND_DEFAULTS, BUILDING_USES, PROJECT_STAGES, IRRIGATION_OPTIONS, normalizeProjectBackground, validateSavedProjectBackground } from '../src/domain/project-background.js';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export function projectBackgroundMarkup(value) {
  if (!value) return '<p>项目背景尚未确认。</p>';
  return `<p>项目背景：${value.buildingName ? escape(value.buildingName) + " · " : ""}${escape(value.city)} · ${escape(BUILDING_USES[value.buildingUse])} · ${escape(PROJECT_STAGES[value.projectStage])}（用户填写）${value.irrigation === 'unknown' ? '' : ' · ' + escape(IRRIGATION_OPTIONS[value.irrigation])}${value.maintenance ? ' · ' + escape(value.maintenance) : ''}</p>`;
}

export function createProjectBackground({ container, onChange, onEdit, onConfirm }) {
  const form = container.querySelector('form'), status = container.querySelector('[role=status]');
  const summary = container.querySelector('.project-note-summary'), edit = container.querySelector('[data-background-edit]');
  const save = form.querySelector('button[type=submit]'), fields = Object.fromEntries(Object.keys(BACKGROUND_DEFAULTS).map(key => [key, form.elements.namedItem(key)]));
  let values = null, confirmed = false, continuation = null, epoch = 0;
  const animations = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  for (const [key, options] of [['buildingUse', BUILDING_USES], ['projectStage', PROJECT_STAGES], ['irrigation', IRRIGATION_OPTIONS]]) {
    for (const [value, label] of Object.entries(options)) fields[key].append(new Option(label, value));
  }
  function draft() { return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])); }
  function display(input) { for (const [key, field] of Object.entries(fields)) field.value = String(input[key] ?? ''); }
  function cancelMotion() { epoch++; for (const animation of animations) animation.cancel(); animations.clear(); }
  function motion(element, frames, options) {
    if (reducedMotion.matches) return Promise.resolve();
    const animation = element.animate(frames, options); animations.add(animation);
    return animation.finished.catch(() => {}).finally(() => animations.delete(animation));
  }
  function paint() {
    container.dataset.state = confirmed ? 'pinned' : 'editing';
    form.hidden = confirmed; summary.hidden = !confirmed; edit.hidden = !confirmed;
    if (confirmed) {
      const heading = document.createElement('strong'); heading.textContent = values.buildingName || values.city;
      const detail = document.createElement('span'); detail.textContent = `${values.buildingName ? values.city + " · " : ""}${BUILDING_USES[values.buildingUse]} · ${PROJECT_STAGES[values.projectStage]}`;
      const optional = document.createElement('small'); optional.textContent = [values.budgetHkd == null ? null : `预算 HK$${values.budgetHkd.toLocaleString('en-HK')}`, values.irrigation === 'unknown' ? null : IRRIGATION_OPTIONS[values.irrigation], values.maintenance || null].filter(Boolean).join(' · ');
      summary.replaceChildren(heading, detail, optional);
    }
    save.textContent = '确认';
  }
  function open() {
    cancelMotion(); confirmed = false; paint(); status.textContent = '确认后会随推荐请求提供给 AI。';
    onEdit?.(); onChange(); fields.buildingName.focus({ preventScroll: true });
  }
  edit.addEventListener('click', open);
  form.addEventListener('invalid', () => { status.textContent = '请填写城市，并选择用途和项目阶段；不了解的选项可选“不确定”。'; }, true);
  form.addEventListener('input', () => { status.textContent = ''; onChange(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const next = normalizeProjectBackground(draft());
      cancelMotion(); values = next; confirmed = true; display({ ...next, budgetHkd: next.budgetHkd ?? '' }); paint();
      status.textContent = '推荐时使用此背景。';
      onConfirm(next); onChange(); edit.focus({ preventScroll: true });
      const currentEpoch = epoch, resume = continuation; continuation = null;
      const paper = container.querySelector('.project-note-paper'), pin = container.querySelector('.project-note-pin');
      const settle = motion(paper, [{ transform: 'translate(38px, 10px) rotate(3deg) scale(1.04)' }, { transform: 'translate(-3px, 0) rotate(-3deg)', offset: .72 }, { transform: 'rotate(-1.8deg)' }], { duration: 620, easing: 'cubic-bezier(.2,.75,.2,1)' });
      void motion(pin, [{ opacity: 0, transform: 'translate(14px,-42px) rotate(25deg) scale(1.5)' }, { opacity: 1, transform: 'translate(0,3px) rotate(-10deg)', offset: .78 }, { opacity: 1, transform: 'rotate(-10deg)' }], { duration: 520, delay: 150, easing: 'cubic-bezier(.16,1,.3,1)' });
      void settle.then(() => { if (epoch === currentEpoch && confirmed) resume?.(); });
    } catch (error) { status.textContent = error.message; }
  });
  display(BACKGROUND_DEFAULTS); paint();
  return {
    get: () => confirmed ? { ...values } : null,
    serialize: () => ({ confirmed, values: values ? { ...values } : null, draft: draft() }),
    start(model, saved = null) {
      cancelMotion(); continuation = null; container.hidden = !model;
      const state = validateSavedProjectBackground(saved); values = state?.values ?? null; confirmed = state?.confirmed ?? false;
      // A confirmed import displays only validated values, never a conflicting editable draft.
      display(confirmed ? { ...values, budgetHkd: values.budgetHkd ?? '' } : state?.draft ?? BACKGROUND_DEFAULTS);
      container.querySelector('.project-note-model').textContent = model?.fileName ?? '';
      status.textContent = ''; form.querySelector('details').open = false; paint();
      if (model && !confirmed) void motion(container, [{ opacity: 0, transform: 'translateY(-14px) rotate(2deg)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' });
    },
    ensure(resume) { if (confirmed) return true; continuation = resume; open(); return false; },
    syncBudget(budgetHkd) { fields.budgetHkd.value = budgetHkd == null ? '' : String(budgetHkd); if (values) values.budgetHkd = budgetHkd ?? null; paint(); },
    dispose() { cancelMotion(); }
  };
}
