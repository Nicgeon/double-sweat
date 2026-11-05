package app.doublesweat.mobile.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.doublesweat.mobile.MainActivity
import app.doublesweat.mobile.R

/**
 * Zeigt Push-Nachrichten als Benachrichtigung. Jede Gruppe hat einen eigenen Kanal, den man im System einzeln
 * einstellt (Ton, Wichtigkeit, abschalten). Die Gruppen entsprechen den Schaltern in "Benachrichtigungen" der App.
 */
object Notifier {
    private const val CHANNEL_NUDGE = "nudge"
    private const val CHANNEL_REMINDER = "reminder"
    private const val CHANNEL_PARTNER = "partner"
    private const val CHANNEL_REACTION = "reaction"
    private const val CHANNEL_AGREEMENT = "agreement"
    private const val CHANNEL_RESULT = "result"
    private const val CHANNEL_STREAK = "streak"
    private const val CHANNEL_GENERAL = "general"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(CHANNEL_NUDGE, context.getString(R.string.channel_nudge), NotificationManager.IMPORTANCE_HIGH),
                NotificationChannel(CHANNEL_REMINDER, context.getString(R.string.channel_reminder), NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(CHANNEL_PARTNER, context.getString(R.string.channel_partner), NotificationManager.IMPORTANCE_DEFAULT),
                // Reaktionen sind nett, aber nie dringend: leise
                NotificationChannel(CHANNEL_REACTION, context.getString(R.string.channel_reaction), NotificationManager.IMPORTANCE_LOW),
                NotificationChannel(CHANNEL_AGREEMENT, context.getString(R.string.channel_agreement), NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(CHANNEL_RESULT, context.getString(R.string.channel_result), NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(CHANNEL_STREAK, context.getString(R.string.channel_streak), NotificationManager.IMPORTANCE_LOW),
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
        // Der Tipp öffnet die App gleich an der passenden Stelle: doublesweat://open?path=/deal (die Oberfläche prüft den
        // Pfad noch einmal und kennt nur ihre eigenen Seiten). Ohne Pfad öffnet sie sich einfach.
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        payload.url?.let { intent.action = Intent.ACTION_VIEW; intent.data = Uri.parse(openLink(it)) }
        val open = PendingIntent.getActivity(
            context,
            payload.url?.hashCode() ?: 0,
            intent,
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

    /** Link, den die Oberfläche der App öffnet (siehe parseOpenLink in der Web-App). */
    internal fun openLink(path: String) = "doublesweat://open?path=" + Uri.encode(path)

    internal fun channelOf(type: String) = when (type) {
        "nudge" -> CHANNEL_NUDGE
        "reminder" -> CHANNEL_REMINDER
        "checkin", "goal_reached" -> CHANNEL_PARTNER
        "reaction" -> CHANNEL_REACTION
        "bet_set", "bet_changed", "reward_set", "debt_redeemed", "reward_received" -> CHANNEL_AGREEMENT
        "debt_created", "reward_earned", "week_result" -> CHANNEL_RESULT
        "streak_milestone", "streak_broken" -> CHANNEL_STREAK
        else -> CHANNEL_GENERAL
    }
}
