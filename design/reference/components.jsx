// Double Sweat: Referenz-Komponenten (React 18). Stile stehen in design/components.css, Werte in design/tokens.css.
// Die Svelte-App übernimmt dasselbe Markup und dieselben Klassen (ds-*).
import { ICONS } from './icon-data.js';

const { useState, useEffect, useRef, useId } = React;

const cx = (...a) => a.filter(Boolean).join(' ');
const pClass = (partner) => (partner === 2 ? 'ds-p2' : 'ds-p1');

/* ---------- Icon ---------- */
export function Icon({ name, size = 20, title, className, ...rest }) {
  const nodes = ICONS[name];
  if (!nodes) return null;
  return (
    <svg
      className={cx('ds-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {nodes.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

/* ---------- Logo ---------- */
export function Logo({ variant = 'full', size = 32, className }) {
  const w = (96 / 64) * size;
  const id = useId();
  return (
    <span className={cx('ds-logo', className)} style={{ '--ds-logo': size + 'px' }}>
      <svg viewBox="0 0 96 64" width={w} height={size} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={id}>
            <circle cx="32" cy="32" r="26" />
          </clipPath>
        </defs>
        <circle cx="32" cy="32" r="26" className="ds-logo__ember" />
        <rect x="34" y="6" width="52" height="52" rx="16" className="ds-logo__tide" />
        <rect x="34" y="6" width="52" height="52" rx="16" className="ds-logo__both" clipPath={`url(#${id})`} />
      </svg>
      {variant === 'full' ? <span className="ds-logo__word">Double Sweat</span> : <span className="ds-sr">Double Sweat</span>}
    </span>
  );
}

/* ---------- Button ---------- */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconOnly = false,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx('ds-btn', `ds-btn--${variant}`, size !== 'md' && `ds-btn--${size}`, iconOnly && 'ds-btn--icon', fullWidth && 'ds-btn--block', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Icon name="loader-circle" className="ds-spin" /> : icon ? <Icon name={icon} /> : null}
      {iconOnly ? <span className="ds-sr">{children}</span> : children}
    </button>
  );
}

/* ---------- Field ---------- */
export function Field({ label, hint, error, multiline = false, prefix, suffix, id, className, ...rest }) {
  const auto = useId();
  const fid = id || auto;
  const hid = hint ? fid + '-hint' : undefined;
  const eid = error ? fid + '-error' : undefined;
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className={cx('ds-field', error && 'is-error', className)}>
      <label className="ds-field__label" htmlFor={fid}>{label}</label>
      <div className="ds-field__control">
        {prefix}
        <Tag id={fid} className="ds-field__input" aria-invalid={error ? true : undefined} aria-describedby={[hid, eid].filter(Boolean).join(' ') || undefined} {...rest} />
        {suffix}
      </div>
      {hint && !error ? <p className="ds-field__hint" id={hid}>{hint}</p> : null}
      {error ? (
        <p className="ds-field__error" id={eid} role="alert">
          <Icon name="circle-alert" size={16} /> {error}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- Segmented ---------- */
export function Segmented({ options, value, onChange, label, wrap = false, className }) {
  return (
    <div className={cx('ds-seg', wrap && 'ds-seg--wrap', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={cx('ds-seg__opt', on && 'is-on')} onClick={() => onChange && onChange(o.value)}>
            {o.icon ? <Icon name={o.icon} size={18} /> : null}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Stepper (Wochenziel) ---------- */
export function Stepper({ value, min = 1, max = 7, onChange, label, unit = 'Tage', partner = 1 }) {
  const set = (v) => onChange && onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className={cx('ds-stepper', pClass(partner))} role="group" aria-label={label}>
      <div className="ds-stepper__row">
        <Button variant="secondary" size="lg" iconOnly icon="minus" onClick={() => set(value - 1)} disabled={value <= min}>Einen Tag weniger</Button>
        <div className="ds-stepper__value" aria-live="polite">
          <span className="ds-num ds-stepper__num">{value}</span>
          <span className="ds-stepper__unit">{unit} pro Woche</span>
        </div>
        <Button variant="secondary" size="lg" iconOnly icon="plus" onClick={() => set(value + 1)} disabled={value >= max}>Einen Tag mehr</Button>
      </div>
      <div className="ds-stepper__pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cx('ds-pip', i < value && 'is-on')} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({ checked, onChange, label, hint, className }) {
  const id = useId();
  return (
    <div className={cx('ds-toggle', className)}>
      <div className="ds-toggle__text">
        <span className="ds-toggle__label" id={id}>{label}</span>
        {hint ? <span className="ds-toggle__hint">{hint}</span> : null}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className={cx('ds-switch', checked && 'is-on')} onClick={() => onChange && onChange(!checked)}>
        <span className="ds-switch__knob">{checked ? <Icon name="check" size={16} strokeWidth={3} /> : null}</span>
      </button>
    </div>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ partner = 1, name = '', size = 'md', className }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
  return (
    <span className={cx('ds-avatar', pClass(partner), size !== 'md' && `ds-avatar--${size}`, className)} role="img" aria-label={name || undefined}>
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}

/* ---------- StatusChip ---------- */
const STATUS = {
  done: { icon: 'circle-check', label: 'Geschafft' },
  open: { icon: 'clock', label: 'Offen' },
  risk: { icon: 'timer', label: 'Auf der Kippe' },
  missed: { icon: 'circle-x', label: 'Verfehlt' },
};
export function StatusChip({ status = 'open', children, className }) {
  const s = STATUS[status];
  return (
    <span className={cx('ds-chip', `ds-chip--${status}`, className)}>
      <Icon name={s.icon} size={16} />
      {children || s.label}
    </span>
  );
}

/* ---------- Streak ---------- */
export function Streak({ weeks, className }) {
  return (
    <span className={cx('ds-streak', className)}>
      <Icon name="flame" size={18} />
      <span className="ds-num ds-streak__num">{weeks}</span>
      <span>{weeks === 1 ? 'Woche in Serie' : 'Wochen in Serie'}</span>
    </span>
  );
}

/* ---------- Card ---------- */
export function Card({ as: Tag = 'section', title, action, tone, className, children, ...rest }) {
  return (
    <Tag className={cx('ds-card', tone && `ds-card--${tone}`, className)} {...rest}>
      {title || action ? (
        <header className="ds-card__head">
          {title ? <h3 className="ds-card__title">{title}</h3> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}

/* ---------- WeekStrip ---------- */
const DAY_NAMES = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };
const DAY_STATE = { done: 'eingecheckt', today: 'heute, noch offen', missed: 'kein Check-in', future: 'kommt noch' };
export function WeekStrip({ days, partner = 1, className }) {
  return (
    <ol className={cx('ds-week', pClass(partner), className)}>
      {days.map((d) => (
        <li key={d.label} className={cx('ds-day', `is-${d.state}`)} aria-current={d.state === 'today' ? 'date' : undefined}>
          <span className="ds-day__mark">{d.state === 'done' ? <Icon name="check" size={18} strokeWidth={3} /> : null}</span>
          <span className="ds-day__label" aria-hidden="true">{d.label}</span>
          <span className="ds-sr">{DAY_NAMES[d.label] || d.label}: {DAY_STATE[d.state]}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Scoreboard ---------- */
export function Scoreboard({ weekLabel, streak, lanes, children, className }) {
  return (
    <section className={cx('ds-board', className)} aria-label="Anzeigetafel dieser Woche">
      <header className="ds-board__head">
        <span className="ds-overline">{weekLabel}</span>
        {streak ? <Streak weeks={streak} /> : null}
      </header>
      <div className="ds-board__lanes">
        {lanes.map((l) => (
          <article key={l.name} className={cx('ds-lane', pClass(l.partner))}>
            <div className="ds-lane__top">
              <Avatar partner={l.partner} name={l.name} size="lg" />
              <div className="ds-lane__who">
                <span className="ds-lane__name">{l.name}{l.you ? ' (Du)' : ''}</span>
                <StatusChip status={l.status} />
              </div>
              <div className="ds-lane__score">
                <span className="ds-num ds-lane__done" aria-hidden="true">{l.done}</span>
                <span className="ds-lane__goal" aria-hidden="true">von {l.goal} Tagen</span>
                <span className="ds-sr">{l.done} von {l.goal} Tagen</span>
              </div>
            </div>
            <WeekStrip days={l.days} partner={l.partner} />
          </article>
        ))}
      </div>
      {children}
    </section>
  );
}

/* ---------- PhotoTile ---------- */
export function PhotoTile({ src, alt, partner = 1, name, dateLabel, tag, tagIcon, empty, className }) {
  return (
    <figure className={cx('ds-photo', pClass(partner), className)}>
      {empty ? (
        <div className="ds-photo__empty">
          <Icon name="image" size={28} />
          <span>{empty}</span>
        </div>
      ) : (
        <img src={src} alt={alt || ''} loading="lazy" />
      )}
      {name ? <Avatar partner={partner} name={name} size="sm" className="ds-photo__who" /> : null}
      {dateLabel || tag ? (
        <figcaption className="ds-photo__cap">
          {dateLabel ? <span className="ds-photo__date">{dateLabel}</span> : null}
          {tag ? (
            <span className="ds-photo__tag">
              {tagIcon ? <Icon name={tagIcon} size={16} /> : null}
              {tag}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/* ---------- DebtRow ---------- */
export function DebtRow({ debtorName, creditorName, viewerIsCreditor, bet, week, redeemed, onRedeem, className }) {
  const title = viewerIsCreditor ? `${debtorName} schuldet dir` : `Du schuldest ${creditorName}`;
  return (
    <li className={cx('ds-debt', redeemed && 'is-redeemed', className)}>
      <span className="ds-debt__icon"><Icon name="gift" size={22} /></span>
      <div className="ds-debt__text">
        <span className="ds-debt__title">{title}</span>
        <span className="ds-debt__sub">{bet} · {week}</span>
      </div>
      {redeemed ? (
        <StatusChip status="done">Eingelöst</StatusChip>
      ) : viewerIsCreditor ? (
        <Button variant="secondary" size="sm" icon="check" onClick={onRedeem}>Eingelöst</Button>
      ) : (
        <StatusChip status="open" />
      )}
    </li>
  );
}

/* ---------- NavBar ---------- */
export function NavBar({ items, current, onSelect, variant = 'bottom', header, className }) {
  return (
    <nav className={cx('ds-nav', `ds-nav--${variant}`, className)} aria-label="Hauptnavigation">
      {header ? <div className="ds-nav__head">{header}</div> : null}
      <ul className="ds-nav__list">
        {items.map((it) => {
          const on = it.id === current;
          return (
            <li key={it.id} className={cx(it.primary && 'is-primary')}>
              <button type="button" className={cx('ds-nav__item', on && 'is-on', it.primary && 'is-primary')} aria-current={on ? 'page' : undefined} onClick={() => onSelect && onSelect(it.id)}>
                <span className="ds-nav__icon">
                  <Icon name={it.icon} size={24} />
                </span>
                <span className="ds-nav__label">{it.label}</span>
                {it.badge ? <span className="ds-nav__badge"><span className="ds-sr">Neu: </span>{it.badge}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---------- AppBar ---------- */
export function AppBar({ title, onBack, actions, className }) {
  return (
    <header className={cx('ds-appbar', className)}>
      {onBack ? (
        <Button variant="ghost" iconOnly icon="arrow-left" onClick={onBack}>Zurück</Button>
      ) : null}
      <h1 className="ds-appbar__title">{title}</h1>
      <div className="ds-appbar__actions">{actions}</div>
    </header>
  );
}

/* ---------- Banner ---------- */
const BANNER_ICON = { info: 'info', success: 'circle-check', warning: 'triangle-alert', error: 'circle-alert' };
export function Banner({ tone = 'info', title, children, action, className }) {
  return (
    <div className={cx('ds-banner', `ds-banner--${tone}`, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={BANNER_ICON[tone]} size={22} />
      <div className="ds-banner__body">
        {title ? <strong className="ds-banner__title">{title}</strong> : null}
        {children ? <span>{children}</span> : null}
      </div>
      {action}
    </div>
  );
}

/* ---------- Sheet ---------- */
export function Sheet({ open, title, onClose, footer, inline = false, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open || inline) return undefined;
    const prev = document.activeElement;
    const first = ref.current && ref.current.querySelector('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose && onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const a = f[0];
        const z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
  }, [open, inline, onClose]);
  if (!open) return null;
  return (
    <div className={cx('ds-sheet', inline && 'is-inline')} onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="ds-sheet__panel" role="dialog" aria-modal={inline ? undefined : true} aria-labelledby={titleId} ref={ref}>
        <span className="ds-sheet__grip" aria-hidden="true" />
        <header className="ds-sheet__head">
          <h2 className="ds-sheet__title" id={titleId}>{title}</h2>
          {onClose ? <Button variant="ghost" iconOnly icon="x" onClick={onClose}>Schließen</Button> : null}
        </header>
        <div className="ds-sheet__body">{children}</div>
        {footer ? <footer className="ds-sheet__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

/* ---------- ShutterButton ---------- */
export function ShutterButton({ busy = false, label = 'Foto aufnehmen', className, ...rest }) {
  return (
    <button type="button" className={cx('ds-shutter', busy && 'is-busy', className)} aria-label={label} aria-busy={busy || undefined} disabled={busy} {...rest}>
      <span className="ds-shutter__ring"><span className="ds-shutter__core" /></span>
    </button>
  );
}
