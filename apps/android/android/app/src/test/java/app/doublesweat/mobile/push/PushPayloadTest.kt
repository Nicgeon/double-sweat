package app.doublesweat.mobile.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushPayloadTest {
    private fun parse(json: String) = PushPayload.parse(json.toByteArray())

    @Test
    fun readsServerMessage() {
        val p = parse("""{"type":"nudge","title":"Double Sweat","body":"Anna stupst dich an: Zeit fürs Training!","tag":"nudge"}""")
        assertEquals("nudge", p.type)
        assertEquals("Double Sweat", p.title)
        assertEquals("Anna stupst dich an: Zeit fürs Training!", p.body)
        assertEquals("nudge", p.tag)
    }

    @Test
    fun readsAllKindsOfMessagesTheServerSends() {
        for (type in listOf("checkin", "goal_reached", "reaction", "bet_set", "debt_redeemed", "reward_received", "week_result", "streak_broken", "partner_joined")) {
            assertEquals(type, parse("""{"type":"$type","title":"a","body":"b"}""").type)
        }
    }

    @Test
    fun readsAnAppPathAsTarget() {
        assertEquals("/deal", parse("""{"type":"nudge","url":"/deal"}""").url)
        assertEquals("/?photo=abc123", parse("""{"type":"checkin","url":"/?photo=abc123"}""").url)
    }

    @Test
    fun dropsEverythingThatIsNotAnAppPath() {
        for (url in listOf("https://evil.example/", "//evil.example", "deal", "javascript:alert(1)", "/a b", "/${"x".repeat(300)}")) {
            assertNull(url, parse("""{"type":"nudge","url":"$url"}""").url)
        }
        assertNull(parse("""{"type":"nudge"}""").url)
    }

    @Test
    fun unknownTypeBecomesGeneral() {
        assertEquals("general", parse("""{"type":"x","title":"a","body":"b"}""").type)
    }

    @Test
    fun missingFieldsFallBackToNeutralText() {
        val p = parse("{}")
        assertEquals(PushPayload.DEFAULT_TITLE, p.title)
        assertEquals(PushPayload.DEFAULT_BODY, p.body)
        assertNull(p.tag)
    }

    @Test
    fun unreadableContentIsNeutralNotGarbage() {
        // z. B. verschlüsselte Bytes, die nicht entschlüsselt werden konnten
        val p = PushPayload.parse(byteArrayOf(0x17, -0x56, 0x01, 0x7f, -0x80))
        assertEquals("general", p.type)
        assertEquals(PushPayload.DEFAULT_BODY, p.body)
    }

    @Test
    fun controlCharactersAreStrippedAndLengthIsLimited() {
        val p = parse("""{"type":"test","title":"A\u0000B\nC","body":"${"x".repeat(1000)}","tag":"${"t".repeat(500)}"}""")
        assertEquals("ABC", p.title)
        assertEquals(240, p.body.length)
        assertEquals(64, p.tag?.length)
    }

    @Test
    fun blankTitleUsesDefault() {
        assertEquals(PushPayload.DEFAULT_TITLE, parse("""{"title":"   ","body":"b"}""").title)
    }
}
