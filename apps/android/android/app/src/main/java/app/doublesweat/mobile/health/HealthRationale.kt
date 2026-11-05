package app.doublesweat.mobile.health

/**
 * Health Connect fragt beim Berechtigungsfenster nach einem Datenschutzhinweis der App und startet dafür die Hauptseite
 * mit einer dieser Aktionen. Die App öffnet dann die eigene Seite "Health Connect" (dort steht, was gelesen wird).
 */
object HealthRationale {
    /** Bis Android 13 */
    const val ACTION_SHOW_PERMISSIONS_RATIONALE = "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"

    /** Ab Android 14 (über den Alias der Hauptseite) */
    const val ACTION_VIEW_PERMISSION_USAGE = "android.intent.action.VIEW_PERMISSION_USAGE"

    /** Die Seite der App als Link, wie ihn der Rest der App für Tipps auf Mitteilungen kennt (siehe deeplink.ts). */
    const val DEEP_LINK = "doublesweat://open?path=%2Fprofile%2Fhealth"

    fun isRationale(action: String?): Boolean =
        action == ACTION_SHOW_PERMISSIONS_RATIONALE || action == ACTION_VIEW_PERMISSION_USAGE
}
