package app.doublesweat.mobile.widget

/** Farben des Designsystems (design/tokens.css) für die Widgets, hell und dunkel. Reine Werte, ohne Android-Klassen. */
class WidgetPalette private constructor(
    val surface: Int,
    val border: Int,
    val ink: Int,
    val muted: Int,
    val surface2: Int,
    val borderStrong: Int,
    val doneSoft: Int,
    val doneInk: Int,
    private val identities: Map<String, Identity>,
) {
    /** Identitätsfarbe: Fläche, Text darauf, Text/Linie auf hellem oder dunklem Grund. */
    class Identity(val fill: Int, val onFill: Int, val ink: Int)

    fun identity(name: String): Identity = identities[name] ?: identities.getValue("graphite")

    companion object {
        private fun id(fill: Long, on: Long, ink: Long) = Identity(argb(fill), argb(on), argb(ink))
        private fun argb(rgb: Long): Int = (0xFF000000 or rgb).toInt()

        val LIGHT = WidgetPalette(
            surface = 0xFFFFFFFF.toInt(),
            border = 0x260E1424,
            ink = 0xFF0E1424.toInt(),
            muted = 0xFF475069.toInt(),
            surface2 = 0xFFE6EAF2.toInt(),
            borderStrong = 0x990E1424.toInt(),
            doneSoft = 0xFFD9F4EC.toInt(),
            doneInk = 0xFF0A6A59.toInt(),
            identities = mapOf(
                "ember" to id(0xE8531F, 0x0E1424, 0xB23508),
                "tide" to id(0x2B4BDB, 0xFFFFFF, 0x2441C4),
                "orchid" to id(0x9255D7, 0xFFFFFF, 0x7A30CF),
                "moss" to id(0x5B9924, 0x0E1424, 0x44741B),
                "sky" to id(0x1792CC, 0x0E1424, 0x116E9A),
                "cocoa" to id(0x9F6741, 0xFFFFFF, 0x8F5C3A),
                "graphite" to id(0x637595, 0xFFFFFF, 0x566581),
            ),
        )

        val DARK = WidgetPalette(
            surface = 0xFF141B2E.toInt(),
            border = 0x1FFFFFFF,
            ink = 0xFFEDF0F7.toInt(),
            muted = 0xFFA6B0C6.toInt(),
            surface2 = 0xFF1E2740.toInt(),
            borderStrong = 0x73FFFFFF,
            // done-soft ist im Dunkel halbtransparent (2fd1b0 mit 17 %), hier auf der Fläche vorgemischt
            doneSoft = 0xFF1A3A40.toInt(),
            doneInk = 0xFF5EE0C4.toInt(),
            identities = mapOf(
                "ember" to id(0xFF7A45, 0x0B1020, 0xFF9A70),
                "tide" to id(0x6E8BFF, 0x0B1020, 0x9DB0FF),
                "orchid" to id(0xC2A0E9, 0x0B1020, 0xCDB1ED),
                "moss" to id(0x73C22D, 0x0B1020, 0x8CCD53),
                "sky" to id(0x4CB9EB, 0x0B1020, 0x6CC6EF),
                "cocoa" to id(0xCFA58A, 0x0B1020, 0xD8B59F),
                "graphite" to id(0xA4AFC2, 0x0B1020, 0xB4BDCD),
            ),
        )

        fun of(night: Boolean) = if (night) DARK else LIGHT
    }
}
