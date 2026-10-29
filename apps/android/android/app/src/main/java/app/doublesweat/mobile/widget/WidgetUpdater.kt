package app.doublesweat.mobile.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import app.doublesweat.mobile.securestore.Vault

/** Speichert den Stand der Widgets (verschlüsselt im [Vault]) und zeichnet sie neu. */
object WidgetUpdater {
    private const val KEY = "widget.snapshot"

    fun load(context: Context): WidgetSnapshot? =
        try {
            WidgetSnapshot.parse(Vault(context).get(KEY))
        } catch (e: Exception) {
            null
        }

    fun save(context: Context, json: String) {
        Vault(context).put(KEY, json)
        refreshAll(context)
    }

    fun clear(context: Context) {
        Vault(context).remove(KEY)
        refreshAll(context)
    }

    fun refreshAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val snapshot = load(context)
        for ((provider, kind) in PROVIDERS) {
            for (id in manager.getAppWidgetIds(ComponentName(context, provider))) {
                manager.updateAppWidget(id, WidgetRenderer.render(context, kind, snapshot))
            }
        }
    }

    private val PROVIDERS: List<Pair<Class<out AppWidgetProvider>, WidgetRenderer.Kind>> = listOf(
        SmallWidgetProvider::class.java to WidgetRenderer.Kind.SMALL,
        LargeWidgetProvider::class.java to WidgetRenderer.Kind.LARGE,
    )
}

abstract class BaseWidgetProvider(private val kind: WidgetRenderer.Kind) : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val snapshot = WidgetUpdater.load(context)
        for (id in ids) manager.updateAppWidget(id, WidgetRenderer.render(context, kind, snapshot))
    }
}

/** Klein (2×1): Serie und ob man heute schon eingecheckt hat. */
class SmallWidgetProvider : BaseWidgetProvider(WidgetRenderer.Kind.SMALL)

/** Groß (4×2): Wochenfortschritt beider Partner mit Wochenleiste. */
class LargeWidgetProvider : BaseWidgetProvider(WidgetRenderer.Kind.LARGE)
