export const ALL = "__all__";

export type ActiveFilters = { city: string; i1: string; i2: string; i3: string };

const FIELD_MAP: Record<keyof ActiveFilters, string> = {
  city: "city",
  i1: "install1",
  i2: "install2",
  i3: "install3",
};

export function rowsExcluding<T extends Record<string, any>>(
  rows: T[],
  filters: ActiveFilters,
  skip: keyof ActiveFilters
): T[] {
  return rows.filter((row) => {
    for (const dim of ["city", "i1", "i2", "i3"] as const) {
      if (dim === skip) continue;
      const filterValue = filters[dim];
      if (filterValue === ALL) continue;
      const field = FIELD_MAP[dim];
      if (row[field] !== filterValue) return false;
    }
    return true;
  });
}

export function cascadingOptions(
  rows: Array<Record<string, any>>,
  field: string,
  current: string
): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const v = row[field];
    if (v != null) values.add(v);
  }
  const sorted = Array.from(values).sort();
  if (current !== ALL && !values.has(current)) {
    sorted.push(current);
    sorted.sort();
  }
  return sorted;
}
