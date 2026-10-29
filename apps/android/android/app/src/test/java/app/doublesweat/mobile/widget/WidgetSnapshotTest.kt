package app.doublesweat.mobile.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetSnapshotTest {
    private val valid = """{"updatedLabel":"Stand 19:04","weekLabel":"KW 44","streak":3,"streakText":"Wochen in Serie",
        "todayDone":true,"todayText":"Heute geschafft","lanes":[
        {"name":"Anna (Du)","initials":"A","slot":1,"color":"ember","progress":"2 von 3 Tagen","days":["done","done","today","future","future","future","future"]},
        {"name":"Ben","initials":"B","slot":2,"color":"tide","progress":"kein Ziel","days":["missed","done","today","future","future","future","future"]}]}"""

    @Test
    fun readsAValidSnapshot() {
        val s = WidgetSnapshot.parse(valid)!!
        assertEquals(3, s.streak)
        assertTrue(s.todayDone)
        assertEquals(listOf("Anna (Du)", "Ben"), s.lanes.map { it.name })
        assertEquals("ember", s.lanes[0].color)
        assertEquals(listOf(1, 2), s.lanes.map { it.slot })
        assertEquals("A", s.lanes[0].initials)
        assertEquals(7, s.lanes[1].days.size)
    }

    @Test
    fun rejectsGarbageWithoutThrowing() {
        assertNull(WidgetSnapshot.parse(null))
        assertNull(WidgetSnapshot.parse(""))
        assertNull(WidgetSnapshot.parse("kein json"))
        assertNull(WidgetSnapshot.parse("""{"lanes":"x"}"""))
        assertNull(WidgetSnapshot.parse("x".repeat(9000)))
    }

    @Test
    fun cleansTextAndUnknownDayStates() {
        val json = """{"streak":-5,"lanes":[{"name":"A\u0007nna${"x".repeat(100)}","color":"?","progress":"","days":["done","weird"]}]}"""
        val s = WidgetSnapshot.parse(json)!!
        assertEquals(0, s.streak)
        assertEquals(60, s.lanes[0].name.length)
        assertTrue(!s.lanes[0].name.contains('\u0007'))
        assertEquals(listOf("done", "future", "future", "future", "future", "future", "future"), s.lanes[0].days)
    }

    @Test
    fun showsAtMostTwoPeople() {
        val lane = """{"name":"X","color":"ember","progress":"","days":[]}"""
        val s = WidgetSnapshot.parse("""{"lanes":[$lane,$lane,$lane]}""")!!
        assertEquals(2, s.lanes.size)
    }

    @Test
    fun describesTheWidgetForScreenReaders() {
        val text = WidgetSnapshot.parse(valid)!!.describe()
        assertTrue(text.contains("3 Wochen in Serie"))
        assertTrue(text.contains("Anna (Du): 2 von 3 Tagen"))
        assertTrue(text.contains("Heute geschafft"))
    }

    @Test
    fun slotDefaultsToThePositionAndIgnoresOddValues() {
        val s = WidgetSnapshot.parse("""{"lanes":[{"name":"A","slot":7,"days":[]},{"name":"B","days":[]}]}""")!!
        assertEquals(listOf(1, 2), s.lanes.map { it.slot })
    }
}
