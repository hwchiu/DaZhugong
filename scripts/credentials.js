const FIREBASE_PASSWORD_NAMESPACE = 'dazhugong.firebase-auth.v1';
const LOGIN_EMAIL_DOMAIN = 'dazhugong.invalid';

function deriveLoginEmail(authUid) {
  return `${authUid}@${LOGIN_EMAIL_DOMAIN}`;
}

function deriveFirebasePassword(authUid, pin) {
  return `${FIREBASE_PASSWORD_NAMESPACE}:${authUid}:${pin}`;
}

module.exports = {
  deriveFirebasePassword,
  deriveLoginEmail,
};
