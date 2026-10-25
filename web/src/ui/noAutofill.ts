// Keeps Safari, iCloud Passwords, 1Password and LastPass away from dashboard fields.
export const NO_AUTOFILL = { autoComplete: "off", "data-1p-ignore": "", "data-lpignore": "true", "data-form-type": "other" } as const;

// A secret stays a text field (a password field calls the password managers) masked with CSS.
export const SECRET_FIELD = { ...NO_AUTOFILL, type: "text", className: "secret-field", spellCheck: false, autoCapitalize: "off", autoCorrect: "off" } as const;
