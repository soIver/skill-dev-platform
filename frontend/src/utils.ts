export type UnitForms = [string, string, string, string];

export function getUnitWord(value: number, forms: UnitForms): string {
  const [zero, one, few, many] = forms;
  const integerValue = Math.abs(Math.trunc(value));
  if (integerValue === 0) return zero;

  const mod10 = integerValue % 10;
  const mod100 = integerValue % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatSeconds(value: number): string {
  if (value <= 0) {
    return "менее секунды";
  }

  return `${value} ${getUnitWord(value, ["секунд", "секунду", "секунды", "секунд"])}`;
}

export function formatDurationSeconds(value: number): string {
  if (value < 60) {
    return formatSeconds(value);
  }

  if (value < 3600) {
    const minutes = Math.ceil(value / 60);
    return `${minutes} ${getUnitWord(minutes, ["минут", "минуту", "минуты", "минут"])}`;
  }

  if (value < 86400) {
    const hours = Math.ceil(value / 3600);
    return `${hours} ${getUnitWord(hours, ["часов", "час", "часа", "часов"])}`;
  }

  const days = Math.ceil(value / 86400);
  return `${days} ${getUnitWord(days, ["дней", "день", "дня", "дней"])}`;
}

export function flashField(el: HTMLInputElement | null) {
  if (!el) return;
  el.classList.remove("input-field-error");
  void el.offsetWidth;
  el.classList.add("input-field-error");
  el.addEventListener("animationend", () => el.classList.remove("input-field-error"), { once: true });
}
