package app.doublesweat.mobile.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.res.ResourcesCompat
import androidx.core.graphics.PathParser
import app.doublesweat.mobile.R

/**
 * Zeichnet die Widgets nach dem Design "Double Sweat Widgets": Archivo für Zahlen, Atkinson für Text, Lucide-Icons,
 * Kreis (Platz 1) und abgerundetes Quadrat (Platz 2). Ein Bild statt RemoteViews-Textfeldern, damit Schrift, Icons und
 * gestrichelte Marker exakt dem Entwurf entsprechen und nichts abgeschnitten wird.
 */
class WidgetPainter(context: Context, private val night: Boolean, private val density: Float) {
    private val palette = WidgetPalette.of(night)
    private val archivo: Typeface = font(context, R.font.archivo_extrabold, Typeface.DEFAULT_BOLD)
    private val atkinson: Typeface = font(context, R.font.atkinson_regular, Typeface.DEFAULT)
    private val atkinsonBold: Typeface = font(context, R.font.atkinson_bold, Typeface.DEFAULT_BOLD)

    private fun font(context: Context, id: Int, fallback: Typeface): Typeface =
        try {
            ResourcesCompat.getFont(context, id) ?: fallback
        } catch (e: Exception) {
            fallback
        }

    private fun dp(v: Float) = v * density

    fun small(snapshot: WidgetSnapshot?, wDp: Float, hDp: Float): Bitmap {
        val (bitmap, canvas) = surface(wDp, hDp)
        if (snapshot == null || snapshot.lanes.isEmpty()) {
            empty(canvas, wDp, hDp)
            return bitmap
        }
        val g = WidgetGeometry.small(wDp, hDp)
        g.icon?.let { icon(canvas, FLAME, it.x, it.y, 24f, 2f, palette.ink) }
        val numeral = paint(archivo, g.numeralSize, palette.ink).apply { fontFeatureSettings = "tnum" }
        text(canvas, snapshot.streak.toString(), g.pad, g.numeralTop, g.numeralLine, numeral)
        g.captionTop?.let {
            text(canvas, snapshot.streakText, g.pad, it, g.captionLine, paint(atkinson, g.captionSize, palette.muted), wDp - 2 * g.pad)
        }
        chip(canvas, g.chip, snapshot.todayText, snapshot.todayShort, snapshot.todayDone, g.chipText)
        return bitmap
    }

    fun large(snapshot: WidgetSnapshot?, wDp: Float, hDp: Float): Bitmap {
        val (bitmap, canvas) = surface(wDp, hDp)
        if (snapshot == null || snapshot.lanes.isEmpty()) {
            empty(canvas, wDp, hDp)
            return bitmap
        }
        val g = WidgetGeometry.large(wDp, hDp, snapshot.lanes.size)
        g.header?.let { header ->
            // Kopf: Symbol und Serie links, Stand rechts
            icon(canvas, FLAME, header.x, header.y + (header.h - 16f) / 2f, 16f, 2.25f, palette.ink)
            val updated = paint(atkinson, 12f, palette.muted)
            val updatedWidth = updated.measureText(snapshot.updatedLabel) / density
            text(canvas, snapshot.updatedLabel, header.right - updatedWidth, header.y, header.h, updated)
            text(
                canvas, "${snapshot.streak} ${snapshot.streakText}", header.x + 22f, header.y, header.h,
                paint(atkinsonBold, 14f, palette.ink), header.w - 22f - updatedWidth - 8f,
            )
        }
        snapshot.lanes.forEachIndexed { i, lane -> lane(canvas, lane, g.lanes[i]) }
        return bitmap
    }

    private fun lane(canvas: Canvas, lane: WidgetLane, g: WidgetGeometry.Lane) {
        val identity = palette.identity(lane.color)
        // Avatar: Kreis (Platz 1) oder abgerundetes Quadrat (Platz 2)
        val a = g.avatar
        fill(canvas, a.x, a.y, a.w, a.h, if (lane.slot == 2) a.w * 0.31f else a.w / 2f, identity.fill)
        val initials = paint(archivo, if (a.w >= 32f) 14f else 12f, identity.onFill)
        val iw = initials.measureText(lane.initials) / density
        text(canvas, lane.initials, a.x + (a.w - iw) / 2f, a.y, a.h, initials)
        // Name und Fortschritt als Block, in der Zeile mittig
        val block = g.nameLine + g.progressLine
        val top = g.text.y + (g.text.h - block) / 2f
        text(canvas, lane.name, g.text.x, top, g.nameLine, paint(atkinsonBold, 14f, palette.ink), g.text.w)
        text(canvas, lane.progress, g.text.x, top + g.nameLine, g.progressLine, paint(atkinson, 12f, palette.muted), g.text.w)
        // Wochenleiste
        lane.days.forEachIndexed { i, state ->
            val x = g.strip.x + i * (g.marker + g.gap)
            marker(canvas, x, g.strip.y, g.marker, lane.slot, state, identity)
        }
    }

    private fun marker(canvas: Canvas, x: Float, y: Float, size: Float, slot: Int, state: String, identity: WidgetPalette.Identity) {
        val radius = if (slot == 2) size / 3f else size / 2f
        when (state) {
            "done" -> {
                fill(canvas, x, y, size, size, radius, identity.fill)
                val mark = size * 2f / 3f
                icon(canvas, CHECK, x + (size - mark) / 2f, y + (size - mark) / 2f, mark, 3.5f, identity.onFill)
            }
            "today" -> stroke(canvas, x, y, size, radius, identity.ink, 2f, null)
            "missed" -> fill(canvas, x, y, size, size, radius, palette.surface2)
            else -> stroke(canvas, x, y, size, radius, palette.borderStrong, 1.5f, floatArrayOf(dp(3f), dp(3f)))
        }
    }

