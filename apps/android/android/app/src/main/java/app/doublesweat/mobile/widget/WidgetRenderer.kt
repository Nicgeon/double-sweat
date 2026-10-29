package app.doublesweat.mobile.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.widget.RemoteViews
import app.doublesweat.mobile.MainActivity
import app.doublesweat.mobile.R

/** Baut die Ansicht eines Widgets: ein gezeichnetes Bild in der Größe des Widgets, ein Tipp öffnet die App. */
object WidgetRenderer {
    enum class Kind { SMALL, LARGE }

    fun render(context: Context, kind: Kind, snapshot: WidgetSnapshot?, options: android.os.Bundle?): RemoteViews {
        val (wDp, hDp) = sizeOf(context, kind, options)
        val night =
            (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val painter = WidgetPainter(context, night, context.resources.displayMetrics.density)
        painter.emptyText = context.getString(R.string.widget_empty)
        val bitmap = if (kind == Kind.SMALL) painter.small(snapshot, wDp, hDp) else painter.large(snapshot, wDp, hDp)

        val views = RemoteViews(context.packageName, R.layout.widget_image)
        views.setImageViewBitmap(R.id.widget_image, bitmap)
        views.setContentDescription(R.id.widget_image, snapshot?.describe() ?: context.getString(R.string.widget_empty))
        val open = PendingIntent.getActivity(
            context,
            kind.ordinal,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        views.setOnClickPendingIntent(R.id.widget_root, open)
        return views
    }

    /** Größe des Widgets in dp aus den Optionen des Launchers; ohne Angabe die Standardgröße des Designs. */
    private fun sizeOf(context: Context, kind: Kind, options: android.os.Bundle?): Pair<Float, Float> {
        val defaultW = if (kind == Kind.SMALL) WidgetGeometry.DEFAULT_SMALL_W else WidgetGeometry.DEFAULT_LARGE_W
        if (options == null) return defaultW to WidgetGeometry.DEFAULT_H
        val landscape = context.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        val w = options.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
        val h = options.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
        // Obergrenze: das Bild darf nicht größer werden, als der Launcher übertragen kann
        return (if (w > 0) w.toFloat() else defaultW).coerceIn(100f, 720f) to (if (h > 0) h.toFloat() else WidgetGeometry.DEFAULT_H).coerceIn(80f, 520f)
    }
}
