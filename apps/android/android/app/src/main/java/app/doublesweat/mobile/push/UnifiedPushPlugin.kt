package app.doublesweat.mobile.push

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import app.doublesweat.mobile.R
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.security.GeneralSecurityException
import org.json.JSONObject
import org.unifiedpush.android.connector.INSTANCE_DEFAULT
import org.unifiedpush.android.connector.UnifiedPush

/**
 * Brücke zum Web für Push über UnifiedPush: Verteiler (z. B. ntfy) finden, anmelden, abmelden. Die Nachrichten selbst
 * kommen im [PushServiceImpl] an. Den Endpunkt meldet das Web dem Server; hier wird nur gewartet, bis der Verteiler
 * ihn liefert.
 */
@CapacitorPlugin(
    name = "UnifiedPush",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")],
)
class UnifiedPushPlugin : Plugin() {
    private val handler = Handler(Looper.getMainLooper())
    private val store by lazy { PushStore(context) }
    private var pending: PluginCall? = null
    private val timeout = Runnable { finish(null, "Der Verteiler hat nicht geantwortet. Ist seine App eingerichtet?") }

    override fun load() {
        instance = this
        Notifier.ensureChannels(context)
    }

    override fun handleOnDestroy() {
        if (instance === this) instance = null
        handler.removeCallbacks(timeout)
    }

    @PluginMethod
    fun getDistributors(call: PluginCall) {
        val own = context.packageName
        val list = JSArray()
        for (id in UnifiedPush.getDistributors(context)) {
            if (id == own) continue
            list.put(JSObject().put("id", id).put("label", label(id)))
        }
        call.resolve(
            JSObject().put("distributors", list).put("current", UnifiedPush.getSavedDistributor(context) ?: JSONObject.NULL),
        )
    }

    @PluginMethod
    fun register(call: PluginCall) {
        val distributor = call.getString("distributor") ?: UnifiedPush.getSavedDistributor(context)
            ?: return call.reject("Es ist kein Verteiler gewählt.")
        // Nur Apps, die sich als Verteiler anbieten
        if (distributor !in UnifiedPush.getDistributors(context)) {
            return call.reject("Dieser Verteiler ist nicht installiert.")
        }
        synchronized(this) {
            if (pending != null) return call.reject("Eine Anmeldung läuft bereits.")
            call.setKeepAlive(true)
            pending = call
        }
        handler.postDelayed(timeout, REGISTER_TIMEOUT_MS)
        UnifiedPush.saveDistributor(context, distributor)
        UnifiedPush.register(context, INSTANCE_DEFAULT, context.getString(R.string.app_name))
    }

    @PluginMethod
    fun unregister(call: PluginCall) {
        UnifiedPush.unregister(context, INSTANCE_DEFAULT)
        store.clear()
        call.resolve()
    }

    @PluginMethod
    fun current(call: PluginCall) {
        val registration = store.load()
        call.resolve(JSObject().put("registration", registration?.let(::toJs) ?: JSONObject.NULL))
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationsGranted()) {
            return call.resolve(JSObject().put("granted", true))
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult")
    }

    @PermissionCallback
    private fun notificationPermissionResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", notificationsGranted()))
    }

    private fun notificationsGranted() =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED

    private fun label(packageName: String): String = try {
        val pm = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) {
        packageName
    }

    /** Beendet die wartende Anmeldung (Erfolg mit [registration], sonst mit [error]). */
    private fun finish(registration: Registration?, error: String?) {
        val call = synchronized(this) { pending.also { pending = null } } ?: return
        handler.removeCallbacks(timeout)
        // Kam der Endpunkt schon früher an (und diesmal nur verspätet), gilt er weiter
        val result = registration ?: store.load()
        if (result != null) call.resolve(toJs(result)) else call.reject(error ?: "Die Anmeldung ist fehlgeschlagen.")
    }

    private fun toJs(r: Registration) = JSObject().put("endpoint", r.endpoint).apply {
        r.p256dh?.let { put("p256dh", it) }
        r.auth?.let { put("auth", it) }
    }

    companion object {
        private const val REGISTER_TIMEOUT_MS = 20_000L

        @Volatile
        private var instance: UnifiedPushPlugin? = null

        fun registered(registration: Registration) {
            instance?.let { plugin -> plugin.handler.post { plugin.finish(registration, null) } }
        }

        fun failed(message: String) {
            instance?.let { plugin ->
                plugin.handler.post {
                    val call = synchronized(plugin) { plugin.pending.also { plugin.pending = null } } ?: return@post
                    plugin.handler.removeCallbacks(plugin.timeout)
                    call.reject(message)
                }
            }
        }
    }
}
