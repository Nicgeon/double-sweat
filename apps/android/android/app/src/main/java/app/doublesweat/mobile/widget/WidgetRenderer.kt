package app.doublesweat.mobile.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import app.doublesweat.mobile.MainActivity
import app.doublesweat.mobile.R

/** Baut die Ansichten der beiden Widgets aus dem letzten Stand. */
object WidgetRenderer {
    enum class Kind { SMALL, LARGE }

    // Identitätsfarben des Designsystems (design/tokens.css), hell und dunkel
    private val LIGHT = mapOf(
        "ember" to "#e8531f", "tide" to "#2b4bdb", "orchid" to "#9255d7", "moss" to "#5b9924",
        "sky" to "#1792cc", "cocoa" to "#9f6741", "graphite" to "#637595",
    )
    private val DARK = mapOf(
        "ember" to "#ff7a45", "tide" to "#6e8bff", "orchid" to "#c2a0e9", "moss" to "#73c22d",
        "sky" to "#4cb9eb", "cocoa" to "#cfa58a", "graphite" to "#a4afc2",
    )

    fun render(context: Context, kind: Kind, snapshot: WidgetSnapshot?): RemoteViews {
        val views = RemoteViews(
            context.packageName,
            if (kind == Kind.SMALL) R.layout.widget_small else R.layout.widget_large,
        )
        val open = PendingIntent.getActivity(
            context,
            kind.ordinal,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        views.setOnClickPendingIntent(R.id.widget_root, open)

        val empty = snapshot == null || snapshot.lanes.isEmpty()
        views.setViewVisibility(R.id.widget_empty, if (empty) View.VISIBLE else View.GONE)
        views.setViewVisibility(R.id.widget_content, if (empty) View.GONE else View.VISIBLE)
        if (snapshot == null || empty) return views

        when (kind) {
            Kind.SMALL -> {
                views.setTextViewText(R.id.small_streak, "🔥 ${snapshot.streak}")
                views.setTextViewText(R.id.small_streak_label, snapshot.streakText)
                views.setTextViewText(R.id.small_today, snapshot.todayText)
                views.setTextColor(
                    R.id.small_today,
                    ContextCompat.getColor(context, if (snapshot.todayDone) R.color.widget_ok else R.color.widget_text),
                )
            }
            Kind.LARGE -> {
                views.setTextViewText(R.id.large_week, snapshot.weekLabel)
                views.setTextViewText(R.id.large_streak, "🔥 ${snapshot.streakText}")
                views.setTextViewText(R.id.large_updated, snapshot.updatedLabel)
                lane(context, views, snapshot.lanes[0], R.id.lane1_name, R.id.lane1_progress, R.id.lane1_dots)
                val second = snapshot.lanes.getOrNull(1)
                views.setViewVisibility(R.id.lane2, if (second == null) View.GONE else View.VISIBLE)
                if (second != null) lane(context, views, second, R.id.lane2_name, R.id.lane2_progress, R.id.lane2_dots)
            }
        }
        return views
    }

    private fun lane(context: Context, views: RemoteViews, lane: WidgetLane, name: Int, progress: Int, dots: Int) {
        views.setTextViewText(name, lane.name)
        views.setTextViewText(progress, lane.progress)
        val night =
            (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val hex = (if (night) DARK else LIGHT)[lane.color] ?: (if (night) "#a4afc2" else "#637595")
        val laneColor = Color.parseColor(hex)
        val faint = ContextCompat.getColor(context, R.color.widget_faint)
        val text = SpannableStringBuilder()
        lane.days.forEachIndexed { i, state ->
            val start = text.length
            text.append(WidgetSnapshot.symbol(state))
            if (i < lane.days.size - 1) text.append("  ")
            text.setSpan(
                ForegroundColorSpan(if (state == "done" || state == "today") laneColor else faint),
                start,
                start + 1,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
        }
        views.setTextViewText(dots, text)
    }
}
