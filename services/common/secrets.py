from __future__ import annotations

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# S1 — Key separation
# The `key` argument to encrypt_secret / decrypt_secret must be the value of
# settings.secret_encryption_key (SECRET_ENCRYPTION_KEY env var), NOT
# settings.jwt_secret. Using separate keys means a compromised JWT signing
# key does not expose stored provider secrets, and vice-versa.
#
# MIGRATION NOTE: Existing secrets were encrypted with the sha256 of
# settings.jwt_secret. Before deploying with a new SECRET_ENCRYPTION_KEY:
#   1. Decrypt each dashboard.provider_connections.client_secret_encrypted row
#      using decrypt_secret(row, old_jwt_secret).
#   2. Re-encrypt with encrypt_secret(plaintext, new_secret_encryption_key).
#   3. Update the row in the database.
#   4. Only then deploy the new key.


def encrypt_secret(value: str, key: str) -> str:
    """Encrypt a secret using AES-256-GCM.

    Args:
        value: Plaintext secret to encrypt.
        key: Encryption key — must be settings.secret_encryption_key
             (SECRET_ENCRYPTION_KEY), NOT the JWT secret.

    Returns base64url-encoded ``nonce || ciphertext`` string.
    """
    key_bytes = hashlib.sha256(key.encode("utf-8")).digest()
    aesgcm = AESGCM(key_bytes)

    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, value.encode("utf-8"), None)

    data = nonce + ciphertext
    return base64.urlsafe_b64encode(data).decode("ascii")


def decrypt_secret(value: str, key: str) -> str:
    """Decrypt a secret using AES-256-GCM.

    Args:
        value: base64url-encoded ``nonce || ciphertext`` produced by encrypt_secret.
        key: Encryption key — must be settings.secret_encryption_key
             (SECRET_ENCRYPTION_KEY), NOT the JWT secret.
    """
    key_bytes = hashlib.sha256(key.encode("utf-8")).digest()
    aesgcm = AESGCM(key_bytes)

    data = base64.urlsafe_b64decode(value.encode("ascii"))
    nonce = data[:12]
    ciphertext = data[12:]

    try:
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    except Exception as exc:
        raise ValueError("Failed to decrypt secret: invalid key or corrupted data") from exc
    return plaintext.decode("utf-8")