    private fun chip(canvas: Canvas, box: Box, longLabel: String, shortLabel: String, done: Boolean, size: Float) {
        val paintText = paint(atkinsonBold, size, if (done) palette.doneInk else palette.muted)
        val inner = box.h.let { 8f + 16f + 4f }
        // Passt der lange Text nicht, gilt die Kurzform (nie eine abgeschnittene Beschriftung)
        var label = longLabel
        if (inner + paintText.measureText(label) / density + 10f > box.w && shortLabel.isNotEmpty()) label = shortLabel
        val width = minOf(box.w, inner + paintText.measureText(label) / density + 10f)
        val top = (box.h - 16f) / 2f
        fill(canvas, box.x, box.y, width, box.h, box.h / 2f, if (done) palette.doneSoft else palette.surface2)
        icon(canvas, if (done) CIRCLE_CHECK else CLOCK, box.x + 8f, box.y + top, 16f, 2.5f, if (done) palette.doneInk else palette.muted)
        text(canvas, label, box.x + inner, box.y, box.h, paintText, width - inner - 10f)
    }

    private fun empty(canvas: Canvas, wDp: Float, hDp: Float) {
        icon(canvas, FLAME, wDp / 2f - 16f, hDp / 2f - 44f, 32f, 2f, palette.muted)
        val paint = paint(atkinson, 14f, palette.muted)
        val width = (wDp - 40f)
        val layout = StaticLayout.Builder.obtain(emptyText, 0, emptyText.length, paint, dp(width).toInt())
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .setMaxLines(3)
            .setEllipsize(TextUtils.TruncateAt.END)
            .build()
        canvas.save()
        canvas.translate(dp(20f), dp(hDp / 2f - 4f))
        layout.draw(canvas)
        canvas.restore()
    }

    /** Text für den Leerzustand; wird vom Renderer gesetzt (Sprache des Geräts). */
    var emptyText: String = ""

    // ----- Grundformen -----

    private fun surface(wDp: Float, hDp: Float): Pair<Bitmap, Canvas> {
        val bitmap = Bitmap.createBitmap(dp(wDp).toInt().coerceAtLeast(1), dp(hDp).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        fill(canvas, 0f, 0f, wDp, hDp, WidgetGeometry.RADIUS, palette.surface)
        // Haarlinie wie bei den Karten der App
        stroke(canvas, 0f, 0f, 0f, WidgetGeometry.RADIUS, palette.border, 1f, null, wDp, hDp)
        return bitmap to canvas
    }

    private fun paint(typeface: Typeface, sizeDp: Float, color: Int) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        this.typeface = typeface
        textSize = dp(sizeDp)
        this.color = color
    }

    private fun fill(canvas: Canvas, x: Float, y: Float, w: Float, h: Float, radius: Float, color: Int) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
        canvas.drawRoundRect(dp(x), dp(y), dp(x + w), dp(y + h), dp(radius), dp(radius), p)
    }

    /** Linie innen am Rand (wie `inset box-shadow` im Entwurf). */
    private fun stroke(canvas: Canvas, x: Float, y: Float, size: Float, radius: Float, color: Int, width: Float, dash: FloatArray?, w: Float = size, h: Float = size) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = dp(width)
            this.color = color
            if (dash != null) pathEffect = DashPathEffect(dash, 0f)
        }
        val inset = width / 2f
        canvas.drawRoundRect(dp(x + inset), dp(y + inset), dp(x + w - inset), dp(y + h - inset), dp(radius - inset), dp(radius - inset), p)
    }

    /** Eine Textzeile: vertikal mittig in einer Zeile der Höhe `lineH` ab `top` (dp), einzeilig mit Auslassung. */
    private fun text(canvas: Canvas, value: String, x: Float, top: Float, lineH: Float, paint: TextPaint, maxWidth: Float? = null) {
        val shown = if (maxWidth == null) value else TextUtils.ellipsize(value, paint, dp(maxWidth.coerceAtLeast(0f)), TextUtils.TruncateAt.END).toString()
        val metrics = paint.fontMetrics
        val baseline = dp(top) + (dp(lineH) - (metrics.descent - metrics.ascent)) / 2f - metrics.ascent
        canvas.drawText(shown, dp(x), baseline, paint)
    }

    /** Lucide-Icon (24er-Raster) in der Größe `size` dp; `strokeWidth` in Raster-Einheiten (Strich 2 bei 24). */
    private fun icon(canvas: Canvas, paths: List<String>, x: Float, y: Float, size: Float, strokeWidth: Float, color: Int) {
        val scale = dp(size) / 24f
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            this.strokeWidth = strokeWidth
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            this.color = color
        }
        canvas.save()
        canvas.translate(dp(x), dp(y))
        canvas.scale(scale, scale)
        for (d in paths) PathParser.createPathFromPathData(d)?.let { canvas.drawPath(it, p) }
        canvas.restore()
    }

    private companion object {
        val FLAME = listOf("M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4")
        val CHECK = listOf("M20 6 9 17l-5-5")
        val CIRCLE_CHECK = listOf("M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20", "m9 12 2 2 4-4")
        val CLOCK = listOf("M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20", "M12 6v6l4 2")
    }
}
