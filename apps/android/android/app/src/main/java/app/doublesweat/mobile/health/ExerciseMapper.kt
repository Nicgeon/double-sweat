package app.doublesweat.mobile.health

import androidx.health.connect.client.records.ExerciseSessionRecord as Exercise

/** Ein Trainingseintrag aus Health Connect, auf das Nötige verkleinert (ohne Titel, Notizen und Herkunft). */
data class RawSession(val id: String, val exerciseType: Int, val startMs: Long, val endMs: Long)

/** Ein Training in der Form, die die Oberfläche bekommt: schon der Sportart der App zugeordnet. */
data class HealthSession(val id: String, val tag: String, val startMs: Long, val endMs: Long, val minutes: Int)

/**
 * Ordnet Trainings aus Health Connect den Sportarten der App zu (kraft, cardio, laufen, rad, schwimmen, yoga,
 * sonstiges) und wählt aus, was als Vorschlag taugt. Reine Logik ohne Zugriff auf Health Connect.
 */
object ExerciseMapper {
    /** Kürzeres sind meist Fehlerkennungen und kein Training. */
    const val MIN_MINUTES = 5

    /** Mehr Vorschläge braucht ein Check-in nicht. */
    const val MAX_SESSIONS = 5

    /** Gelesen wird nur das Jüngste: ein Check-in gehört zum heutigen Tag. */
    const val WINDOW_HOURS = 24L

    fun tagOf(exerciseType: Int): String =
        when (exerciseType) {
            Exercise.EXERCISE_TYPE_RUNNING,
            Exercise.EXERCISE_TYPE_RUNNING_TREADMILL -> "laufen"

            Exercise.EXERCISE_TYPE_BIKING,
            Exercise.EXERCISE_TYPE_BIKING_STATIONARY -> "rad"

            Exercise.EXERCISE_TYPE_SWIMMING_POOL,
            Exercise.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "schwimmen"

            Exercise.EXERCISE_TYPE_YOGA,
            Exercise.EXERCISE_TYPE_PILATES,
            Exercise.EXERCISE_TYPE_STRETCHING -> "yoga"

            Exercise.EXERCISE_TYPE_STRENGTH_TRAINING,
            Exercise.EXERCISE_TYPE_WEIGHTLIFTING,
            Exercise.EXERCISE_TYPE_CALISTHENICS,
            Exercise.EXERCISE_TYPE_BOOT_CAMP -> "kraft"

            Exercise.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING,
            Exercise.EXERCISE_TYPE_ELLIPTICAL,
            Exercise.EXERCISE_TYPE_ROWING,
            Exercise.EXERCISE_TYPE_ROWING_MACHINE,
            Exercise.EXERCISE_TYPE_STAIR_CLIMBING,
            Exercise.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE,
            Exercise.EXERCISE_TYPE_EXERCISE_CLASS,
            Exercise.EXERCISE_TYPE_DANCING -> "cardio"

            else -> "sonstiges"
        }

    /** Dauer in ganzen Minuten, gerundet (30 Sekunden und mehr zählen als volle Minute). */
    fun minutes(startMs: Long, endMs: Long): Int = ((endMs - startMs + 30_000L) / 60_000L).toInt()

    /**
     * Die Vorschläge: nur Trainings aus den letzten [WINDOW_HOURS] Stunden, die schon zu Ende sind und mindestens
     * [MIN_MINUTES] dauerten, das jüngste zuerst, höchstens [MAX_SESSIONS].
     */
    fun pick(raw: List<RawSession>, nowMs: Long): List<HealthSession> {
        val from = nowMs - WINDOW_HOURS * 3_600_000L
        return raw
            .filter { it.endMs in from..nowMs && it.endMs > it.startMs }
            .map { HealthSession(it.id, tagOf(it.exerciseType), it.startMs, it.endMs, minutes(it.startMs, it.endMs)) }
            .filter { it.minutes >= MIN_MINUTES }
            .sortedByDescending { it.endMs }
            .take(MAX_SESSIONS)
    }
}
