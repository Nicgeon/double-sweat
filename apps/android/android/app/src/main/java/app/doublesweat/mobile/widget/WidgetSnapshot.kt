package app.doublesweat.mobile.widget

import org.json.JSONObject

/** Eine Person auf dem Widget. Alle Texte kommen fertig übersetzt aus der App (Sprache des Kontos). */
data class WidgetLane(
    val name: String,
    /** Farb-Kennung des Designsystems (ember, tide, ...) */
    val color: String,
    val progress: String,
    /** Sieben Tage Mo..So: done, today, missed oder future */
    val days: List<String>,
)

/**
 * Stand, den die App dem Widget übergibt. Das Widget holt nichts selbst vom Server und hat keine Zugangsdaten:
 * Es zeigt den letzten Stand, den die App beim Öffnen geschrieben hat.
 */
data class WidgetSnapshot(
    val updatedLabel: String,
    val weekLabel: String,
    val streak: Int,
    val streakText: String,
    val todayDone: Boolean,
    val todayText: String,
    val lanes: List<WidgetLane>,
) {
    companion object {
        private const val MAX_TEXT = 60
        private val DAY_STATES = setOf("done", "today", "missed", "future")

        /** Liest den Stand, ohne je zu werfen. Unbrauchbares ergibt null (das Widget zeigt dann den Leerzustand). */
        fun parse(json: String?): WidgetSnapshot? {
            if (json.isNullOrBlank() || json.length > 8192) return null
            return try {
                val o = JSONObject(json)
                val lanesJson = o.getJSONArray("lanes")
                val lanes = (0 until minOf(lanesJson.length(), 2)).map { i ->
                    val l = lanesJson.getJSONObject(i)
                    val days = l.getJSONArray("days")
                    WidgetLane(
                        name = text(l, "name"),
                        color = text(l, "color"),
                        progress = text(l, "progress"),
                        days = (0 until 7).map { d ->
                            days.optString(d).takeIf { it in DAY_STATES } ?: "future"
                        },
                    )
                }
                WidgetSnapshot(
                    updatedLabel = text(o, "updatedLabel"),
                    weekLabel = text(o, "weekLabel"),
                    streak = o.optInt("streak", 0).coerceIn(0, 9999),
                    streakText = text(o, "streakText"),
                    todayDone = o.optBoolean("todayDone", false),
                    todayText = text(o, "todayText"),
                    lanes = lanes,
                )
            } catch (e: Exception) {
                null
            }
        }

        private fun text(o: JSONObject, key: String): String =
            o.optString(key).filter { !it.isISOControl() }.trim().take(MAX_TEXT)

        /** Zeichen für einen Tag in der Wochenleiste. */
        fun symbol(state: String): String = when (state) {
            "done" -> "●"
            "today" -> "◎"
            else -> "○"
        }
    }
}
