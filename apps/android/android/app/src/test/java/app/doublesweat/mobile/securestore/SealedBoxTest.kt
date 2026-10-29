package app.doublesweat.mobile.securestore

import java.security.GeneralSecurityException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class SealedBoxTest {
    private fun newKey(): SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    @Test
    fun roundTrip() {
        val key = newKey()
        val sealed = SealedBox.seal(key, "auth", "geheim ✓".toByteArray())
        assertEquals("geheim ✓", String(SealedBox.open(key, "auth", sealed)))
    }

    @Test
    fun sameValueSealedTwiceDiffers() {
        val key = newKey()
        val a = SealedBox.seal(key, "auth", "x".toByteArray())
        val b = SealedBox.seal(key, "auth", "x".toByteArray())
        assertFalse(a.contentEquals(b))
    }

    @Test
    fun valueDoesNotOpenUnderAnotherEntryName() {
        val key = newKey()
        val sealed = SealedBox.seal(key, "auth", "token".toByteArray())
        assertThrows(GeneralSecurityException::class.java) { SealedBox.open(key, "push.registration", sealed) }
    }

    @Test
    fun tamperedValueIsRejected() {
        val key = newKey()
        val sealed = SealedBox.seal(key, "auth", "token".toByteArray())
        val tampered = sealed.copyOf().also { it[it.size - 1] = (it[it.size - 1].toInt() xor 1).toByte() }
        assertThrows(GeneralSecurityException::class.java) { SealedBox.open(key, "auth", tampered) }
    }

    @Test
    fun otherKeyIsRejected() {
        val sealed = SealedBox.seal(newKey(), "auth", "token".toByteArray())
        assertThrows(GeneralSecurityException::class.java) { SealedBox.open(newKey(), "auth", sealed) }
    }

    @Test
    fun truncatedOrUnknownFormatIsRejected() {
        val key = newKey()
        assertThrows(GeneralSecurityException::class.java) { SealedBox.open(key, "auth", ByteArray(0)) }
        assertThrows(GeneralSecurityException::class.java) { SealedBox.open(key, "auth", ByteArray(40) { 9 }) }
    }

    @Test
    fun emptyValueRoundTrips() {
        val key = newKey()
        assertArrayEquals(ByteArray(0), SealedBox.open(key, "auth", SealedBox.seal(key, "auth", ByteArray(0))))
    }
}
