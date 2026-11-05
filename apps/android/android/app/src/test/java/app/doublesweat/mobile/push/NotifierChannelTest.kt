package app.doublesweat.mobile.push

import org.junit.Assert.assertEquals
import org.junit.Test

class NotifierChannelTest {
    @Test
    fun everyKindOfMessageGoesToItsGroupChannel() {
        assertEquals("nudge", Notifier.channelOf("nudge"))
        assertEquals("reminder", Notifier.channelOf("reminder"))
        assertEquals("partner", Notifier.channelOf("checkin"))
        assertEquals("partner", Notifier.channelOf("goal_reached"))
        assertEquals("reaction", Notifier.channelOf("reaction"))
        for (type in listOf("bet_set", "bet_changed", "reward_set", "debt_redeemed", "reward_received")) {
            assertEquals(type, "agreement", Notifier.channelOf(type))
        }
        for (type in listOf("debt_created", "reward_earned", "week_result")) {
            assertEquals(type, "result", Notifier.channelOf(type))
        }
        assertEquals("streak", Notifier.channelOf("streak_milestone"))
        assertEquals("streak", Notifier.channelOf("streak_broken"))
    }

    @Test
    fun everythingElseIsGeneral() {
        for (type in listOf("partner_joined", "team_dissolved", "test", "general", "etwas_neues")) {
            assertEquals(type, "general", Notifier.channelOf(type))
        }
    }
}
