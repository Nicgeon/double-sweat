package app.doublesweat.mobile.widget

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.GeneralSecurityException

/** Brücke zum Web: Die Oberfläche schreibt den Stand für die Widgets (siehe [WidgetSnapshot]). */
@CapacitorPlugin(name = "Widget")
class WidgetPlugin : Plugin() {
    @PluginMethod
    fun update(call: PluginCall) {
        val snapshot = call.getString("snapshot") ?: return call.reject("snapshot fehlt")
        // Unbrauchbares wird gar nicht erst gespeichert
        if (WidgetSnapshot.parse(snapshot) == null) return call.reject("snapshot ungültig")
        try {
            WidgetUpdater.save(context, snapshot)
            call.resolve()
        } catch (e: GeneralSecurityException) {
            call.reject("Der sichere Speicher des Geräts ist nicht verfügbar.", e)
        }
    }

    @PluginMethod
    fun clear(call: PluginCall) {
        WidgetUpdater.clear(context)
        call.resolve()
    }
}
