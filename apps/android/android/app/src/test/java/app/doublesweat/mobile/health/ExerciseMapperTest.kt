package app.doublesweat.mobile.health

import androidx.health.connect.client.records.ExerciseSessionRecord as Exercise
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExerciseMapperTest {
    private val now = 1_800_000_000_000L
    private val minute = 60_000L
    private val hour = 3_600_000L

    private fun session(id: String, type: Int, endAgoMin: Long, minutes: Long) =
        RawSession(id, type, now - endAgoMin * minute - minutes * minute, now - endAgoMin * minute)

    @Test
    fun everyKindOfExerciseGoesToASportOfTheApp() {
        val expected =
            mapOf(
                Exercise.EXERCISE_TYPE_RUNNING to "laufen",
                Exercise.EXERCISE_TYPE_RUNNING_TREADMILL to "laufen",
                Exercise.EXERCISE_TYPE_BIKING to "rad",
                Exercise.EXERCISE_TYPE_BIKING_STATIONARY to "rad",
                Exercise.EXERCISE_TYPE_SWIMMING_POOL to "schwimmen",
                Exercise.EXERCISE_TYPE_SWIMMING_OPEN_WATER to "schwimmen",
                Exercise.EXERCISE_TYPE_YOGA to "yoga",
                Exercise.EXERCISE_TYPE_PILATES to "yoga",
                Exercise.EXERCISE_TYPE_STRETCHING to "yoga",
                Exercise.EXERCISE_TYPE_STRENGTH_TRAINING to "kraft",
                Exercise.EXERCISE_TYPE_WEIGHTLIFTING to "kraft",
                Exercise.EXERCISE_TYPE_CALISTHENICS to "kraft",
                Exercise.EXERCISE_TYPE_BOOT_CAMP to "kraft",
                Exercise.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING to "cardio",
                Exercise.EXERCISE_TYPE_ELLIPTICAL to "cardio",
                Exercise.EXERCISE_TYPE_ROWING_MACHINE to "cardio",
                Exercise.EXERCISE_TYPE_EXERCISE_CLASS to "cardio",
                Exercise.EXERCISE_TYPE_DANCING to "cardio",
            )
        for ((type, tag) in expected) assertEquals("Typ $type", tag, ExerciseMapper.tagOf(type))
    }

    @Test
    fun everythingElseIsMiscellaneous() {
        assertEquals("sonstiges", ExerciseMapper.tagOf(Exercise.EXERCISE_TYPE_OTHER_WORKOUT))
        assertEquals("sonstiges", ExerciseMapper.tagOf(Exercise.EXERCISE_TYPE_WALKING))
        assertEquals("sonstiges", ExerciseMapper.tagOf(Exercise.EXERCISE_TYPE_HIKING))
        assertEquals("sonstiges", ExerciseMapper.tagOf(Exercise.EXERCISE_TYPE_TENNIS))
        assertEquals("sonstiges", ExerciseMapper.tagOf(-1))
    }

    @Test
    fun theTagsAreTheOnesTheServerKnows() {
        val known = setOf("kraft", "cardio", "laufen", "rad", "schwimmen", "yoga", "sonstiges")
        for (type in 0..100) assertTrue("Typ $type", ExerciseMapper.tagOf(type) in known)
    }

    @Test
    fun durationIsRoundedToWholeMinutes() {
        assertEquals(0, ExerciseMapper.minutes(0, 29_999))
        assertEquals(1, ExerciseMapper.minutes(0, 30_000))
        assertEquals(32, ExerciseMapper.minutes(0, 32 * minute + 10_000))
        assertEquals(33, ExerciseMapper.minutes(0, 32 * minute + 40_000))
    }

    @Test
    fun offersOnlyRecentFinishedSessionsOfEnoughLengthNewestFirst() {
        val picked =
            ExerciseMapper.pick(
                listOf(
                    session("alt", Exercise.EXERCISE_TYPE_RUNNING, endAgoMin = 25 * 60, minutes = 40),
                    session("kurz", Exercise.EXERCISE_TYPE_RUNNING, endAgoMin = 30, minutes = 3),
                    session("morgens", Exercise.EXERCISE_TYPE_YOGA, endAgoMin = 8 * 60, minutes = 30),
                    session("zuletzt", Exercise.EXERCISE_TYPE_BIKING, endAgoMin = 20, minutes = 45),
                    RawSession("laeuft", Exercise.EXERCISE_TYPE_RUNNING, now - 10 * minute, now + 5 * minute),
                    RawSession("leer", Exercise.EXERCISE_TYPE_RUNNING, now - hour, now - hour),
                ),
                now,
            )
        assertEquals(listOf("zuletzt", "morgens"), picked.map { it.id })
        assertEquals(listOf("rad", "yoga"), picked.map { it.tag })
        assertEquals(listOf(45, 30), picked.map { it.minutes })
    }

    @Test
    fun keepsAtMostFiveSuggestions() {
        val many = (1..9).map { session("s$it", Exercise.EXERCISE_TYPE_RUNNING, endAgoMin = it * 60L, minutes = 20) }
        val picked = ExerciseMapper.pick(many, now)
        assertEquals(ExerciseMapper.MAX_SESSIONS, picked.size)
        assertEquals(listOf("s1", "s2", "s3", "s4", "s5"), picked.map { it.id })
    }

    @Test
    fun nothingToSuggestIsAnEmptyList() {
        assertEquals(emptyList<HealthSession>(), ExerciseMapper.pick(emptyList(), now))
    }
}
