export const FREE_PRO_STORAGE_KEY = 'pdfToolkitFreePro';
type ActivationStore = Pick<Storage, 'getItem' | 'setItem'>;

function browserStore(): ActivationStore | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}

export function isFreeProActivated(store = browserStore()) {
  try { return store?.getItem(FREE_PRO_STORAGE_KEY) === 'activated'; }
  catch { return false; }
}

export function persistFreeProActivation(store = browserStore()) {
  try { store?.setItem(FREE_PRO_STORAGE_KEY, 'activated'); return !!store; }
  catch { return false; }
}
