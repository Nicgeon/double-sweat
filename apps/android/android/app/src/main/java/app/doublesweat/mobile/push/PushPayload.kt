package app.doublesweat.mobile.push

import org.json.JSONObject

/**
 * Inhalt einer Push-Nachricht des Servers: {type, title, body, tag?, url?}. `url` ist ein Pfad in der App ("/deal"), zu
 * dem der Tipp auf die Benachrichtigung führt; alles, was nicht wie ein App-Pfad aussieht, wird verworfen.
 */
data class PushPayload(val type: String, val title: String, val body: String, val tag: String?, val url: String? = null) {
    companion object {
        const val DEFAULT_TITLE = "Double Sweat"
        /** Platzhalter für unlesbare Nachrichten; die Anzeige ersetzt ihn durch den übersetzten Text (push_default_body). */
        const val DEFAULT_BODY = "You have a new notification."
        private const val MAX_TITLE = 80
        private const val MAX_BODY = 240
        private const val MAX_TAG = 64
        private const val MAX_URL = 200
        /** Ein Pfad innerhalb der App: ein "/" (nicht "//"), danach nur harmlose Zeichen. Kein Schema, kein Host. */
        private val APP_PATH = Regex("^/(?!/)[A-Za-z0-9/_\\-.?=&%]*$")
        /** Alle Arten, die der Server verschickt (modules/push, i18n/notifications.ts); Unbekanntes wird "general". */
        private val TYPES = setOf(
            "nudge", "reminder", "checkin", "goal_reached", "reaction",
            "bet_set", "bet_changed", "reward_set", "debt_redeemed", "reward_received",
            "debt_created", "reward_earned", "week_result",
            "streak_milestone", "streak_broken",
            "partner_joined", "team_dissolved", "test",
        )

        /**
         * Liest die Nachricht, ohne je zu werfen. Alles, was nicht lesbar ist (verschlüsselt ohne passenden
         * Schlüssel, fremdes Format, zu groß), wird zur neutralen Meldung statt zu Zeichensalat oder Absturz.
         */
        fun parse(content: ByteArray): PushPayload {
            val json = try {
                JSONObject(String(content, Charsets.UTF_8))
            } catch (e: Exception) {
                return PushPayload("general", DEFAULT_TITLE, DEFAULT_BODY, null)
            }
            val type = json.optString("type").takeIf { it in TYPES } ?: "general"
            return PushPayload(
                type = type,
                title = clean(json.optString("title"), MAX_TITLE) ?: DEFAULT_TITLE,
                body = clean(json.optString("body"), MAX_BODY) ?: DEFAULT_BODY,
                tag = clean(json.optString("tag"), MAX_TAG),
                url = json.optString("url").takeIf { it.length <= MAX_URL && APP_PATH.matches(it) },
            )
        }

        /** Ohne Steuerzeichen, gekürzt; leer wird zu null. Android zeigt Text an, es gibt kein HTML zu entschärfen. */
        private fun clean(value: String, max: Int): String? {
            val text = value.filter { !it.isISOControl() }.trim()
            return text.take(max).ifEmpty { null }
        }
    }
}
