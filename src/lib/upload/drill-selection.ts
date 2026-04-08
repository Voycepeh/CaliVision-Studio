export function resolveSelectedDrillKey(options: Array<{ key: string }>, currentKey?: string | null, storedKey?: string | null): string | null {
  const preferred = currentKey ?? storedKey ?? options[0]?.key ?? null;
  if (!preferred) {
    return null;
  }
  return options.some((option) => option.key === preferred) ? preferred : options[0]?.key ?? null;
}

