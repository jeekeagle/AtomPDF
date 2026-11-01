const cryptoKey = (message: string) =>
  crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));

const hex = async (message: string) => {
  const buffer = await cryptoKey(message);
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * 访问门：静态托管没有服务端，密码只能在前端校验。
 * 这里只比对哈希，明文密码不会进入代码仓库。
 */
const HASH = (import.meta.env.VITE_ACCESS_HASH || '').trim();

export const gateEnabled = HASH.length > 0;

const STORAGE_KEY = 'atlas-access-granted';

export const isUnlocked = () => {
  if (!gateEnabled) return true;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const unlock = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* 隐私模式下写不进去也不影响本次使用 */
  }
};

export const lock = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

export const verifyPassword = async (password: string) => {
  if (!gateEnabled) return true;
  const candidate = await hex(password);
  if (candidate.length !== HASH.length) return false;
  let mismatch = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    mismatch |= candidate.charCodeAt(index) ^ HASH.charCodeAt(index);
  }
  return mismatch === 0;
};
