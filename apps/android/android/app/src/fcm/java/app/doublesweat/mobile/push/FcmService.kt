package app.doublesweat.mobile.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.security.GeneralSecurityException

/**
 * Empfängt Nachrichten und neue Tokens von Firebase Cloud Messaging, auch wenn die App nicht läuft. Der Server
 * schickt reine Daten-Nachrichten, deren Inhalt (Feld "p") nach RFC 8291 verschlüsselt ist; Google kann ihn nicht lesen.
 * Die Benachrichtigung baut die App selbst, damit sie im Vorder- und Hintergrund gleich aussieht.
 */
class FcmService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Gilt nur, wenn Push eingeschaltet ist (es gibt Schlüssel); die Oberfläche meldet es beim nächsten Start dem Server
        val store = FcmStore(this)
        if (store.keys() == null) return
        try {
            store.saveToken(token)
        } catch (e: GeneralSecurityException) {
            // Ohne Speicher kein Token: Die nächste Anmeldung in den Einstellungen holt ein neues
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val encoded = message.data["p"] ?: return
        val keys = FcmStore(this).keys() ?: return
        val plain = try {
            WebPushCrypto.decrypt(android.util.Base64.decode(encoded, android.util.Base64.URL_SAFE), keys)
        } catch (e: GeneralSecurityException) {
            ByteArray(0) // nicht entschlüsselbar: neutrale Meldung statt Zeichensalat
        } catch (e: IllegalArgumentException) {
            ByteArray(0)
        }
        Notifier.show(this, PushPayload.parse(plain))
    }
}
