import type {
  ClassifierGroupTreeItem,
  ClassifierProfStandardTreeItem,
  PsFunctionItem,
} from "../hooks/useContentStore";

export function formatPsCode(code: number): string {
  return `06.${code.toString().padStart(3, "0")}`;
}

export function formatTfCode(code: number, qualificationLevel: number): string {
  return `${code.toString().padStart(2, "0")}.${qualificationLevel}`;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function includesNeedle(value: string | number, needle: string): boolean {
  return String(value).toLowerCase().includes(needle);
}

export function filterClassifierTree(
  items: ClassifierProfStandardTreeItem[],
  query: string,
): ClassifierProfStandardTreeItem[] {
  const needle = normalizeSearchValue(query);
  if (!needle) return items;

  return items.reduce<ClassifierProfStandardTreeItem[]>((standards, standard) => {
    const standardCode = formatPsCode(standard.code);
    const standardMatches =
      includesNeedle(standard.name, needle) ||
      includesNeedle(standardCode, needle);

    const groups = standard.groups.reduce<ClassifierGroupTreeItem[]>((filteredGroups, group) => {
      const groupMatches =
        standardMatches ||
        includesNeedle(group.name, needle) ||
        includesNeedle(group.code, needle) ||
        includesNeedle(group.qualification_level, needle);

      const functions = group.functions.filter((item) => (
        groupMatches ||
        includesNeedle(item.name, needle) ||
        includesNeedle(formatTfCode(item.code, group.qualification_level), needle)
      ));

      if (groupMatches || functions.length > 0) {
        filteredGroups.push({
          ...group,
          functions: groupMatches ? group.functions : functions,
        });
      }

      return filteredGroups;
    }, []);

    if (standardMatches || groups.length > 0) {
      standards.push({
        ...standard,
        groups: standardMatches ? standard.groups : groups,
      });
    }

    return standards;
  }, []);
}

export function findClassifierFunctionById(
  items: ClassifierProfStandardTreeItem[],
  id: number,
): PsFunctionItem | null {
  for (const standard of items) {
    for (const group of standard.groups) {
      const item = group.functions.find((func) => func.id === id);
      if (item) {
        return { id: item.id, code: item.code, name: item.name };
      }
    }
  }

  return null;
}

export function getClassifierFunctionIds(items: ClassifierProfStandardTreeItem[]): number[] {
  return items.flatMap((standard) =>
    standard.groups.flatMap((group) => group.functions.map((item) => item.id))
  );
}
