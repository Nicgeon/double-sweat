package app.doublesweat.mobile.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetSnapshotTest {
    private val valid = """{"updatedLabel":"Stand 19:04","weekLabel":"KW 44","streak":3,"streakText":"Wochen in Serie",
        "todayDone":true,"todayText":"Heute geschafft","lanes":[
        {"name":"Anna","color":"ember","progress":"2 von 3 Tagen","days":["done","done","today","future","future","future","future"]},
        {"name":"Ben","color":"tide","progress":"kein Ziel","days":["missed","done","today","future","future","future","future"]}]}"""

    @Test
    fun readsAValidSnapshot() {
        val s = WidgetSnapshot.parse(valid)!!
        assertEquals(3, s.streak)
        assertTrue(s.todayDone)
        assertEquals(listOf("Anna", "Ben"), s.lanes.map { it.name })
        assertEquals("ember", s.lanes[0].color)
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
    fun symbolsPerDayState() {
        assertEquals("●", WidgetSnapshot.symbol("done"))
        assertEquals("◎", WidgetSnapshot.symbol("today"))
        assertEquals("○", WidgetSnapshot.symbol("missed"))
        assertEquals("○", WidgetSnapshot.symbol("future"))
    }
}
