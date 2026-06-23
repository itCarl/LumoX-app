// promptText — a single text-field prompt on the generic dialog window, the
// in-app replacement for the unsupported native `window.prompt()`. Use it to
// rename a scene / bank / group or name a new preset / palette. Resolves with the
// trimmed string, or null when cancelled / left empty.

const { lumox } = window;

export function promptText(opts: {
  title: string;
  value?: string;          // seed (the current name) — pre-selected for quick overwrite
  placeholder?: string;
  message?: string;        // optional hint line above the field
  okLabel?: string;        // primary button label (default "Save")
}): Promise<string | null> {
  return lumox.dialog
    .prompt({
      title: opts.title,
      message: opts.message ?? '',
      input: { value: opts.value ?? '', placeholder: opts.placeholder },
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'ok', label: opts.okLabel ?? 'Save', variant: 'primary' },
      ],
      cancelId: 'cancel',
    })
    .then((v) => { const t = v?.trim(); return t ? t : null; });
}
