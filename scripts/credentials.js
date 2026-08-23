const crypto = require('node:crypto');

const FIREBASE_PASSWORD_NAMESPACE = 'dazhugong.firebase-auth.v2';
const LOGIN_EMAIL_DOMAIN = 'dazhugong.invalid';

function deriveLoginEmail(authUid) {
  return `${authUid}@${LOGIN_EMAIL_DOMAIN}`;
}

function deriveFirebasePassword(authUid, accessCode) {
  const credentialMaterial = JSON.stringify([
    FIREBASE_PASSWORD_NAMESPACE,
    authUid,
    accessCode,
  ]);
  const digest = crypto
    .createHash('sha256')
    .update(credentialMaterial, 'utf8')
    .digest('base64url');

  return `DzG2!${digest}`;
}

module.exports = {
  deriveFirebasePassword,
  deriveLoginEmail,
};
