package app.doublesweat.mobile

import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.webkit.WebView
import app.doublesweat.mobile.health.HealthConnectPlugin
import app.doublesweat.mobile.health.HealthRationale
import app.doublesweat.mobile.push.FcmPlugin
import app.doublesweat.mobile.push.UnifiedPushPlugin
import app.doublesweat.mobile.securestore.SecureStorePlugin
import app.doublesweat.mobile.widget.WidgetPlugin
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Eigene Plugins müssen vor super.onCreate registriert werden
        registerPlugin(SecureStorePlugin::class.java)
        registerPlugin(UnifiedPushPlugin::class.java)
        registerPlugin(WidgetPlugin::class.java)
        registerPlugin(HealthConnectPlugin::class.java)
        registerPlugin(FcmPlugin::class.java) // je nach Build echt (fcm) oder nur eine Attrappe (foss)
        routeHealthRationale(intent)
        super.onCreate(savedInstanceState)

        // Web-Debugging (chrome://inspect) gibt es nur im Debug-Build, nie im Release
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Hintergrund bis die Seite gezeichnet ist: passend zum Systemschema statt eines hellen Blitzes im Dunkelmodus
        val night =
            (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES
        bridge.webView.setBackgroundColor(if (night) 0xFF0B1020.toInt() else 0xFFF2F4F8.toInt())
    }

    override fun onNewIntent(intent: Intent) {
        routeHealthRationale(intent)
        super.onNewIntent(intent)
    }

    /**
     * Fragt Health Connect im Berechtigungsfenster nach dem Datenschutzhinweis der App, kommt es als eigene Aktion an.
     * Daraus wird der Link auf die Seite "Health Connect" der App, den der Rest der App schon versteht.
     */
    private fun routeHealthRationale(intent: Intent?) {
        if (intent != null && HealthRationale.isRationale(intent.action)) {
            intent.action = Intent.ACTION_VIEW
            intent.data = Uri.parse(HealthRationale.DEEP_LINK)
        }
    }
}
