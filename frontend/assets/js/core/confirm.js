/**
 * Promise-based confirm/alert dialogs (replaces native alert/confirm where wired).
 */
let dialogRoot;

function ensureDialogRoot() {
  if (dialogRoot) return dialogRoot;
  dialogRoot = document.createElement('div');
  dialogRoot.id = 'app-dialog-root';
  document.body.appendChild(dialogRoot);
  return dialogRoot;
}

export function showAlert(message, title = 'Notice') {
  return showConfirm({ title, message, confirmLabel: 'OK', cancelLabel: null });
}

export function showConfirm({
  title = 'Confirm',
  message = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
} = {}) {
  return new Promise((resolve) => {
    const root = ensureDialogRoot();
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const card = document.createElement('div');
    card.className = 'dialog-card';

    const header = document.createElement('div');
    header.className = 'dialog-header';
    header.textContent = title;

    const body = document.createElement('div');
    body.className = 'dialog-body';
    body.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    if (cancelLabel) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.textContent = cancelLabel;
      cancelBtn.addEventListener('click', () => close(false));
      actions.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = confirmLabel;
    okBtn.addEventListener('click', () => close(true));
    actions.appendChild(okBtn);

    card.append(header, body, actions);
    overlay.appendChild(card);
    root.appendChild(overlay);

    okBtn.focus();
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cancelLabel) close(false);
    });
  });
}
