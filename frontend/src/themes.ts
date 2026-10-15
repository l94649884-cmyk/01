import { useEffect, useState } from 'react';

export type ThemeId = 'botanical' | 'midnight' | 'aurora' | 'blueprint' | 'amber';

export interface ThemePalette {
  bg: string;
  grid: string;
  majorGrid: string;
  axis: string;
  text: string;
  muted: string;
  ink: string;
  accent: string;
  accentSoft: string;
  load: string;
  loadFill: string;
  selection: string;
  supportFill: string;
  chartMoment: string;
  chartShear: string;
  chartDisplacement: string;
}

export const themes: { id: ThemeId; name: string; description: string; swatch: string }[] = [
  { id: 'botanical', name: '原野白', description: '柔和自然 · 经典浅色', swatch: '#547e59' },
  { id: 'midnight', name: '极夜霓虹', description: '青色辉光 · 深邃科技', swatch: '#5ce2dc' },
  { id: 'aurora', name: '星云紫', description: '紫色星云 · 灵感空间', swatch: '#bb9bff' },
  { id: 'blueprint', name: '深海蓝图', description: '工程蓝图 · 精密秩序', swatch: '#7cc9ff' },
  { id: 'amber', name: '琥珀工坊', description: '暖金色调 · 沉静专注', swatch: '#f0bc72' },
];

export const palettes: Record<ThemeId, ThemePalette> = {
  botanical: {
    bg: '#fafbfd', grid: '#eef1f5', majorGrid: '#e0e6ee', axis: '#b6c3d1',
    text: '#40556b', muted: '#687d91', ink: '#29465c', accent: '#44734b', accentSoft: '#edf4e7',
    load: '#ba8b58', loadFill: '#f4e8d6', selection: '#68a3d0', supportFill: '#edf2e5',
    chartMoment: '#28725c', chartShear: '#4f7b9c', chartDisplacement: '#a06c4d',
  },
  midnight: {
    bg: '#111722', grid: '#1a2431', majorGrid: '#283649', axis: '#497082',
    text: '#c1dce7', muted: '#8aafbf', ink: '#d1eaf1', accent: '#5ce2dc', accentSoft: '#163b42',
    load: '#ffbc7b', loadFill: '#48352a', selection: '#76b7ff', supportFill: '#153140',
    chartMoment: '#5ce2dc', chartShear: '#77b8ff', chartDisplacement: '#ffbc7b',
  },
  aurora: {
    bg: '#171721', grid: '#222230', majorGrid: '#303041', axis: '#69677e',
    text: '#e0d4f4', muted: '#b5a1cd', ink: '#e6ddf8', accent: '#bb9bff', accentSoft: '#36254c',
    load: '#ffb4cf', loadFill: '#4a2945', selection: '#79e3d3', supportFill: '#2d2445',
    chartMoment: '#bb9bff', chartShear: '#79e3d3', chartDisplacement: '#ffb4cf',
  },
  blueprint: {
    bg: '#092942', grid: '#123751', majorGrid: '#20506e', axis: '#4e85a5',
    text: '#d4e8f9', muted: '#94bad6', ink: '#e1f1ff', accent: '#7cc9ff', accentSoft: '#164664',
    load: '#ffce86', loadFill: '#48422f', selection: '#7ce7d4', supportFill: '#153e59',
    chartMoment: '#7cc9ff', chartShear: '#7ce7d4', chartDisplacement: '#ffce86',
  },
  amber: {
    bg: '#211b16', grid: '#342b22', majorGrid: '#4b3c2c', axis: '#857058',
    text: '#e9d9c4', muted: '#b7a38c', ink: '#f3e3cd', accent: '#f0bc72', accentSoft: '#483721',
    load: '#ed9b8c', loadFill: '#492c26', selection: '#9acbb5', supportFill: '#392c20',
    chartMoment: '#f0bc72', chartShear: '#9acbb5', chartDisplacement: '#ed9b8c',
  },
};

export const THEME_STORAGE_KEY = 'ligou-lab-theme-v1';

function savedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (themes.some(theme => theme.id === saved)) return saved as ThemeId;
  } catch { /* Theme choice still works when browser storage is unavailable. */ }
  return 'botanical';
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(savedTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Keep the current session usable. */ }
  }, [theme]);
  return { theme, setTheme, palette: palettes[theme] };
}
