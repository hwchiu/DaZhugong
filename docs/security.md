# Credential security notes

DaZhugong production remains a Firebase Spark application with no custom
server. Member selection is public UX; possession of a member's private
`accessCode` is the authentication factor.

## Required controls

- Configure access codes only through the protected `MEMBERS_CONFIG` secret.
- Use 12–64 characters with uppercase, lowercase, digit, and symbol characters.
- Assign a unique code to every member and store it in a password manager.
- Do not add leading or trailing whitespace; validation rejects it rather than
  changing credential bytes silently.
- Replace every `<SET_UNIQUE_ACCESS_CODE>` placeholder before seeding.
- Never commit, log, screenshot, or include a real code in support tickets.
- Rotate a member's code by updating `MEMBERS_CONFIG` and rerunning the protected
  seed workflow.

The client and seed derive the same opaque Firebase password by hashing a
versioned JSON tuple of namespace, stable Auth UID, and access code. Fixed
vectors test Node crypto/Web Crypto parity. Public Firestore member documents
contain neither the code nor its derived password.

A four-digit client-derived PIN is not acceptable: 10,000 candidates can be
enumerated, and Spark/no-server architecture cannot add a private server-side
verification and throttling layer. Strong private access codes are therefore a
production requirement, not an optional UX preference.
