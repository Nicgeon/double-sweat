package app.doublesweat.mobile.health

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Brücke zum Web: liest aus Health Connect nur Trainingseinheiten (Art, Dauer, Startzeit) der letzten 24 Stunden und
 * nur, wenn man es in der App eingeschaltet und Health Connect es erlaubt hat. Alles bleibt auf dem Gerät; zum Server
 * geht nur, was der Mensch mit einem Check-in abschickt. Die Zuordnung zu den Sportarten steht in [ExerciseMapper].
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val readPermission = HealthPermission.getReadPermission(ExerciseSessionRecord::class)

    override fun handleOnDestroy() {
        scope.cancel()
    }

    /** `available`, `update_required` (Health Connect veraltet) oder `unavailable` (fehlt oder nicht unterstützt). */
    private fun availability(): String =
        when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "unavailable"
        }

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    private suspend fun isGranted(): Boolean =
        try {
            client().permissionController.getGrantedPermissions().contains(readPermission)
        } catch (e: Exception) {
            false
        }

    @PluginMethod
    fun status(call: PluginCall) {
        scope.launch {
            val availability = availability()
            call.resolve(
                JSObject()
                    .put("availability", availability)
                    .put("granted", availability == "available" && isGranted()),
            )
        }
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        scope.launch {
            if (availability() != "available") return@launch call.resolve(JSObject().put("granted", false))
            if (isGranted()) return@launch call.resolve(JSObject().put("granted", true))
            val contract = PermissionController.createRequestPermissionResultContract()
            startActivityForResult(call, contract.createIntent(context, setOf(readPermission)), "permissionResult")
        }
    }

    /** Nach dem Fenster von Health Connect: maßgeblich ist, was Health Connect jetzt tatsächlich erlaubt. */
    @ActivityCallback
    private fun permissionResult(call: PluginCall?, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        if (call == null) return
        scope.launch { call.resolve(JSObject().put("granted", isGranted())) }
    }

    @PluginMethod
    fun recentSessions(call: PluginCall) {
        scope.launch {
            try {
                if (availability() != "available" || !isGranted()) {
                    return@launch call.resolve(JSObject().put("granted", false).put("sessions", JSArray()))
                }
                val now = Instant.now()
                val from = now.minus(Duration.ofHours(ExerciseMapper.WINDOW_HOURS))
                val response =
                    withContext(Dispatchers.IO) {
                        client().readRecords(
                            ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(from, now)),
                        )
                    }
                // Nur das Nötige wird weitergereicht: weder Titel noch Notizen noch die Herkunft des Eintrags
                val raw =
                    response.records.map {
                        RawSession(it.metadata.id, it.exerciseType, it.startTime.toEpochMilli(), it.endTime.toEpochMilli())
                    }
                val sessions = JSArray()
                for (s in ExerciseMapper.pick(raw, now.toEpochMilli())) {
                    sessions.put(
                        JSObject()
                            .put("id", s.id)
                            .put("tag", s.tag)
                            .put("startMs", s.startMs)
                            .put("endMs", s.endMs)
                            .put("minutes", s.minutes),
                    )
                }
                call.resolve(JSObject().put("granted", true).put("sessions", sessions))
            } catch (e: SecurityException) {
                // Die Erlaubnis wurde inzwischen in Health Connect entzogen
                call.resolve(JSObject().put("granted", false).put("sessions", JSArray()))
            } catch (e: Exception) {
                call.reject("Health Connect antwortet nicht.", e)
            }
        }
    }

    /** Öffnet Health Connect (Zugriff für Apps, Daten verwalten). */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            activity.startActivity(HealthConnectClient.getHealthConnectManageDataIntent(context))
            call.resolve()
        } catch (e: Exception) {
            call.reject("Health Connect lässt sich nicht öffnen.", e)
        }
    }

    /** Die Seite von Health Connect im Play Store (bis Android 13 ist es eine App, sonst zum Aktualisieren). */
    @PluginMethod
    fun openStore(call: PluginCall) {
        val market = Uri.parse("market://details?id=$PROVIDER")
        val web = Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER")
        try {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, market))
            } catch (e: ActivityNotFoundException) {
                activity.startActivity(Intent(Intent.ACTION_VIEW, web))
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject("Der Play Store lässt sich nicht öffnen.", e)
        }
    }

    private companion object {
        const val PROVIDER = "com.google.android.apps.healthdata"
    }
}
