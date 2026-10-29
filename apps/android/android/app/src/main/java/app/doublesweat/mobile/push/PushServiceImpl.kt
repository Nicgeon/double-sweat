package app.doublesweat.mobile.push

import java.security.GeneralSecurityException
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

/**
 * Empfängt Ereignisse des UnifiedPush-Verteilers, auch wenn die App nicht läuft: neuer Endpunkt, Nachricht,
 * Abmeldung. Nachrichten werden zur Benachrichtigung, Endpunkte werden gemerkt und beim nächsten Start dem Server
 * gemeldet.
 */
class PushServiceImpl : PushService() {
    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        val registration = Registration(endpoint.url, endpoint.pubKeySet?.pubKey, endpoint.pubKeySet?.auth)
        try {
            PushStore(this).save(registration)
        } catch (e: GeneralSecurityException) {
            UnifiedPushPlugin.failed("Der sichere Speicher des Geräts ist nicht verfügbar.")
            return
        }
        UnifiedPushPlugin.registered(registration)
    }

    override fun onMessage(message: PushMessage, instance: String) {
        Notifier.show(this, PushPayload.parse(message.content))
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        UnifiedPushPlugin.failed(
            when (reason) {
                FailedReason.NETWORK -> "Der Verteiler ist ohne Netzverbindung nicht erreichbar."
                FailedReason.ACTION_REQUIRED -> "Der Verteiler braucht eine Eingabe: Öffne seine App und prüfe die Anmeldung."
                FailedReason.VAPID_REQUIRED -> "Dieser Verteiler wird nicht unterstützt (er verlangt einen VAPID-Schlüssel)."
                FailedReason.INTERNAL_ERROR -> "Die Anmeldung beim Verteiler ist fehlgeschlagen."
            },
        )
    }

    override fun onUnregistered(instance: String) {
        // Die Oberfläche merkt es beim nächsten Start: current() liefert dann nichts mehr
        PushStore(this).clear()
    }
}
