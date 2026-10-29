package app.doublesweat.mobile.push

import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.GeneralSecurityException
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.security.spec.PKCS8EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Entschlüsselt Push-Nachrichten, die der Server nach RFC 8291 (Web Push Encryption, aes128gcm) verschlüsselt hat.
 * Damit laufen Nachrichten über Firebase Cloud Messaging Ende-zu-Ende: Google transportiert nur Bytes, die es
 * nicht lesen kann. Das Gerät erzeugt dafür ein Schlüsselpaar und ein Auth-Geheimnis und meldet dem Server nur den
 * öffentlichen Teil.
 */
object WebPushCrypto {
    private const val PUBLIC_KEY_BYTES = 65
    private const val AUTH_BYTES = 16
    private const val TAG_BYTES = 16
    private const val HEADER_FIXED = 21 // salt (16) + record size (4) + key id length (1)
    private const val MAX_BODY_BYTES = 8192

    /** Schlüsselmaterial des Geräts. [privateKey] im PKCS#8-Format, [publicKey] unkomprimiert (65 Byte, 0x04...). */
    class KeySet(val privateKey: ByteArray, val publicKey: ByteArray, val auth: ByteArray)

    private val curve: ECParameterSpec by lazy {
        AlgorithmParameters.getInstance("EC").run {
            init(ECGenParameterSpec("secp256r1"))
            getParameterSpec(ECParameterSpec::class.java)
        }
    }

    fun generateKeys(random: SecureRandom = SecureRandom()): KeySet {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec("secp256r1"), random)
        val pair = generator.generateKeyPair()
        val point = (pair.public as ECPublicKey).w
        val auth = ByteArray(AUTH_BYTES).also { random.nextBytes(it) }
        return KeySet(pair.private.encoded, uncompressed(point), auth)
    }

    /**
     * @throws GeneralSecurityException wenn die Nachricht nicht zu diesen Schlüsseln gehört, verändert wurde oder
     * kein gültiges aes128gcm-Format hat
     */
    fun decrypt(body: ByteArray, keys: KeySet): ByteArray {
        if (body.size < HEADER_FIXED + PUBLIC_KEY_BYTES + TAG_BYTES + 1 || body.size > MAX_BODY_BYTES) {
            throw GeneralSecurityException("Nachricht hat eine unerwartete Größe")
        }
        val salt = body.copyOfRange(0, 16)
        val recordSize = ((body[16].toLong() and 0xff) shl 24) or ((body[17].toLong() and 0xff) shl 16) or
            ((body[18].toLong() and 0xff) shl 8) or (body[19].toLong() and 0xff)
        val idLength = body[20].toInt() and 0xff
        if (idLength != PUBLIC_KEY_BYTES) throw GeneralSecurityException("Absenderschlüssel fehlt")
        if (recordSize < TAG_BYTES + 2 || recordSize > MAX_BODY_BYTES) {
            throw GeneralSecurityException("Ungültige Blockgröße")
        }
        val senderPublic = body.copyOfRange(HEADER_FIXED, HEADER_FIXED + idLength)

        val ecdh = KeyAgreement.getInstance("ECDH").apply {
            init(KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(keys.privateKey)))
            doPhase(publicKeyOf(senderPublic), true)
        }.generateSecret()

        // RFC 8291, Abschnitt 3.4
        val keyInfo = "WebPush: info".toByteArray() + 0 + keys.publicKey + senderPublic
        val ikm = hkdf(keys.auth, ecdh, keyInfo, 32)
        val cek = hkdf(salt, ikm, "Content-Encoding: aes128gcm".toByteArray() + 0, 16)
        val nonce = hkdf(salt, ikm, "Content-Encoding: nonce".toByteArray() + 0, 12)

        val records = body.copyOfRange(HEADER_FIXED + idLength, body.size)
        val out = java.io.ByteArrayOutputStream()
        var offset = 0
        var index = 0L
        while (offset < records.size) {
            val end = minOf(offset + recordSize.toInt(), records.size)
            val last = end == records.size
            val plain = decryptRecord(cek, xorCounter(nonce, index), records, offset, end - offset)
            out.write(unpad(plain, last))
            offset = end
            index++
        }
        return out.toByteArray()
    }

    private fun decryptRecord(cek: ByteArray, nonce: ByteArray, data: ByteArray, offset: Int, length: Int): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(TAG_BYTES * 8, nonce))
        return cipher.doFinal(data, offset, length)
    }

    /** Entfernt Auffüllung und Trennbyte: 0x02 beendet die letzte Nachricht, 0x01 einen Block davor. */
    private fun unpad(plain: ByteArray, last: Boolean): ByteArray {
        var end = plain.size
        while (end > 0 && plain[end - 1].toInt() == 0) end--
        if (end == 0) throw GeneralSecurityException("Trennbyte fehlt")
        val delimiter = plain[end - 1].toInt()
        if (delimiter != (if (last) 2 else 1)) throw GeneralSecurityException("Ungültiges Trennbyte")
        return plain.copyOfRange(0, end - 1)
    }

    private fun xorCounter(nonce: ByteArray, index: Long): ByteArray {
        val out = nonce.copyOf()
        for (i in 0 until 8) {
            out[out.size - 1 - i] = (out[out.size - 1 - i].toInt() xor ((index shr (8 * i)) and 0xff).toInt()).toByte()
        }
        return out
    }

    private fun publicKeyOf(uncompressed: ByteArray): java.security.PublicKey {
        if (uncompressed.size != PUBLIC_KEY_BYTES || uncompressed[0].toInt() != 0x04) {
            throw GeneralSecurityException("Ungültiger öffentlicher Schlüssel")
        }
        val x = BigInteger(1, uncompressed.copyOfRange(1, 33))
        val y = BigInteger(1, uncompressed.copyOfRange(33, 65))
        return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(x, y), curve))
    }

    private fun uncompressed(point: ECPoint): ByteArray =
        byteArrayOf(0x04) + fixed(point.affineX, 32) + fixed(point.affineY, 32)

    private fun fixed(value: BigInteger, size: Int): ByteArray {
        val raw = value.toByteArray()
        return when {
            raw.size == size -> raw
            raw.size > size -> raw.copyOfRange(raw.size - size, raw.size) // führendes Vorzeichenbyte
            else -> ByteArray(size - raw.size) + raw
        }
    }

    /** HKDF mit SHA-256 (RFC 5869) für höchstens 32 Byte Ausgabe. */
    private fun hkdf(salt: ByteArray, ikm: ByteArray, info: ByteArray, length: Int): ByteArray {
        require(length in 1..32)
        val extract = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(salt, "HmacSHA256")) }
        val prk = extract.doFinal(ikm)
        val expand = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(prk, "HmacSHA256")) }
        return expand.doFinal(info + 1).copyOf(length)
    }

    private operator fun ByteArray.plus(byte: Int): ByteArray = this + byte.toByte()
}
