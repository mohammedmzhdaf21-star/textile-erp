import type { TFunction } from 'i18next';

const colorTranslationKey = (name: string) =>
  `colorNames.${name.replace(/[^a-zA-Z0-9]/g, '')}`;

export const getColorLabel = (t: TFunction, name?: string | null) => {
  if (!name) return '';
  const key = colorTranslationKey(name);
  const translated = t(key, { defaultValue: name });
  return translated === key ? name : translated;
};
