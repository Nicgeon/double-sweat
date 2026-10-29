package app.doublesweat.mobile.push

import android.content.Context
import app.doublesweat.mobile.securestore.Vault
import org.json.JSONObject

/** Adresse, an die der Server Nachrichten schickt, samt Schlüsseln für die Verschlüsselung nach RFC 8291. */
data class Registration(val endpoint: String, val p256dh: String?, val auth: String?)

/**
 * Merkt sich den Endpunkt des Verteilers. Der Push-Dienst bekommt ihn auch dann, wenn die Oberfläche nicht läuft;
 * die App meldet ihn beim nächsten Start beim Server an. Der Endpunkt ist ein Geheimnis (wer ihn kennt, kann
 * Nachrichten schicken) und liegt deshalb im [Vault].
 */
class PushStore(context: Context) {
    private val vault = Vault(context)

    fun load(): Registration? {
        val raw = vault.get(KEY) ?: return null
        return try {
            val json = JSONObject(raw)
            Registration(
                endpoint = json.getString("endpoint"),
                p256dh = json.optString("p256dh").ifEmpty { null },
                auth = json.optString("auth").ifEmpty { null },
            )
        } catch (e: Exception) {
            null
        }
    }

    fun save(registration: Registration) {
        val json = JSONObject().put("endpoint", registration.endpoint)
        registration.p256dh?.let { json.put("p256dh", it) }
        registration.auth?.let { json.put("auth", it) }
        vault.put(KEY, json.toString())
    }

    fun clear() = vault.remove(KEY)

    private companion object {
        const val KEY = "push.registration"
    }
}
