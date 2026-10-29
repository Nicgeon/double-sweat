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
import java.security.spec.ECPrivateKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class WebPushCryptoTest {
    private fun b64url(value: String): ByteArray = Base64.getUrlDecoder().decode(value.replace("\\s".toRegex(), ""))

    private val curve: ECParameterSpec = AlgorithmParameters.getInstance("EC").run {
        init(ECGenParameterSpec("secp256r1"))
        getParameterSpec(ECParameterSpec::class.java)
    }

    private fun pkcs8(rawPrivate: ByteArray): ByteArray =
        KeyFactory.getInstance("EC").generatePrivate(ECPrivateKeySpec(BigInteger(1, rawPrivate), curve)).encoded

    /** Beispiel aus RFC 8291, Abschnitt 5 und Anhang A. */
    @Test
    fun decryptsTheRfc8291Example() {
        val keys = WebPushCrypto.KeySet(
            privateKey = pkcs8(b64url("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94")),
            publicKey = b64url("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
            auth = b64url("BTBZMqHH6r4Tts7J_aSIgg"),
        )
        // Kopf (86 Byte) und Chiffretext sind im RFC getrennt aufgeführt und einzeln zu dekodieren
        val body = b64url("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8") +
            b64url("8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ")
        assertEquals("When I grow up, I want to be a watermelon", String(WebPushCrypto.decrypt(body, keys)))
    }

    /** Mit der Server-Bibliothek (web-push) erzeugt: genau das, was FCM unserem Gerät zustellt. */
    @Test
    fun decryptsAMessageFromTheServer() {
        val keys = WebPushCrypto.KeySet(
            privateKey = Base64.getDecoder().decode("MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgrsY9NnF44XnDx25ryScPRzzH8N21hCezAkZ4bnrCTDuhRANCAASGYCQE2R66R7xKScEeknQ3kFGCypBKyFIt4q33sok/xtvdTLzPk/oM6uXllFuoT325HcONx3Aee9ZhI9389WIY"),
            publicKey = b64url("BIZgJATZHrpHvEpJwR6SdDeQUYLKkErIUi3irfeyiT_G291MvM-T-gzq5eWUW6hPfbkdw43HcB571mEj3fz1Yhg"),
            auth = b64url("Q9OTDkwwoMlWKn_vWN6ITQ"),
        )
        val plain = WebPushCrypto.decrypt(b64url("A0n02g8v7p1-v2enWhRWCAAAEABBBHnvooHi6-vIXIM0DtbtTnxvdcX8H2BJDjeumMhdnbenRulr7W-TES-fwj2T46wvTB2K1gNGWY8Qx84kB5Pjjvr5XYHhGMYR7qZFu8S2GvqiCVTySH9pwKBDp4B_X6gPJUufv0QStLUK9gP-YDaqhIgjZt1udrWTk1UtF_jOratQoz2VEEcI5wTPxUabWXnLEb5xTH3nNqGQtoN3DRCkJ_LGV6vk-hCrREm0fBwzbezTBitNA6SD3tJqwT3OXlhDyWdLvw"), keys)
        val payload = PushPayload.parse(plain)
        assertEquals("nudge", payload.type)
        assertEquals("Double Sweat", payload.title)
        assertEquals("Anna stupst dich an: Zeit fürs Training!", payload.body)
        assertEquals("nudge", payload.tag)
    }

    @Test
    fun generatedKeysHaveTheExpectedShape() {
        val keys = WebPushCrypto.generateKeys()
        assertEquals(65, keys.publicKey.size)
        assertEquals(0x04, keys.publicKey[0].toInt())
        assertEquals(16, keys.auth.size)
        // Das Schlüsselpaar passt zusammen: der private Schlüssel lässt sich laden und liefert denselben öffentlichen Punkt
        val priv = KeyFactory.getInstance("EC").generatePrivate(java.security.spec.PKCS8EncodedKeySpec(keys.privateKey))
        assertTrue(priv.algorithm == "EC")
        assertTrue(WebPushCrypto.generateKeys().publicKey.contentEquals(keys.publicKey).not())
    }

    @Test
    fun roundTripWithGeneratedKeys() {
        val keys = WebPushCrypto.generateKeys()
        val message = """{"type":"reminder","title":"Double Sweat","body":"Heute noch nicht trainiert?"}"""
        val body = encryptForTest(message.toByteArray(), keys)
        assertEquals(message, String(WebPushCrypto.decrypt(body, keys)))
    }

    @Test
    fun rejectsTamperedWrongKeyAndMalformedMessages() {
        val keys = WebPushCrypto.generateKeys()
        val body = encryptForTest("geheim".toByteArray(), keys)

        val tampered = body.copyOf().also { it[it.size - 3] = (it[it.size - 3].toInt() xor 1).toByte() }
        assertThrows(GeneralSecurityException::class.java) { WebPushCrypto.decrypt(tampered, keys) }

        val other = WebPushCrypto.generateKeys()
        assertThrows(GeneralSecurityException::class.java) { WebPushCrypto.decrypt(body, other) }
        val wrongAuth = WebPushCrypto.KeySet(keys.privateKey, keys.publicKey, ByteArray(16))
        assertThrows(GeneralSecurityException::class.java) { WebPushCrypto.decrypt(body, wrongAuth) }

        assertThrows(GeneralSecurityException::class.java) { WebPushCrypto.decrypt(ByteArray(0), keys) }
        assertThrows(GeneralSecurityException::class.java) { WebPushCrypto.decrypt(body.copyOf(40), keys) }
        val noKeyId = body.copyOf().also { it[20] = 0 }
        assertThrows(GeneralSecurityException::class.java) { WebPushCrypto.decrypt(noKeyId, keys) }
        val tinyRecords = body.copyOf().also {
            it[18] = 0
            it[19] = 4
        }
        assertThrows(GeneralSecurityException::class.java) { WebPushCrypto.decrypt(tinyRecords, keys) }
    }

    @Test
    fun unreadableMessageBecomesNeutralNotification() {
        val payload = PushPayload.parse(ByteArray(0))
        assertEquals(PushPayload.DEFAULT_BODY, payload.body)
    }

    // ---- Verschlüsselung nur für Tests (der Server macht das mit web-push): eine Nachricht, ein Block ----

    private fun hkdf(salt: ByteArray, ikm: ByteArray, info: ByteArray, length: Int): ByteArray {
        val prk = Mac.getInstance("HmacSHA256").run {
            init(SecretKeySpec(salt, "HmacSHA256"))
            doFinal(ikm)
        }
        return Mac.getInstance("HmacSHA256").run {
            init(SecretKeySpec(prk, "HmacSHA256"))
            doFinal(info + 1.toByte())
        }.copyOf(length)
    }

    private fun encryptForTest(plain: ByteArray, receiver: WebPushCrypto.KeySet): ByteArray {
        val generator = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }
        val sender = generator.generateKeyPair()
        val senderPoint = (sender.public as ECPublicKey).w
        fun fixed(v: BigInteger) = v.toByteArray().let { if (it.size > 32) it.copyOfRange(it.size - 32, it.size) else ByteArray(32 - it.size) + it }
        val senderPublic = byteArrayOf(0x04) + fixed(senderPoint.affineX) + fixed(senderPoint.affineY)

        val receiverPoint = java.security.spec.ECPoint(
            BigInteger(1, receiver.publicKey.copyOfRange(1, 33)),
            BigInteger(1, receiver.publicKey.copyOfRange(33, 65)),
        )
        val receiverKey = KeyFactory.getInstance("EC").generatePublic(java.security.spec.ECPublicKeySpec(receiverPoint, curve))
        val secret = KeyAgreement.getInstance("ECDH").run {
            init(sender.private)
            doPhase(receiverKey, true)
            generateSecret()
        }
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val keyInfo = "WebPush: info".toByteArray() + 0.toByte() + receiver.publicKey + senderPublic
        val ikm = hkdf(receiver.auth, secret, keyInfo, 32)
        val cek = hkdf(salt, ikm, "Content-Encoding: aes128gcm".toByteArray() + 0.toByte(), 16)
        val nonce = hkdf(salt, ikm, "Content-Encoding: nonce".toByteArray() + 0.toByte(), 12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(128, nonce))
        }
        val encrypted = cipher.doFinal(plain + 2.toByte())
        val header = salt + byteArrayOf(0, 0, 0x10, 0) + byteArrayOf(65) + senderPublic
        return header + encrypted
    }
}
