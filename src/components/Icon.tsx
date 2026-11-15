import { Fragment, type ReactNode } from 'react';
import { iconPaths, legacyIconNames, type IconName } from '@/lib/icons';

export function Icon({ name }: { name: IconName }) {
  return <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"
    style={{ display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0 }}>
    <path d={iconPaths[name]} />
  </svg>;
}

// Supports status strings and legacy database icons without changing stored data.
export function IconText({ children }: { children: ReactNode }) {
  if (typeof children !== 'string') return <>{children}</>;
  const segments = Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(children));
  return <>{segments.map(({ segment }, index) => {
    const name = legacyIconNames[segment.replace(/\uFE0F/g, '')];
    return <Fragment key={index}>{name ? <Icon name={name} /> : segment}</Fragment>;
  })}</>;
}
