package app.doublesweat.mobile.widget

/** Rechteck in dp. */
data class Box(val x: Float, val y: Float, val w: Float, val h: Float) {
    val right get() = x + w
    val bottom get() = y + h
}

/**
 * Raster der Widgets (Design "Double Sweat Widgets"): Alles in dp auf dem 4-dp-Raster, Innenabstand 16, Radius 24.
 * Der Entwurf rechnet mit Zellen à 88 dp (2×2 = 168×168, 4×2 = 344×168). Launcher geben oft weniger her (eine Zelle
 * ist je nach Gerät 70 bis 90 dp), deshalb gibt es drei Stufen nach Höhe: groß (Entwurf), kompakt und eng. Schrift und
 * Abstände schrumpfen stufenweise, nie stufenlos; nichts wird abgeschnitten, sondern fällt weg (Symbol, Kopfzeile).
 */
object WidgetGeometry {
    const val RADIUS = 24f
    const val DEFAULT_SMALL_W = 168f
    const val DEFAULT_LARGE_W = 344f
    const val DEFAULT_H = 168f

    data class Small(
        val pad: Float,
        val icon: Box?,
        val numeralSize: Float,
        val numeralLine: Float,
        val numeralTop: Float,
        val captionSize: Float,
        val captionLine: Float,
        /** null: kein Platz für die Beschriftung */
        val captionTop: Float?,
        val chip: Box,
        /** Schrift im Chip; ist der lange Text zu breit, nimmt der Painter die Kurzform */
        val chipText: Float,
    )

    fun small(w: Float, h: Float): Small {
        val roomy = h >= 164f && w >= 150f
        val pad = if (roomy) 16f else 12f
        val chipH = if (roomy) 28f else 24f
        val chip = Box(pad, h - pad - chipH, w - 2 * pad, chipH)
        if (roomy) {
            return Small(pad, Box(pad, pad, 24f, 24f), 44f, 48f, pad + 24f + 4f, 14f, 20f, pad + 24f + 4f + 48f, chip, 12f)
        }
        val numeralLine = 40f
        val captionTop = pad + numeralLine
        val showCaption = chip.y >= captionTop + 16f
        return Small(pad, null, 36f, numeralLine, pad, 12f, 16f, if (showCaption) captionTop else null, chip, 12f)
    }

    data class Lane(
        val avatar: Box,
        val text: Box,
        val nameLine: Float,
        val progressLine: Float,
        /** Marker der Wochenleiste: Box der ganzen Leiste, Größe der Marker und Abstand */
        val strip: Box,
        val marker: Float,
        val gap: Float,
    )

    data class Large(val pad: Float, val header: Box?, val lanes: List<Lane>)

    fun large(w: Float, h: Float, lanes: Int): Large {
        val count = lanes.coerceIn(1, 2)
        // Stufen: groß (Entwurf) | kompakt | eng (ohne Kopfzeile)
        val tier = when {
            h >= 160f -> Tier(16f, 20f, 12f, 44f, 32f, 8f, 20f, 16f)
            h >= 120f -> Tier(12f, 16f, 4f, 38f, 28f, 4f, 18f, 14f)
            else -> Tier(10f, 0f, 0f, 36f, 28f, 4f, 18f, 14f)
        }
        val headerBox = if (tier.header > 0f) Box(tier.pad, tier.pad, w - 2 * tier.pad, tier.header) else null
        val fixed = tier.pad + tier.header + tier.headerGap + count * tier.lane + (count - 1) * tier.laneGap + tier.pad
        val extra = (h - fixed).coerceAtLeast(0f)
        val gap = extra / (count + 1)
        var top = tier.pad + tier.header + tier.headerGap + gap
        val rows = (0 until count).map {
            val row = laneRow(w, top, tier)
            top += tier.lane + tier.laneGap + gap
            row
        }
        return Large(tier.pad, headerBox, rows)
    }

    private class Tier(
        val pad: Float,
        val header: Float,
        val headerGap: Float,
        val lane: Float,
        val avatar: Float,
        val laneGap: Float,
        val nameLine: Float,
        val progressLine: Float,
    )

    private fun laneRow(w: Float, top: Float, t: Tier): Lane {
        // Schmale Widgets: erst kleinere Marker, dann auch kleinerer Avatar; der Name behält mindestens 72 dp, wenn es geht
        val levels = listOf(
            Level(18f, 6f, t.avatar, 10f),
            Level(16f, 4f, t.avatar, 10f),
            Level(14f, 3f, minOf(t.avatar, 28f), 8f),
        )
        var chosen = levels.last()
        for (level in levels) {
            val strip = 7 * level.marker + 6 * level.gap
            val textLeft = t.pad + level.avatar + level.space
            if (w - t.pad - strip - level.space - textLeft >= 72f) {
                chosen = level
                break
            }
        }
        val strip = 7 * chosen.marker + 6 * chosen.gap
        val textLeft = t.pad + chosen.avatar + chosen.space
        val stripBox = Box(w - t.pad - strip, top + (t.lane - chosen.marker) / 2f, strip, chosen.marker)
        val avatar = Box(t.pad, top + (t.lane - chosen.avatar) / 2f, chosen.avatar, chosen.avatar)
        val text = Box(textLeft, top, stripBox.x - chosen.space - textLeft, t.lane)
        return Lane(avatar, text, t.nameLine, t.progressLine, stripBox, chosen.marker, chosen.gap)
    }

    private class Level(val marker: Float, val gap: Float, val avatar: Float, val space: Float)
}
