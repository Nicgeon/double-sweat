package app.doublesweat.mobile.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetGeometryTest {
    private val widths = listOf(110f, 146f, 168f, 250f, 300f, 344f, 400f, 520f)
    private val heights = listOf(96f, 110f, 120f, 130f, 150f, 168f, 220f, 320f)

    @Test
    fun largeWidgetMatchesTheDesign() {
        val g = WidgetGeometry.large(344f, 168f, 2)
        assertEquals(Box(16f, 16f, 312f, 20f), g.header)
        assertEquals(162f, g.lanes[0].strip.w, 0f)
        assertEquals(18f, g.lanes[0].marker, 0f)
        assertEquals(6f, g.lanes[0].gap, 0f)
        assertEquals(32f, g.lanes[0].avatar.w, 0f)
        assertTrue(g.lanes[1].avatar.y > g.lanes[0].avatar.bottom)
    }

    @Test
    fun largeNeverLeavesThePaddingAndNeverOverlaps() {
        for (w in widths.filter { it >= 250f }) for (h in heights) {
            val g = WidgetGeometry.large(w, h, 2)
            var previousBottom = g.header?.bottom ?: 0f
            for (lane in g.lanes) {
                val tag = "$w x $h"
                assertTrue("Streifen rechts ($tag)", lane.strip.right <= w - g.pad + 0.01f)
                assertTrue("Name vor dem Streifen ($tag)", lane.text.right <= lane.strip.x + 0.01f)
                assertTrue("Name hat Platz ($tag)", lane.text.w >= 40f)
                assertTrue("unten ($tag)", lane.avatar.bottom <= h - g.pad + 0.01f)
                assertTrue("oben ($tag)", lane.avatar.y >= previousBottom - 0.01f)
                assertTrue("Text passt in die Zeile ($tag)", lane.nameLine + lane.progressLine <= lane.text.h + 0.01f)
                previousBottom = lane.avatar.bottom
            }
        }
    }

    @Test
    fun lowLargeWidgetsDropTheHeaderInsteadOfClipping() {
        assertNotNull(WidgetGeometry.large(344f, 168f, 2).header)
        assertNotNull(WidgetGeometry.large(344f, 130f, 2).header)
        assertNull(WidgetGeometry.large(344f, 110f, 2).header)
    }

    @Test
    fun narrowWidgetsShrinkTheMarkersInsteadOfClippingTheName() {
        val narrow = WidgetGeometry.large(250f, 168f, 2).lanes[0]
        assertTrue(narrow.marker < 18f)
        assertTrue(narrow.text.w >= 40f)
        assertEquals(16f, WidgetGeometry.large(300f, 168f, 2).lanes[0].marker, 0f)
    }

    @Test
    fun largeWithOnePersonFits() {
        val g = WidgetGeometry.large(344f, 168f, 1)
        assertEquals(1, g.lanes.size)
        assertTrue(g.lanes[0].avatar.bottom <= 168f - g.pad)
    }

    @Test
    fun smallWidgetMatchesTheDesign() {
        val g = WidgetGeometry.small(168f, 168f)
        assertEquals(16f, g.pad, 0f)
        assertNotNull(g.icon)
        assertEquals(44f, g.numeralSize, 0f)
        assertEquals(28f, g.chip.h, 0f)
        assertEquals(168f - 16f, g.chip.bottom, 0f)
    }

    @Test
    fun smallNeverOverlapsAndKeepsEverythingInside() {
        for (w in widths.filter { it <= 200f }) for (h in heights) {
            val g = WidgetGeometry.small(w, h)
            val tag = "$w x $h"
            assertTrue("Zahl über dem Chip ($tag)", g.numeralTop + g.numeralLine <= g.chip.y + 0.01f)
            g.captionTop?.let {
                assertTrue("Beschriftung nach der Zahl ($tag)", it >= g.numeralTop + g.numeralLine - 0.01f)
                assertTrue("Beschriftung über dem Chip ($tag)", it + g.captionLine <= g.chip.y + 0.01f)
            }
            g.icon?.let { assertTrue("Symbol über der Zahl ($tag)", it.bottom <= g.numeralTop + 0.01f) }
            assertTrue("Chip innen ($tag)", g.chip.right <= w - g.pad + 0.01f && g.chip.bottom <= h - g.pad + 0.01f)
        }
    }

    @Test
    fun smallDropsIconAndCaptionBeforeOverlapping() {
        assertNull(WidgetGeometry.small(110f, 110f).icon)
        assertNotNull(WidgetGeometry.small(110f, 110f).captionTop)
        assertNull(WidgetGeometry.small(110f, 96f).captionTop)
    }
}
