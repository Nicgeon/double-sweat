package app.doublesweat.mobile.push

import org.json.JSONObject

/** Inhalt einer Push-Nachricht des Servers: {type, title, body, tag?, url?}. */
data class PushPayload(val type: String, val title: String, val body: String, val tag: String?) {
    companion object {
        const val DEFAULT_TITLE = "Double Sweat"
        /** Platzhalter für unlesbare Nachrichten; die Anzeige ersetzt ihn durch den übersetzten Text (push_default_body). */
        const val DEFAULT_BODY = "You have a new notification."
        private const val MAX_TITLE = 80
        private const val MAX_BODY = 240
        private const val MAX_TAG = 64
        private val TYPES = setOf("nudge", "reminder", "debt_created", "test")

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
            )
        }

        /** Ohne Steuerzeichen, gekürzt; leer wird zu null. Android zeigt Text an, es gibt kein HTML zu entschärfen. */
        private fun clean(value: String, max: Int): String? {
            val text = value.filter { !it.isISOControl() }.trim()
            return text.take(max).ifEmpty { null }
        }
    }
}
