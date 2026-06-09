export const USERNAME_RE = /^[a-zA-Zа-яА-ЯёЁ_-]*$/;
export const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export function checkUsername(value: string) {
  return {
    length: value.length >= 4 && value.length <= 32,
    validChars: value.length === 0 || USERNAME_RE.test(value),
  };
}

export function checkPassword(value: string) {
  return {
    length: value.length >= 12 && value.length <= 32,
    hasDigit: /\d/.test(value),
    hasSpecial: /[^\p{L}\d]/u.test(value),
    hasMixedCaseLetters: /\p{Ll}/u.test(value) && /\p{Lu}/u.test(value),
  };
}

export function checkEmail(value: string) {
  return {
    valid: EMAIL_RE.test(value),
  };
}

