package app.doublesweat.mobile.push

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/** Standard-Build: ohne Firebase und ohne Google-Bibliotheken. Die Oberfläche sieht "nicht verfügbar" und nutzt UnifiedPush. */
@CapacitorPlugin(name = "Fcm")
class FcmPlugin : Plugin() {
    @PluginMethod
    fun isAvailable(call: PluginCall) = call.resolve(JSObject().put("available", false))

    @PluginMethod
    fun register(call: PluginCall) = call.reject("Dieser Build enthält kein Firebase Cloud Messaging.")

    @PluginMethod
    fun unregister(call: PluginCall) = call.resolve()

    @PluginMethod
    fun current(call: PluginCall) = call.resolve(JSObject().put("registration", JSONObject.NULL))
}
