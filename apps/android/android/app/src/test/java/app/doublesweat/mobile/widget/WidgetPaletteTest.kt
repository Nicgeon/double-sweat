package app.doublesweat.mobile.widget

import kotlin.math.pow
import org.junit.Assert.assertTrue
import org.junit.Test

/** Wie `pnpm design:check`: Text auf den Flächen der Widgets erreicht in beiden Themes 4,5:1, Grafiken 3:1. */
class WidgetPaletteTest {
    private fun lum(c: Int): Double {
        fun ch(v: Int): Double {
            val s = v / 255.0
            return if (s <= 0.03928) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * ch(c shr 16 and 0xFF) + 0.7152 * ch(c shr 8 and 0xFF) + 0.0722 * ch(c and 0xFF)
    }

    private fun ratio(a: Int, b: Int): Double {
        val la = lum(a)
        val lb = lum(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    private val names = listOf("ember", "tide", "orchid", "moss", "sky", "cocoa", "graphite")

    @Test
    fun textOnSurfacesIsReadable() {
        for (p in listOf(WidgetPalette.LIGHT, WidgetPalette.DARK)) {
            assertTrue(ratio(p.ink, p.surface) >= 4.5)
            assertTrue(ratio(p.muted, p.surface) >= 4.5)
            assertTrue(ratio(p.muted, p.surface2) >= 4.5)
            assertTrue(ratio(p.doneInk, p.doneSoft) >= 4.5)
        }
    }

    @Test
    fun identityColorsWork() {
        for (p in listOf(WidgetPalette.LIGHT, WidgetPalette.DARK)) for (n in names) {
            val i = p.identity(n)
            assertTrue("$n: Text auf Fläche", ratio(i.onFill, i.fill) >= 4.5)
            assertTrue("$n: Ring auf Karte", ratio(i.ink, p.surface) >= 3.0)
            assertTrue("$n: Fläche auf Karte", ratio(i.fill, p.surface) >= 2.5)
        }
    }

    @Test
    fun unknownColorFallsBackToGraphite() {
        assertTrue(WidgetPalette.LIGHT.identity("nope").fill == WidgetPalette.LIGHT.identity("graphite").fill)
    }
}
