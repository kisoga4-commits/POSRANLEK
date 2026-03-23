const SecurityBridge = (() => {
  const CLOUD_TOKEN_ENDPOINT = 'https://us-central1-YOUR_PROJECT.cloudfunctions.net/issuePosToken';
  const CLOUD_STATUS_ENDPOINT = 'https://us-central1-YOUR_PROJECT.cloudfunctions.net/getLicenseStatus';
  const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
YOUR_CLOUD_PUBLIC_KEY_HERE
-----END PUBLIC KEY-----`;
  const LICENSE_TOKEN_KEY = 'LICENSE_TOKEN';

  const textEncoder = new TextEncoder();

  const toBase64Url = (bytes) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const fromBase64Url = (input) => {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  };

  const pemToArrayBuffer = (pem) => {
    const clean = pem.replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', '').replace(/\s+/g, '');
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out.buffer;
  };

  const getBrowserFallbackId = async () => {
    const storageKey = 'pos_machine_uuid_v1';
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;

    const payload = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}|${Date.now()}`;
    const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(payload));
    const id = `BROWSER-${toBase64Url(new Uint8Array(digest)).slice(0, 16).toUpperCase()}`;
    localStorage.setItem(storageKey, id);
    return id;
  };

  const getMachineId = async () => {
    if (window.electronAPI?.getMachineId) {
      const hddId = await window.electronAPI.getMachineId();
      if (hddId) return String(hddId).trim().toUpperCase();
    }
    if (window.Android?.getHardwareUUID) {
      const androidId = window.Android.getHardwareUUID();
      if (androidId) return `ANDROID-${String(androidId).trim().toUpperCase()}`;
    }
    if (window.PosNative?.getHardwareUUID) {
      const nativeId = await window.PosNative.getHardwareUUID();
      if (nativeId) return `PC-${String(nativeId).trim().toUpperCase()}`;
    }
    return getBrowserFallbackId();
  };

  const importPublicKey = async () => {
    if (PUBLIC_KEY_PEM.includes('YOUR_CLOUD_PUBLIC_KEY_HERE')) return null;
    return crypto.subtle.importKey(
      'spki',
      pemToArrayBuffer(PUBLIC_KEY_PEM),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  };

  const decodeTokenPayload = (token) => {
    if (!token || !token.includes('.')) return null;
    const [payloadPart] = token.split('.');
    if (!payloadPart) return null;
    try {
      return JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart)));
    } catch (_) {
      return null;
    }
  };

  const verifySignedToken = async (token, machineId) => {
    if (!token || !token.includes('.')) return { ok: false, reason: 'missing_token' };
    const [payloadPart, signaturePart] = token.split('.');
    if (!payloadPart || !signaturePart) return { ok: false, reason: 'bad_format' };

    const payload = decodeTokenPayload(token);
    if (!payload) return { ok: false, reason: 'invalid_payload' };

    if (payload.machineId !== machineId) return { ok: false, reason: 'machine_mismatch', claims: payload };
    if (payload.exp && Date.now() > Number(payload.exp)) return { ok: false, reason: 'token_expired', claims: payload };

    const publicKey = await importPublicKey();
    if (!publicKey) return { ok: false, reason: 'missing_public_key', claims: payload };

    const signedData = textEncoder.encode(payloadPart);
    const signature = fromBase64Url(signaturePart);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, signedData);
    return valid ? { ok: true, claims: payload } : { ok: false, reason: 'invalid_signature', claims: payload };
  };

  const recoverTokenFromCloud = async (machineId) => {
    const response = await fetch(CLOUD_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId })
    });
    if (!response.ok) throw new Error(`token_recovery_failed_${response.status}`);
    const data = await response.json();
    return data?.token || '';
  };

  const syncLicenseStatus = async (machineId, token) => {
    const response = await fetch(CLOUD_STATUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId, token })
    });
    if (!response.ok) return { status: 'yellow' };
    const data = await response.json();
    return { status: data?.status || 'yellow' };
  };

  return {
    LICENSE_TOKEN_KEY,
    getMachineId,
    decodeTokenPayload,
    verifySignedToken,
    recoverTokenFromCloud,
    syncLicenseStatus
  };
})();
