export const themes = [
  {
    id: 'classic',
    name: 'Sucuk Klasik',
    background: '#111719',
    sidebar: '#171E21',
    card: '#20292D',
    accent: '#D9643B',
    mode: 'dark',
  },
  {
    id: 'discord',
    name: 'Discord Koyu',
    background: '#313338',
    sidebar: '#2B2D31',
    card: '#383A40',
    accent: '#5865F2',
    mode: 'dark',
  },
  {
    id: 'black',
    name: 'Gece Siyahı',
    background: '#09090B',
    sidebar: '#111114',
    card: '#1B1B20',
    accent: '#818CF8',
    mode: 'dark',
  },
  {
    id: 'red',
    name: 'Kızıl Gece',
    background: '#0D0506',
    sidebar: '#23090D',
    card: '#301519',
    accent: '#F05264',
    mode: 'dark',
  },
  {
    id: 'purple',
    name: 'Mor Gece',
    background: '#0D0A19',
    sidebar: '#151027',
    card: '#211A36',
    accent: '#9B87F5',
    mode: 'dark',
  },
  {
    id: 'velvet',
    name: 'Bordo Kadife',
    background: '#25171D',
    sidebar: '#301F26',
    card: '#402D35',
    accent: '#EA8BA4',
    mode: 'dark',
  },
  {
    id: 'coffee',
    name: 'Kahve',
    background: '#211B17',
    sidebar: '#2D241D',
    card: '#3D3025',
    accent: '#D6A56C',
    mode: 'dark',
  },
  {
    id: 'forest',
    name: 'Orman',
    background: '#10201B',
    sidebar: '#172D25',
    card: '#223C31',
    accent: '#72C59A',
    mode: 'dark',
  },
  {
    id: 'ocean',
    name: 'Okyanus',
    background: '#0D1B2A',
    sidebar: '#142A3D',
    card: '#1D3A50',
    accent: '#64C7E8',
    mode: 'dark',
  },
  {
    id: 'navy',
    name: 'Gece Mavisi',
    background: '#101330',
    sidebar: '#181D43',
    card: '#252B57',
    accent: '#8895FF',
    mode: 'dark',
  },
  {
    id: 'mint',
    name: 'Mint Bahçesi',
    background: '#EFF8F1',
    sidebar: '#DCEEE4',
    card: '#FFFFFF',
    accent: '#25775F',
    mode: 'light',
  },
  {
    id: 'peach',
    name: 'Şeftali',
    background: '#FFF4EA',
    sidebar: '#F7DFCF',
    card: '#FFFFFF',
    accent: '#AF4D2F',
    mode: 'light',
  },
  {
    id: 'lavender',
    name: 'Lavanta Buzu',
    background: '#F1EFFA',
    sidebar: '#DFDDF0',
    card: '#FFFFFF',
    accent: '#6A52B5',
    mode: 'light',
  },
  {
    id: 'powder',
    name: 'Pudra',
    background: '#FFF0F4',
    sidebar: '#F4DCE5',
    card: '#FFFFFF',
    accent: '#AA416F',
    mode: 'light',
  },
  {
    id: 'cream',
    name: 'Krem',
    background: '#F8F5E8',
    sidebar: '#ECE7D2',
    card: '#FFFEF7',
    accent: '#786329',
    mode: 'light',
  },
  {
    id: 'gray',
    name: 'Açık Gri',
    background: '#F3F4F6',
    sidebar: '#E5E7EB',
    card: '#FFFFFF',
    accent: '#4657C8',
    mode: 'light',
  },
  {
    id: 'sunset',
    name: 'Gün Batımı',
    background: '#261342',
    sidebar: '#301A38',
    card: '#352237',
    accent: '#FFB173',
    mode: 'dark',
    gradient: ['#261342', '#A64B38'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    background: '#102C2A',
    sidebar: '#172F34',
    card: '#21353F',
    accent: '#75DDC5',
    mode: 'dark',
    gradient: ['#102C2A', '#283B62', '#533267'],
  },
  {
    id: 'neon',
    name: 'Neon Akşam',
    background: '#18113E',
    sidebar: '#24153F',
    card: '#302047',
    accent: '#D298FF',
    mode: 'dark',
    gradient: ['#18113E', '#671D76', '#174B76'],
  },
  {
    id: 'sand',
    name: 'Kum ve Zeytin',
    background: '#29291B',
    sidebar: '#343224',
    card: '#403B2B',
    accent: '#D9C58C',
    mode: 'dark',
    gradient: ['#29291B', '#635636'],
  },
] as const;
export type Appearance = (typeof themes)[number]['id'] | 'system';
export const appearanceIds = ['system', ...themes.map((t) => t.id)] as [
  Appearance,
  ...Appearance[],
];
export function resolveTheme(id: string | undefined, systemDark = false) {
  return (
    themes.find((t) => t.id === (id === 'system' ? (systemDark ? 'classic' : 'gray') : id)) ||
    themes[0]
  );
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (v: number[]) =>
  '#' + v.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
export function mix(a: string, b: string, ratio: number) {
  const x = rgb(a),
    y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * ratio));
}
export function contrast(a: string, b: string) {
  const l = (h: string) =>
    rgb(h)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = l(a),
    y = l(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function palette(id: string | undefined, systemDark = false): Record<string, string> {
  const t = resolveTheme(id, systemDark),
    dark = t.mode === 'dark',
    fg = dark ? '#F5F7FA' : '#20232B';
  const gradient = 'gradient' in t ? [...t.gradient] : [];
  const muted = mix(t.card, fg, 0.075),
    primarySoft = mix(t.card, t.accent, 0.17),
    positiveBg = mix(t.card, dark ? '#25995D' : '#1C824F', 0.12),
    dangerBg = mix(t.card, '#C44258', 0.12),
    warningBg = mix(t.card, '#B58226', 0.12),
    hover = mix(t.card, fg, 0.07);
  const surfaces = [
    t.background,
    t.sidebar,
    t.card,
    ...gradient,
    muted,
    primarySoft,
    positiveBg,
    dangerBg,
    warningBg,
    hover,
  ];
  const readable = (color: string) => {
    for (let i = 0; i <= 100; i++) {
      const candidate = mix(color, fg, i / 100);
      if (surfaces.every((s) => contrast(candidate, s) >= 4.5)) return candidate;
    }
    return fg;
  };
  const primary = readable(t.accent);
  const onAccent =
    contrast(primary, '#FFFFFF') >= contrast(primary, '#151515') ? '#FFFFFF' : '#151515';
  return {
    background: t.background,
    foreground: fg,
    sidebar: t.sidebar,
    card: t.card,
    muted: muted,
    'muted-foreground': readable(dark ? '#B7BEC9' : '#596272'),
    border: mix(t.card, fg, 0.24),
    primary: primary,
    'primary-foreground': onAccent,
    'primary-soft': primarySoft,
    positive: readable(dark ? '#8BDBAD' : '#176443'),
    'positive-bg': positiveBg,
    warning: readable(dark ? '#F1CE8C' : '#785115'),
    'orange-bg': warningBg,
    danger: readable(dark ? '#FFA5B1' : '#A82039'),
    'danger-bg': dangerBg,
    info: readable(dark ? '#9CD7FF' : '#255A8A'),
    hover,
    shadow: dark ? '0 18px 54px #0007' : '0 18px 54px #17223722',
    'app-gradient': gradient.length
      ? 'linear-gradient(135deg,' + gradient.join(',') + ')'
      : t.background,
  };
}
