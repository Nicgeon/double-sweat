package app.doublesweat.mobile.camera

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.getcapacitor.FileUtils
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.UUID

/**
 * Selfie mit der Kamera-App des Geräts, mit Wunsch nach der Frontkamera. Das Capacitor-Kamera-Plugin kann die Seite
 * unter Android nicht wählen. Die Kamera-App bekommt die üblichen (inoffiziellen, aber weit verbreiteten) Hinweise;
 * hält sich eine App nicht daran, kann man dort mit dem Umschalter zur Frontkamera wechseln. Wie beim normalen Foto
 * braucht die App dafür keine Kamera-Berechtigung.
 */
@CapacitorPlugin(name = "SelfieCamera")
class SelfieCameraPlugin : Plugin() {
    @PluginMethod
    fun take(call: PluginCall) {
        val dir = File(context.cacheDir, "selfie").apply { mkdirs() }
        // Alte Selfies aufräumen: sie liegen nur kurz im Cache
        dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 3_600_000) it.delete() }
        val file = File(dir, "selfie-${UUID.randomUUID()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // Frontkamera gewünscht: je nach Kamera-App wird einer dieser Hinweise verstanden
            putExtra("android.intent.extras.CAMERA_FACING", 1)
            putExtra("android.intent.extras.LENS_FACING_FRONT", 1)
            putExtra("android.intent.extra.USE_FRONT_CAMERA", true)
        }
        call.data.put("path", file.absolutePath)
        try {
            startActivityForResult(call, intent, "selfieResult")
        } catch (e: ActivityNotFoundException) {
            call.reject("Keine Kamera-App gefunden.")
        }
    }

    @ActivityCallback
    private fun selfieResult(call: PluginCall?, result: ActivityResult) {
        call ?: return
        val file = File(call.getString("path") ?: return call.reject("pfad fehlt"))
        if (result.resultCode != Activity.RESULT_OK || !file.exists() || file.length() == 0L) {
            file.delete()
            call.resolve(JSObject().put("webPath", null as String?))
            return
        }
        call.resolve(JSObject().put("webPath", FileUtils.getPortablePath(context, bridge.localUrl, Uri.fromFile(file))))
    }
}
