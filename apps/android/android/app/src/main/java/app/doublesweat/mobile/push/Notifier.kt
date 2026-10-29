package app.doublesweat.mobile.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.doublesweat.mobile.MainActivity
import app.doublesweat.mobile.R

/** Zeigt Push-Nachrichten als Benachrichtigung. Jede Art hat einen eigenen Kanal, den man im System einzeln einstellt. */
object Notifier {
    private const val CHANNEL_NUDGE = "nudge"
    private const val CHANNEL_REMINDER = "reminder"
    private const val CHANNEL_GENERAL = "general"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(CHANNEL_NUDGE, context.getString(R.string.channel_nudge), NotificationManager.IMPORTANCE_HIGH),
                NotificationChannel(CHANNEL_REMINDER, context.getString(R.string.channel_reminder), NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(CHANNEL_GENERAL, context.getString(R.string.channel_general), NotificationManager.IMPORTANCE_DEFAULT),
            ),
        )
    }

    fun show(context: Context, payload: PushPayload) {
        // Ohne Erlaubnis (Android 13+) wäre der Aufruf wirkungslos; die In-App-Liste zeigt die Nachricht trotzdem
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ensureChannels(context)
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // Unlesbare Nachrichten zeigen den Standardtext in der Sprache des Geräts
        val body = if (payload.body == PushPayload.DEFAULT_BODY) context.getString(R.string.push_default_body) else payload.body
        val notification = NotificationCompat.Builder(context, channelOf(payload.type))
            .setSmallIcon(R.drawable.ic_stat_sweat)
            .setContentTitle(payload.title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        // Gleicher Tag ersetzt die frühere Benachrichtigung, sonst stapeln sie sich
        val id = payload.tag?.hashCode() ?: System.currentTimeMillis().toInt()
        NotificationManagerCompat.from(context).notify(id, notification)
    }

    private fun channelOf(type: String) = when (type) {
        "nudge" -> CHANNEL_NUDGE
        "reminder" -> CHANNEL_REMINDER
        else -> CHANNEL_GENERAL
    }
}
