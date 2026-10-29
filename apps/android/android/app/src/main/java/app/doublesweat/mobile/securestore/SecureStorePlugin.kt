package app.doublesweat.mobile.securestore

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.GeneralSecurityException
import org.json.JSONObject

/** Brücke zum Web: Zugangsdaten im [Vault] statt in localStorage. */
@CapacitorPlugin(name = "SecureStore")
class SecureStorePlugin : Plugin() {
    private val vault by lazy { Vault(context) }

    @PluginMethod
    fun get(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key fehlt")
        call.resolve(JSObject().put("value", vault.get(PREFIX + key) ?: JSONObject.NULL))
    }

    @PluginMethod
    fun set(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key fehlt")
        val value = call.getString("value") ?: return call.reject("value fehlt")
        try {
            vault.put(PREFIX + key, value)
            call.resolve()
        } catch (e: GeneralSecurityException) {
            call.reject("Der sichere Speicher des Geräts ist nicht verfügbar.", e)
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key fehlt")
        vault.remove(PREFIX + key)
        call.resolve()
    }

    private companion object {
        /** Trennt die Einträge der Oberfläche von denen des Push-Dienstes. */
        const val PREFIX = "web."
    }
}
