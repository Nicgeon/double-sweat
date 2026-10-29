package app.doublesweat.mobile.push

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.firebase.messaging.FirebaseMessaging
import java.security.GeneralSecurityException
import org.json.JSONObject

/**
 * Push über Firebase Cloud Messaging für Geräte ohne UnifiedPush-Verteiler. Nur im Flavor "fcm".
 * Das Token meldet die Oberfläche dem Server; Inhalte kommen Ende-zu-Ende verschlüsselt (siehe [WebPushCrypto]).
 */
@CapacitorPlugin(name = "Fcm")
class FcmPlugin : Plugin() {
    private val store by lazy { FcmStore(context) }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ok = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
        call.resolve(JSObject().put("available", ok))
    }

    @PluginMethod
    fun register(call: PluginCall) {
        val messaging = FirebaseMessaging.getInstance()
        // Erst jetzt, auf Wunsch der Person, wird bei Google ein Token erzeugt (Auto-Init ist im Manifest aus)
        messaging.isAutoInitEnabled = true
        messaging.token.addOnCompleteListener { task ->
            val token = if (task.isSuccessful) task.result else null
            if (token.isNullOrEmpty()) {
                call.reject("Google hat kein Token geliefert. Ist das Gerät online und sind die Google Play-Dienste aktuell?")
                return@addOnCompleteListener
            }
            try {
                store.saveToken(token)
                val keys = store.ensureKeys()
                call.resolve(toJs(Registration(token, encode(keys.publicKey), encode(keys.auth))))
            } catch (e: GeneralSecurityException) {
                call.reject("Der sichere Speicher des Geräts ist nicht verfügbar.", e)
            }
        }
    }

    @PluginMethod
    fun unregister(call: PluginCall) {
        val messaging = FirebaseMessaging.getInstance()
        messaging.deleteToken().addOnCompleteListener {
            messaging.isAutoInitEnabled = false
            store.clear()
            call.resolve()
        }
    }

    @PluginMethod
    fun current(call: PluginCall) {
        call.resolve(JSObject().put("registration", store.registration()?.let(::toJs) ?: JSONObject.NULL))
    }

    private fun encode(bytes: ByteArray) =
        android.util.Base64.encodeToString(bytes, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)

    private fun toJs(r: Registration) = JSObject().put("endpoint", r.endpoint).apply {
        r.p256dh?.let { put("p256dh", it) }
        r.auth?.let { put("auth", it) }
    }
}
