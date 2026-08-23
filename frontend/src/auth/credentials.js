const FIREBASE_PASSWORD_NAMESPACE = 'dazhugong.firebase-auth.v2';
const LOGIN_EMAIL_DOMAIN = 'dazhugong.invalid';

export function deriveLoginEmail(authUid) {
  return `${authUid}@${LOGIN_EMAIL_DOMAIN}`;
}

export async function deriveFirebasePassword(authUid, accessCode) {
  const credentialMaterial = JSON.stringify([
    FIREBASE_PASSWORD_NAMESPACE,
    authUid,
    accessCode,
  ]);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(credentialMaterial),
  );
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const base64Url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `DzG2!${base64Url}`;
}
