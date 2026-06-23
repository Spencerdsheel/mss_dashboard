"""Tests for services/common/secrets.py — AES-256-GCM encrypt/decrypt."""

import pytest

from services.common.secrets import decrypt_secret, encrypt_secret

KEY = "a-proper-secret-encryption-key-32chars!!"
WRONG_KEY = "a-different-secret-encryption-key!!!"


class TestSecretEncryption:
    def test_encrypt_decrypt_round_trip(self):
        plaintext = "my-super-secret-api-key-12345"
        ciphertext = encrypt_secret(plaintext, KEY)
        decrypted = decrypt_secret(ciphertext, KEY)
        assert decrypted == plaintext

    def test_ciphertext_differs_from_plaintext(self):
        plaintext = "secret-value"
        ciphertext = encrypt_secret(plaintext, KEY)
        assert ciphertext != plaintext
        assert "secret-value" not in ciphertext

    def test_decrypt_with_wrong_key_raises(self):
        plaintext = "secret-value"
        ciphertext = encrypt_secret(plaintext, KEY)
        with pytest.raises(ValueError, match="decrypt"):
            decrypt_secret(ciphertext, WRONG_KEY)

    def test_encryption_is_non_deterministic(self):
        plaintext = "same-plaintext"
        c1 = encrypt_secret(plaintext, KEY)
        c2 = encrypt_secret(plaintext, KEY)
        assert c1 != c2  # random nonce each time

    def test_empty_string_round_trip(self):
        ciphertext = encrypt_secret("", KEY)
        assert decrypt_secret(ciphertext, KEY) == ""

    def test_corrupted_ciphertext_raises(self):
        plaintext = "secret"
        ciphertext = encrypt_secret(plaintext, KEY)
        # Corrupt a byte in the middle
        corrupted = ciphertext[:-4] + "XXXX"
        with pytest.raises(ValueError, match="decrypt"):
            decrypt_secret(corrupted, KEY)
