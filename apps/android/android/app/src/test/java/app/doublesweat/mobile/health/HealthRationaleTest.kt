package app.doublesweat.mobile.health

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HealthRationaleTest {
    @Test
    fun recognizesBothActionsOfHealthConnect() {
        assertTrue(HealthRationale.isRationale("androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"))
        assertTrue(HealthRationale.isRationale("android.intent.action.VIEW_PERMISSION_USAGE"))
    }

    @Test
    fun ignoresEverythingElse() {
        assertFalse(HealthRationale.isRationale(null))
        assertFalse(HealthRationale.isRationale("android.intent.action.MAIN"))
        assertFalse(HealthRationale.isRationale("android.intent.action.VIEW"))
    }

    @Test
    fun theLinkPointsToTheHealthPageOfTheApp() {
        assertEquals("doublesweat://open?path=%2Fprofile%2Fhealth", HealthRationale.DEEP_LINK)
    }
}
