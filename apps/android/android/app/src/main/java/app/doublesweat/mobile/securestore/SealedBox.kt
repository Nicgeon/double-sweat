package app.doublesweat.mobile.securestore

import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Verschlüsselt einen Wert mit AES-256-GCM. Der Name des Eintrags geht als zusätzlich authentisierte Daten ein,
 * damit sich zwei gespeicherte Werte nicht gegeneinander austauschen lassen.
 *
 * Format: Version (1 Byte) | IV (12 Byte) | Chiffretext mit Tag
 */
object SealedBox {
    private const val VERSION: Byte = 1
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    /** Den IV erzeugt der Anbieter selbst (beim Android Keystore vorgeschrieben: nie ein vorgegebener IV). */
    fun seal(key: SecretKey, entry: String, plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        cipher.updateAAD(entry.toByteArray(Charsets.UTF_8))
        val encrypted = cipher.doFinal(plain)
        check(cipher.iv.size == IV_BYTES) { "unerwartete IV-Länge" }
        return byteArrayOf(VERSION) + cipher.iv + encrypted
    }

    /** @throws GeneralSecurityException wenn der Wert verändert wurde, zu einem anderen Eintrag gehört oder der Schlüssel nicht passt */
    fun open(key: SecretKey, entry: String, sealed: ByteArray): ByteArray {
        if (sealed.size < 1 + IV_BYTES + TAG_BITS / 8 || sealed[0] != VERSION) {
            throw GeneralSecurityException("unbekanntes Format")
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 1, IV_BYTES))
        cipher.updateAAD(entry.toByteArray(Charsets.UTF_8))
        return cipher.doFinal(sealed, 1 + IV_BYTES, sealed.size - 1 - IV_BYTES)
    }
}
